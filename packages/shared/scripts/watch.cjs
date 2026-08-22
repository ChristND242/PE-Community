const { watch } = require('node:fs');
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');

const packageRoot = resolve(__dirname, '..');
const sourceRoot = resolve(packageRoot, 'src');
let building = false;
let rebuildQueued = false;
let timer;

function runBuild() {
  if (building) {
    rebuildQueued = true;
    return;
  }
  building = true;
  const child = spawn(process.execPath, [resolve(__dirname, 'build.cjs')], {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  child.once('exit', (code) => {
    building = false;
    if (code !== 0) process.stderr.write(`Shared watch build failed with exit code ${code}.\n`);
    if (rebuildQueued) {
      rebuildQueued = false;
      runBuild();
    }
  });
}

function queueBuild() {
  clearTimeout(timer);
  timer = setTimeout(runBuild, 100);
}

const initial = spawn(process.execPath, [resolve(__dirname, 'build.cjs'), '--ensure'], {
  cwd: packageRoot,
  stdio: 'inherit',
});

initial.once('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  process.stdout.write('Watching shared source with staged publication.\n');
  watch(sourceRoot, { recursive: true }, (_event, filename) => {
    if (filename && filename.endsWith('.ts')) queueBuild();
  });
});
