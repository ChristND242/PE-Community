import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);
const requireFromTest = createRequire(import.meta.url);

type JsonObject = Record<string, unknown>;

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(new URL(path, rootUrl), 'utf8')) as JsonObject;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(new URL(path, rootUrl));
    return true;
  } catch {
    return false;
  }
}

test('shared root exposes distinct loadable CommonJS and ESM contracts', async () => {
  const [packageJson, cjsTsconfig, esmTsconfig, typesTsconfig, cjsOutput, esmOutput] = await Promise.all([
    readJson('packages/shared/package.json'),
    readJson('packages/shared/tsconfig.cjs.json'),
    readJson('packages/shared/tsconfig.esm.json'),
    readJson('packages/shared/tsconfig.types.json'),
    readFile(new URL('packages/shared/dist/cjs/index.js', rootUrl), 'utf8'),
    readFile(new URL('packages/shared/dist/esm/index.js', rootUrl), 'utf8'),
  ]);
  const cjsCompilerOptions = cjsTsconfig.compilerOptions as JsonObject;
  const esmCompilerOptions = esmTsconfig.compilerOptions as JsonObject;
  const typesCompilerOptions = typesTsconfig.compilerOptions as JsonObject;
  const rootExport = (packageJson.exports as Record<string, JsonObject>)['.'];
  const exportedFiles = [
    packageJson.main,
    packageJson.module,
    packageJson.types,
    rootExport.types,
    rootExport.require,
    rootExport.import,
    rootExport.default,
  ];

  assert.equal(packageJson.type, 'commonjs');
  assert.equal(cjsCompilerOptions.module, 'CommonJS');
  assert.equal(cjsCompilerOptions.moduleResolution, 'Node');
  assert.equal(cjsCompilerOptions.outDir, 'dist/cjs');
  assert.equal(esmCompilerOptions.module, 'ES2022');
  assert.equal(esmCompilerOptions.moduleResolution, 'Bundler');
  assert.equal(esmCompilerOptions.outDir, 'dist/esm');
  assert.equal(typesCompilerOptions.declaration, true);
  assert.equal(typesCompilerOptions.emitDeclarationOnly, true);
  assert.equal(typesCompilerOptions.outDir, 'dist');
  assert.equal(packageJson.main, './dist/cjs/index.js');
  assert.equal(packageJson.module, './dist/esm/index.js');
  assert.equal(packageJson.types, './dist/index.d.ts');
  assert.equal(rootExport.require, './dist/cjs/index.js');
  assert.equal(rootExport.import, './dist/esm/index.js');
  assert.equal(rootExport.default, './dist/cjs/index.js');
  assert.notEqual(rootExport.require, rootExport.import);

  for (const exportedFile of exportedFiles) {
    assert.equal(typeof exportedFile, 'string');
    assert.equal(
      await pathExists(`packages/shared/${String(exportedFile).replace(/^\.\//, '')}`),
      true,
      `shared export target must exist: ${String(exportedFile)}`,
    );
  }

  assert.match(cjsOutput, /^"use strict";/);
  assert.match(cjsOutput, /Object\.defineProperty\(exports, "__esModule"/);
  assert.match(esmOutput, /^export const DEFAULT_COMMUNITY_ID/);
  assert.doesNotMatch(cjsOutput, /(?:^|\n)\s*(?:import|export)\s/m);
  for (const output of [cjsOutput, esmOutput]) {
    assert.doesNotMatch(
      output,
      /webpackHot|module\.hot|react-refresh|RefreshRuntime|Refresh Boundary/,
    );
  }

  const cjs = requireFromTest(
    fileURLToPath(new URL('packages/shared/dist/cjs/index.js', rootUrl)),
  ) as Record<string, unknown>;
  const esm = await import(new URL('packages/shared/dist/esm/index.js', rootUrl).href) as Record<string, unknown>;
  const expectedSymbols = ['DEFAULT_COMMUNITY_ID', 'PERMISSIONS', 'renderBrandedEmail'];
  for (const symbol of expectedSymbols) {
    assert.ok(symbol in cjs, `CommonJS output must export ${symbol}`);
    assert.ok(symbol in esm, `ESM output must export ${symbol}`);
  }
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
});

test('shared source remains framework-neutral and consumers build the package first', async () => {
  const [
    sharedIndex,
    sharedEmail,
    apiPackage,
    workerPackage,
    webPackage,
    webNextConfig,
  ] = await Promise.all([
    readFile(new URL('packages/shared/src/index.ts', rootUrl), 'utf8'),
    readFile(new URL('packages/shared/src/email.ts', rootUrl), 'utf8'),
    readJson('apps/api/package.json'),
    readJson('apps/worker/package.json'),
    readJson('apps/web/package.json'),
    readFile(new URL('apps/web/next.config.ts', rootUrl), 'utf8'),
  ]);
  const sharedSource = `${sharedIndex}\n${sharedEmail}`;
  const forbiddenSourcePatterns = [
    /from\s+['"]react['"]/,
    /from\s+['"]next(?:\/[^'"]*)?['"]/,
    /['"]use client['"]/,
    /\bwindow\./,
    /\bdocument\./,
    /\bnavigator\./,
    /import\.meta/,
    /module\.hot/,
    /webpackHot/,
    /react-refresh/,
    /RefreshRuntime/,
  ];
  const sharedBuild = 'pnpm --filter @pe/shared build';

  for (const pattern of forbiddenSourcePatterns) {
    assert.doesNotMatch(sharedSource, pattern);
  }
  assert.doesNotMatch(
    webNextConfig,
    /transpilePackages\s*:\s*\[[^\]]*['"]@pe\/shared['"]/s,
    'Next must consume the already-compiled package instead of applying its dev transform',
  );

  for (const [consumer, packageJson] of [
    ['api', apiPackage],
    ['worker', workerPackage],
    ['web', webPackage],
  ] as const) {
    const scripts = packageJson.scripts as Record<string, string>;
    assert.ok(
      scripts.build?.includes(sharedBuild),
      `${consumer} build must compile @pe/shared before consuming it`,
    );
    assert.equal(
      scripts.predev,
      'pnpm --filter @pe/shared prepare:dev',
      `${consumer} development must non-destructively ensure @pe/shared before consuming it`,
    );
  }
});

test('bounded local development contract checks the real API and Web commands', async () => {
  const harness = await readFile(
    new URL('deploy/run-shared-package-dev-contract-test.sh', rootUrl),
    'utf8',
  );

  assert.match(harness, /pnpm api:dev/);
  assert.match(harness, /pnpm web:dev/);
  assert.match(harness, /\/admin/);
  assert.match(harness, /pe_session=audit-placeholder/);
  assert.match(harness, /sha256sum packages\/shared\/dist\/cjs\/index\.js/);
  assert.match(harness, /sha256sum packages\/shared\/dist\/esm\/index\.js/);
  assert.match(harness, /curl --fail-with-body/);
  assert.match(harness, /GET \/admin 500/);
  assert.match(harness, /BLOCKED:/);
  assert.match(harness, /exit 77/);
  assert.match(harness, /GET \/admin/);
  assert.match(harness, /import\\\.meta|webpackHot/);
  assert.match(harness, /trap cleanup EXIT INT TERM/);
  assert.match(harness, /stop_process_group "\$api_pid"/);
  assert.match(harness, /stop_process_group "\$web_pid"/);
  assert.match(harness, /kill -TERM "-\$\{pid\}"/);
  assert.match(harness, /kill -KILL "-\$\{pid\}"/);
});

test('actual Node and Webpack resolution selects the intended package condition', async () => {
  const apiRequire = createRequire(new URL('apps/api/package.json', rootUrl));
  const workerRequire = createRequire(new URL('apps/worker/package.json', rootUrl));
  assert.match(apiRequire.resolve('@pe/shared'), /packages\/shared\/dist\/cjs\/index\.js$/);
  assert.match(workerRequire.resolve('@pe/shared'), /packages\/shared\/dist\/cjs\/index\.js$/);

  await execFileAsync(
    process.execPath,
    ['deploy/shared-webpack-resolution.test.cjs'],
    { cwd: fileURLToPath(rootUrl) },
  );
});
