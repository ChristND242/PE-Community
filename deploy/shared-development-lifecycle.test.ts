import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const execFileAsync = promisify(execFile);

type PackageJson = {
  scripts?: Record<string, string>;
};

async function readJson(path: string): Promise<PackageJson> {
  return JSON.parse(await readFile(new URL(path, rootUrl), 'utf8')) as PackageJson;
}

async function artifactDigest() {
  const distUrl = new URL('packages/shared/dist/', rootUrl);
  const files: string[] = [];

  async function visit(directory: URL, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(new URL(`${entry.name}/`, directory), `${path}/`);
      else if (entry.isFile()) files.push(path);
    }
  }

  await visit(distUrl);
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(file);
    hash.update(await readFile(new URL(file, distUrl)));
  }
  return hash.digest('hex');
}

test('consumer development hooks only perform non-destructive shared preparation', async () => {
  const [root, api, web, worker, shared] = await Promise.all([
    readJson('package.json'),
    readJson('apps/api/package.json'),
    readJson('apps/web/package.json'),
    readJson('apps/worker/package.json'),
    readJson('packages/shared/package.json'),
  ]);
  const prepare = 'pnpm --filter @pe/shared prepare:dev';

  assert.equal(root.scripts?.dev, 'turbo dev --filter=@pe/api --filter=@pe/web --filter=@pe/worker --filter=@pe/shared');
  assert.equal(shared.scripts?.['prepare:dev'], 'node scripts/build.cjs --ensure');
  assert.equal(shared.scripts?.dev, 'node scripts/watch.cjs');
  for (const [consumer, packageJson] of [
    ['api', api],
    ['web', web],
    ['worker', worker],
  ] as const) {
    assert.equal(packageJson.scripts?.predev, prepare, `${consumer} predev must only ensure output`);
    assert.doesNotMatch(packageJson.scripts?.predev ?? '', /@pe\/shared build|clean/);
  }
});

test('shared publisher stages complete output, serializes builds, and never deletes live dist', async () => {
  const publisher = await readFile(
    new URL('packages/shared/scripts/build.cjs', rootUrl),
    'utf8',
  );

  assert.match(publisher, /\.dist-build\.lock/);
  assert.match(publisher, /\.dist-staging-/);
  assert.match(publisher, /mkdirSync\(lockPath\)/);
  assert.match(publisher, /Timed out waiting for the shared-package build lock/);
  assert.match(publisher, /staleLockMs/);
  assert.match(publisher, /writeMetadata\(stagingRoot\)/);
  assert.ok(
    publisher.indexOf("['cjs/package.json', 'esm/package.json']") <
      publisher.indexOf("expectedFiles.filter"),
    'module metadata must publish before JavaScript',
  );
  assert.match(publisher, /renameSync\(temporary, destination\)/);
  assert.doesNotMatch(publisher, /rmSync\(distRoot/);
});

test('development ensure leaves every shared artifact unchanged', async () => {
  const before = await artifactDigest();
  await execFileAsync('pnpm', ['--filter', '@pe/shared', 'prepare:dev'], {
    cwd: rootPath,
  });
  const after = await artifactDigest();
  assert.equal(after, before);

  for (const file of [
    'packages/shared/dist/cjs/package.json',
    'packages/shared/dist/cjs/index.js',
    'packages/shared/dist/esm/package.json',
    'packages/shared/dist/esm/index.js',
    'packages/shared/dist/index.d.ts',
  ]) {
    assert.equal((await stat(new URL(file, rootUrl))).isFile(), true);
  }
});

test('concurrent shared builds serialize and leave complete output', async () => {
  await Promise.all([
    execFileAsync('pnpm', ['--filter', '@pe/shared', 'build'], { cwd: rootPath }),
    execFileAsync('pnpm', ['--filter', '@pe/shared', 'build'], { cwd: rootPath }),
  ]);

  const cjsMetadata = JSON.parse(
    await readFile(new URL('packages/shared/dist/cjs/package.json', rootUrl), 'utf8'),
  ) as { type?: string };
  const esmMetadata = JSON.parse(
    await readFile(new URL('packages/shared/dist/esm/package.json', rootUrl), 'utf8'),
  ) as { type?: string };
  assert.equal(cjsMetadata.type, 'commonjs');
  assert.equal(esmMetadata.type, 'module');
  assert.equal(
    (await stat(new URL('packages/shared/dist/cjs/index.js', rootUrl))).isFile(),
    true,
  );
  assert.equal(
    (await stat(new URL('packages/shared/dist/esm/index.js', rootUrl))).isFile(),
    true,
  );
});

test('worker-start harness checks routes, original errors, hashes, and cleanup', async () => {
  const harness = await readFile(
    new URL('deploy/run-shared-worker-start-contract-test.sh', rootUrl),
    'utf8',
  );

  for (const command of ['pnpm api:dev', 'pnpm web:dev', 'pnpm worker:dev']) {
    assert.match(harness, new RegExp(command.replace(':', '\\:')));
  }
  for (const route of ['/register', '/login', '/admin']) {
    assert.match(harness, new RegExp(route));
  }
  for (const failure of [
    'No such file or directory',
    'dist/esm/index',
    'sourceType: module',
    'Module parse failed',
    'GET /register 500',
    'GET /login 500',
    'GET /admin 500',
  ]) {
    assert.match(harness, new RegExp(failure.replace('/', '\\/')));
  }
  assert.match(harness, /shared-before-worker/);
  assert.match(harness, /shared-after-worker/);
  assert.match(harness, /diff -u/);
  assert.match(harness, /pnpm --filter @pe\/shared dev/);
  assert.match(harness, /touch packages\/shared\/src\/index\.ts/);
  assert.match(harness, /Built shared artifacts through staged publication/);
  assert.match(harness, /BLOCKED:/);
  assert.match(harness, /exit 77/);
  assert.match(harness, /stop_process_group/);
  assert.match(harness, /port_is_listening/);
});
