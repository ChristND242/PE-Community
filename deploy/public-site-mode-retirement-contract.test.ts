import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const retiredMode = 'NEXT_PUBLIC_' + 'PUBLIC_SITE_MODE';
const replacementMode = 'APP_' + 'DISTRIBUTION';

const composeContracts = [
  {
    path: 'docker-compose.yml',
    services: ['postgres', 'redis'],
    normalizedSha256: '21512154d27980ac444c62dc447c6d9f61c750a413690246254f45da6c24bc98',
  },
  {
    path: 'docker-compose.prod.yml',
    services: ['postgres', 'redis', 'api', 'worker', 'web', 'caddy'],
    normalizedSha256: '14e2d4cb2e6c2a0db297215052ebfbc827472b71710cf80f50c446d87a0fa2e6',
  },
  {
    path: 'deploy/realtime-production-path.compose.yml',
    services: ['postgres', 'redis', 'api', 'caddy', 'realtime-test'],
    normalizedSha256: '5d69311a326b173cd191d3bb256e08174988f3aeb3cdd8a17c4d9edfdc683267',
  },
] as const;

test('retired public-site mode has no executable or active configuration consumer', async () => {
  const sourceFiles = await executableFiles(['apps', 'packages']);
  const activeConfigurationFiles = [
    '.env.example',
    'apps/web/Dockerfile',
    'docker-compose.yml',
    'docker-compose.prod.yml',
    'package.json',
    'turbo.json',
  ];
  const source = await readAll([...sourceFiles, ...activeConfigurationFiles]);

  assert.doesNotMatch(source, new RegExp(retiredMode));
  assert.doesNotMatch(source, new RegExp(replacementMode));
});

test('Web and Site retain their separated root and route ownership', async () => {
  const [webRoot, webResolver, siteRoot] = await Promise.all([
    read('apps/web/app/page.tsx'),
    read('apps/web/lib/application-entry.ts'),
    read('apps/site/app/page.tsx'),
  ]);

  assert.match(webRoot, /redirect\(await resolveApplicationEntryDestination\(\)\)/);
  assert.doesNotMatch(webRoot, /PublicHomepage|marketing/);
  assert.match(webResolver, /forcePasswordChange[\s\S]*'\/change-password'/);
  assert.match(webResolver, /role === 'owner'[\s\S]*role === 'admin'[\s\S]*'\/admin'/);
  assert.match(webResolver, /role === 'member'[\s\S]*'\/dashboard'/);
  assert.match(siteRoot, /<PublicHomepage \/>/);

  const webPages = await pageFiles('apps/web/app');
  const sitePages = await pageFiles('apps/site/app');
  assert.equal(webPages.length, 42);
  assert.equal(sitePages.length, 28);
  assert.equal(webPages.filter((path) => path.startsWith('docs/')).length, 0);

  for (const path of [
    'page.tsx',
    'setup/page.tsx',
    'login/page.tsx',
    'register/page.tsx',
    'forgot-password/page.tsx',
    'reset-password/page.tsx',
    'verify-email-change/page.tsx',
    'change-password/page.tsx',
    'admin/page.tsx',
    'dashboard/page.tsx',
  ]) {
    assert.ok(webPages.includes(path), `missing Web application route: ${path}`);
  }
});

test('Compose topology and Caddy remain at the audited Phase 5A baseline', async () => {
  for (const contract of composeContracts) {
    const compose = await read(contract.path);
    assert.deepEqual(composeServices(compose), [...contract.services], contract.path);
    assert.equal(sha256(normalizeRetiredMode(compose)), contract.normalizedSha256, contract.path);
    assert.doesNotMatch(compose, new RegExp(retiredMode));
    assert.doesNotMatch(compose, /ghcr\.io|image:\s*[^\s]*placeholder/i);
  }

  const caddy = await read('deploy/Caddyfile');
  assert.equal(sha256(caddy), '7389d26bfbc8274fc2d73e27d09281fbbc0ba9e5c9728f0a1e7e40c9d9b119a2');
  assert.doesNotMatch(caddy, /site:3001|reverse_proxy\s+site/);
  assert.match(caddy, /reverse_proxy web:3000/);
});

test('development orchestration and build ownership remain unchanged', async () => {
  const [rootPackage, webPackage, sitePackage, apiPackage, workerPackage, sharedPackage, dockerfile] = await Promise.all([
    readJson('package.json'),
    readJson('apps/web/package.json'),
    readJson('apps/site/package.json'),
    readJson('apps/api/package.json'),
    readJson('apps/worker/package.json'),
    readJson('packages/shared/package.json'),
    read('apps/web/Dockerfile'),
  ]);

  assert.equal(rootPackage.scripts.dev, 'turbo dev --filter=@pe/api --filter=@pe/web --filter=@pe/worker --filter=@pe/shared');
  assert.equal(rootPackage.scripts['site:dev'], 'pnpm --filter @pe/site dev');
  assert.equal(sitePackage.scripts.dev, 'next dev --port 3001');
  assert.equal(webPackage.scripts.build, 'pnpm --filter @pe/shared build && next build');
  assert.equal(apiPackage.scripts.start, 'node dist/main.js');
  assert.equal(apiPackage.scripts['start:prod'], 'node dist/main.js');
  assert.equal(workerPackage.scripts.predev, 'pnpm --filter @pe/shared prepare:dev');
  assert.equal(sharedPackage.scripts['prepare:dev'], 'node scripts/build.cjs --ensure');
  assert.equal(sharedPackage.scripts.build, 'node scripts/build.cjs');
  assert.doesNotMatch(dockerfile, new RegExp(retiredMode));
  assert.match(dockerfile, /ARG NEXT_PUBLIC_API_URL=\/api\/v1/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_REALTIME_ORIGIN=/);
});

async function executableFiles(directories: string[]) {
  const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
  const files: string[] = [];
  for (const directory of directories) {
    for (const path of await filesBelow(directory)) {
      if (!allowedExtensions.has(extname(path))) continue;
      if (path.endsWith('.test.ts') || path.endsWith('.spec.ts')) continue;
      files.push(path);
    }
  }
  return files;
}

async function pageFiles(directory: string) {
  return (await filesBelow(directory))
    .filter((path) => path.endsWith('/page.tsx') || path === `${directory}/page.tsx`)
    .map((path) => relative(resolve(root, directory), resolve(root, path)));
}

async function filesBelow(directory: string): Promise<string[]> {
  const absolute = resolve(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function composeServices(source: string) {
  const lines = source.split('\n');
  const servicesStart = lines.findIndex((line) => line === 'services:');
  const serviceLines: string[] = [];
  for (const line of lines.slice(servicesStart + 1)) {
    if (/^\S/.test(line)) break;
    serviceLines.push(line);
  }
  return serviceLines.flatMap((line) => line.match(/^  ([a-z0-9-]+):\s*$/)?.slice(1) ?? []);
}

function normalizeRetiredMode(source: string) {
  return source.split('\n').filter((line) => !line.includes(retiredMode)).join('\n');
}

function sha256(source: string) {
  return createHash('sha256').update(source).digest('hex');
}

async function read(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

async function readAll(paths: string[]) {
  return (await Promise.all(paths.map(read))).join('\n');
}

async function readJson(path: string) {
  return JSON.parse(await read(path)) as { scripts: Record<string, string> };
}
