const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { dirname, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const packageRoot = resolve(__dirname, '..');
const distRoot = resolve(packageRoot, 'dist');
const lockPath = resolve(packageRoot, '.dist-build.lock');
const ensureOnly = process.argv.includes('--ensure');
const lockTimeoutMs = 30_000;
const staleLockMs = 5 * 60_000;
const expectedFiles = [
  'cjs/package.json',
  'cjs/email.js',
  'cjs/index.js',
  'esm/package.json',
  'esm/email.js',
  'esm/index.js',
  'email.d.ts',
  'index.d.ts',
];

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function outputIsComplete(root = distRoot) {
  if (
    !expectedFiles.every((file) => {
      const path = resolve(root, file);
      return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
    })
  ) {
    return false;
  }

  try {
    const cjsMetadata = JSON.parse(readFileSync(resolve(root, 'cjs/package.json'), 'utf8'));
    const esmMetadata = JSON.parse(readFileSync(resolve(root, 'esm/package.json'), 'utf8'));
    return cjsMetadata.type === 'commonjs' && esmMetadata.type === 'module';
  } catch {
    return false;
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function recoverStaleLock() {
  try {
    const metadata = JSON.parse(readFileSync(resolve(lockPath, 'owner.json'), 'utf8'));
    const age = Date.now() - Number(metadata.createdAt);
    if (age > staleLockMs && !processExists(Number(metadata.pid))) {
      rmSync(lockPath, { recursive: true, force: true });
      return true;
    }
  } catch {
    try {
      if (Date.now() - statSync(lockPath).mtimeMs > staleLockMs) {
        rmSync(lockPath, { recursive: true, force: true });
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function acquireLock() {
  const startedAt = Date.now();
  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(
        resolve(lockPath, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, createdAt: Date.now() })}\n`,
        'utf8',
      );
      return;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      if (recoverStaleLock()) continue;
      if (Date.now() - startedAt >= lockTimeoutMs) {
        throw new Error('Timed out waiting for the shared-package build lock.');
      }
      sleep(100);
    }
  }
}

function runTypeScript(config, outDir) {
  const tsc = require.resolve('typescript/bin/tsc');
  const result = spawnSync(
    process.execPath,
    [tsc, '-p', config, '--outDir', outDir],
    { cwd: packageRoot, encoding: 'utf8', stdio: 'pipe' },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Shared ${config} compilation failed with exit code ${result.status}.`);
  }
}

function writeMetadata(stagingRoot) {
  mkdirSync(resolve(stagingRoot, 'cjs'), { recursive: true });
  mkdirSync(resolve(stagingRoot, 'esm'), { recursive: true });
  writeFileSync(
    resolve(stagingRoot, 'cjs/package.json'),
    `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    resolve(stagingRoot, 'esm/package.json'),
    `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
    'utf8',
  );
}

function publishFile(stagingRoot, file) {
  const source = resolve(stagingRoot, file);
  const destination = resolve(distRoot, file);
  const temporary = `${destination}.publish-${process.pid}`;
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, temporary);
  renameSync(temporary, destination);
}

function publish(stagingRoot) {
  mkdirSync(distRoot, { recursive: true });

  // Metadata is always present before a newly published JavaScript file is visible.
  for (const file of ['cjs/package.json', 'esm/package.json']) {
    publishFile(stagingRoot, file);
  }
  for (const file of expectedFiles.filter((file) => !file.endsWith('package.json'))) {
    publishFile(stagingRoot, file);
  }
}

function removeStagingDirectories(current) {
  for (const entry of readdirSync(packageRoot)) {
    if (entry.startsWith('.dist-staging-') && resolve(packageRoot, entry) !== current) {
      rmSync(resolve(packageRoot, entry), { recursive: true, force: true });
    }
  }
}

acquireLock();
let stagingRoot;
try {
  if (ensureOnly && outputIsComplete()) {
    process.stdout.write('Shared development artifacts are already complete.\n');
    process.exitCode = 0;
  } else {
    stagingRoot = resolve(packageRoot, `.dist-staging-${process.pid}-${Date.now()}`);
    removeStagingDirectories(stagingRoot);
    mkdirSync(stagingRoot, { recursive: true });
    writeMetadata(stagingRoot);
    runTypeScript('tsconfig.cjs.json', resolve(stagingRoot, 'cjs'));
    runTypeScript('tsconfig.esm.json', resolve(stagingRoot, 'esm'));
    runTypeScript('tsconfig.types.json', stagingRoot);
    if (!outputIsComplete(stagingRoot)) {
      throw new Error('Shared staging output is incomplete; live artifacts were preserved.');
    }
    publish(stagingRoot);
    if (!outputIsComplete()) {
      throw new Error('Published shared output failed validation.');
    }
    process.stdout.write(
      `${ensureOnly ? 'Prepared' : 'Built'} shared artifacts through staged publication.\n`,
    );
  }
} finally {
  if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
  rmSync(lockPath, { recursive: true, force: true });
}
