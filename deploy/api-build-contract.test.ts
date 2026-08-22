import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);
const baseTsconfigUrl = new URL('tsconfig.base.json', rootUrl);
const apiTsconfigUrl = new URL('apps/api/tsconfig.json', rootUrl);
const apiPackageUrl = new URL('apps/api/package.json', rootUrl);
const sharedPackageUrl = new URL('packages/shared/package.json', rootUrl);
const apiDockerfileUrl = new URL('apps/api/Dockerfile', rootUrl);
const apiDistUrl = new URL('apps/api/dist/', rootUrl);

type JsonObject = Record<string, unknown>;

async function readJson(url: URL): Promise<JsonObject> {
  return JSON.parse(await readFile(url, 'utf8')) as JsonObject;
}

async function pathExists(url: URL): Promise<boolean> {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory()
      ? filesBelow(new URL(`${entry.name}/`, directory), `${path}/`)
      : [path];
  }));
  return files.flat();
}

test('API and shared configuration preserve the compiled package boundary', async () => {
  const [baseTsconfig, apiTsconfig, apiPackage, sharedPackage, dockerfile] = await Promise.all([
    readJson(baseTsconfigUrl),
    readJson(apiTsconfigUrl),
    readJson(apiPackageUrl),
    readJson(sharedPackageUrl),
    readFile(apiDockerfileUrl, 'utf8'),
  ]);

  const baseCompilerOptions = baseTsconfig.compilerOptions as JsonObject;
  const basePaths = (baseCompilerOptions.paths ?? {}) as Record<string, unknown>;
  const apiCompilerOptions = apiTsconfig.compilerOptions as JsonObject;
  const apiScripts = (apiPackage.scripts ?? {}) as Record<string, string>;
  const sharedExports = sharedPackage.exports as Record<string, JsonObject>;
  const sharedRootExport = sharedExports['.'];

  assert.equal(apiCompilerOptions.rootDir, './src');
  assert.equal(apiCompilerOptions.outDir, 'dist');
  assert.deepEqual(apiTsconfig.include, ['src/**/*.ts']);
  assert.ok(
    !Object.values(basePaths).some((value) => JSON.stringify(value).includes('packages/shared/src')),
    'global TypeScript paths must not direct consumers into shared source',
  );

  assert.equal(sharedPackage.main, './dist/cjs/index.js');
  assert.equal(sharedPackage.types, './dist/index.d.ts');
  assert.equal(sharedRootExport.types, './dist/index.d.ts');
  assert.equal(sharedRootExport.require, './dist/cjs/index.js');
  assert.equal(sharedRootExport.import, './dist/esm/index.js');

  const sharedBuild = 'pnpm --filter @pe/shared build';
  const sharedPrepare = 'pnpm --filter @pe/shared prepare:dev';
  const nestBuild = 'nest build';
  assert.equal(apiScripts.predev, sharedPrepare);
  assert.equal(apiScripts.pretest, sharedBuild);
  assert.ok(apiScripts.build.includes(sharedBuild));
  assert.ok(apiScripts.build.indexOf(sharedBuild) < apiScripts.build.indexOf(nestBuild));
  assert.doesNotMatch(
    dockerfile,
    /RUN pnpm --filter @pe\/shared build/,
    'Docker must rely on the API build contract instead of compiling shared twice',
  );
  assert.match(dockerfile, /RUN pnpm --filter @pe\/api build/);
  assert.match(dockerfile, /node apps\/api\/dist\/main\.js/);
  assert.doesNotMatch(dockerfile, /dist\/apps\/api\/src\/main\.js/);
});

test('clean API build emits only the flat API artifact contract', async () => {
  assert.equal(await pathExists(new URL('main.js', apiDistUrl)), true);
  assert.equal(await pathExists(new URL('apps/api/src/main.js', apiDistUrl)), false);

  const emittedFiles = await filesBelow(apiDistUrl);
  assert.ok(!emittedFiles.some((file) => file.startsWith('packages/shared/src/')));
});
