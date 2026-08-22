import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const rootUrl = new URL('../', import.meta.url);
const siteUrl = new URL('apps/site/', rootUrl);
const docsRoutes = [
  'docs',
  'docs/administration',
  'docs/announcements-and-feed',
  'docs/architecture',
  'docs/audit-logs',
  'docs/automation',
  'docs/backup-restore',
  'docs/calendar-and-events',
  'docs/configuration',
  'docs/contributing',
  'docs/deployment',
  'docs/docker-compose',
  'docs/encrypted-chat',
  'docs/environment-variables',
  'docs/first-run-setup',
  'docs/getting-started',
  'docs/installation',
  'docs/message-templates',
  'docs/notifications',
  'docs/registrations',
  'docs/reminders',
  'docs/roles-and-permissions',
  'docs/security',
  'docs/streaks-and-engagement',
  'docs/task-boards',
  'docs/troubleshooting',
  'docs/upgrades',
] as const;

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function read(path: string) {
  return readFile(new URL(path, rootUrl), 'utf8');
}

async function readJson(path: string): Promise<PackageJson> {
  return JSON.parse(await read(path)) as PackageJson;
}

async function exists(url: URL) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${prefix}${entry.name}`;
    if (entry.name === '.next' || entry.name === 'node_modules') return [];
    return entry.isDirectory()
      ? filesBelow(new URL(`${entry.name}/`, directory), `${path}/`)
      : [path];
  }));
  return nested.flat().sort();
}

test('Site is one explicit standalone Next application on port 3001', async () => {
  const [sitePackage, rootPackage] = await Promise.all([
    readJson('apps/site/package.json'),
    readJson('package.json'),
  ]);

  assert.equal(sitePackage.name, '@pe/site');
  assert.deepEqual(sitePackage.scripts, {
    dev: 'next dev --port 3001',
    build: 'next build',
    start: 'next start --port 3001',
    typecheck: 'tsc --noEmit',
  });
  assert.deepEqual(Object.keys(sitePackage.dependencies ?? {}).sort(), [
    '@dicebear/core',
    '@dicebear/styles',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities',
    '@shikijs/transformers',
    'clsx',
    'lucide-react',
    'mermaid',
    'motion',
    'next',
    'next-themes',
    'react',
    'react-dom',
    'recharts',
    'shiki',
    'tailwind-merge',
  ]);
  assert.deepEqual(
    Object.keys(sitePackage.devDependencies ?? {}).sort(),
    ['@types/node', '@types/react', '@types/react-dom', 'autoprefixer', 'postcss', 'tailwindcss', 'typescript'],
  );

  assert.equal(
    rootPackage.scripts?.dev,
    'turbo dev --filter=@pe/api --filter=@pe/web --filter=@pe/worker --filter=@pe/shared',
  );
  assert.equal(rootPackage.scripts?.['site:dev'], 'pnpm --filter @pe/site dev');
  assert.doesNotMatch(rootPackage.scripts?.dev ?? '', /@pe\/site/);
});

test('Site owns the complete current marketing and documentation route surface', async () => {
  const [page, layout, manifest, files] = await Promise.all([
    read('apps/site/app/page.tsx'),
    read('apps/site/app/layout.tsx'),
    read('apps/site/lib/public-routes.ts'),
    filesBelow(siteUrl),
  ]);

  const pages = files
    .filter((file) => file.endsWith('/page.tsx') || file === 'page.tsx')
    .map((file) => file.replace(/^app\//, '').replace(/\/page\.tsx$/, '').replace(/^page\.tsx$/, ''))
    .sort();
  assert.deepEqual(pages, ['', ...docsRoutes].sort());
  assert.match(page, /<PublicHomepage \/>/);
  assert.match(layout, /PE Community Management/);
  assert.match(layout, /<LanguageProvider>/);
  assert.match(manifest, /sitePublicRoutes/);
  assert.match(manifest, /docsPageOrder\.map/);
  assert.doesNotMatch(`${page}\n${layout}`, /fetch\(|cookies\(|headers\(|redirect\(/);

  for (const prohibited of [
    'middleware.ts',
    'proxy.ts',
    'app/route.ts',
    'app/login/page.tsx',
    'app/setup/page.tsx',
    'app/admin/page.tsx',
    'app/dashboard/page.tsx',
  ]) {
    assert.equal(files.includes(prohibited), false, prohibited);
  }
});

test('Site has no application, shared, API, authentication, realtime, or environment coupling', async () => {
  const files = await filesBelow(siteUrl);
  const sourceFiles = files.filter((file) => /\.(?:css|json|ts|tsx)$/.test(file) && !file.endsWith('.test.ts'));
  const runtimeFiles = sourceFiles.filter((file) => !file.startsWith('lib/docs/'));
  const source = (await Promise.all(runtimeFiles.map((file) => read(`apps/site/${file}`)))).join('\n');
  const allSource = (await Promise.all(sourceFiles.map((file) => read(`apps/site/${file}`)))).join('\n');

  for (const [label, pattern] of [
    ['shared package', /@pe\/shared/],
    ['Socket.IO package', /socket\.io(?:-client)?/i],
    ['realtime origin', /NEXT_PUBLIC_REALTIME_ORIGIN/],
    ['Socket.IO path', /\/socket\.io/],
    ['Chat namespace', /["'`]\/chat(?:["'`/]|$)/],
    ['Event Tasks namespace', /\/event-tasks/],
    ['REST origin', /NEXT_PUBLIC_API_URL/],
    ['REST prefix', /\/api\/v1/],
    ['session endpoint', /\/auth\/me/],
    ['distribution mode', /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION/],
    ['Prisma', /@prisma|\bPrismaClient\b/],
    ['Redis or BullMQ', /\bioredis\b|\bbullmq\b/],
    ['API request', /\bfetch\(|\bXMLHttpRequest\b/],
    ['authentication', /auth provider|session provider|access token|refresh token/i],
  ] as const) {
    assert.doesNotMatch(source, pattern, label);
  }

  assert.doesNotMatch(allSource, /(?:from|import\()\s*["'`][^"'`]*(?:apps\/|\.\.\/)+(?:web|api|worker|packages\/shared)/, 'cross-app import');

  assert.equal(files.some((file) => /(?:^|\/)(?:middleware|proxy)\.[cm]?[jt]sx?$/.test(file)), false);
  assert.equal(files.some((file) => /(?:^|\/)\.env(?:\.|$)/.test(file)), false);
});

test('existing runtime boundaries remain in place while Web root is application-only', async () => {
  const [apiPackage, workerPackage, webRoot, caddy, developmentCompose, productionCompose, environment] = await Promise.all([
    readJson('apps/api/package.json'),
    readJson('apps/worker/package.json'),
    read('apps/web/app/page.tsx'),
    read('deploy/Caddyfile'),
    read('docker-compose.yml'),
    read('docker-compose.prod.yml'),
    read('.env.example'),
  ]);

  assert.equal(apiPackage.scripts?.start, 'node dist/main.js');
  assert.equal(apiPackage.scripts?.['start:prod'], 'node dist/main.js');
  assert.equal(workerPackage.scripts?.predev, 'pnpm --filter @pe/shared prepare:dev');
  assert.match(webRoot, /resolveApplicationEntryDestination/);
  assert.match(webRoot, /redirect\(await resolveApplicationEntryDestination\(\)\)/);
  assert.doesNotMatch(webRoot, /NEXT_PUBLIC_PUBLIC_SITE_MODE|PublicHomepage|marketing/);
  for (const route of docsRoutes) {
    assert.equal(await exists(new URL(`apps/web/app/${route}/page.tsx`, rootUrl)), false, route);
    assert.equal(await exists(new URL(`apps/site/app/${route}/page.tsx`, rootUrl)), true, route);
  }
  assert.equal(await exists(new URL('apps/web/app/login/page.tsx', rootUrl)), true);
  assert.equal(await exists(new URL('apps/web/app/setup/page.tsx', rootUrl)), true);

  const deployment = `${caddy}\n${developmentCompose}\n${productionCompose}`;
  assert.doesNotMatch(deployment, /@pe\/site|apps\/site|site:3001|\bsite:\s*$/m);
  assert.doesNotMatch(`${environment}\n${deployment}`, /APP_DISTRIBUTION/);
  assert.match(caddy, /handle \/socket\.io\*/);
  assert.match(caddy, /handle_path \/api\/v1\/\*/);
  assert.match(caddy, /reverse_proxy web:3000/);
});

test('Web retains exactly the source-derived application route inventory', async () => {
  const webAppUrl = new URL('apps/web/app/', rootUrl);
  const webFiles = await filesBelow(webAppUrl);
  const webPages = webFiles.filter((file) => file.endsWith('/page.tsx') || file === 'page.tsx');
  const expectedApplicationRouteCount = 42;
  assert.equal(webPages.length, expectedApplicationRouteCount);

  for (const route of [
    'page.tsx',
    'login/page.tsx',
    'setup/page.tsx',
    'register/page.tsx',
    'forgot-password/page.tsx',
    'reset-password/page.tsx',
    'verify-email-change/page.tsx',
    'admin/page.tsx',
    'dashboard/page.tsx',
  ]) {
    assert.ok(webFiles.includes(route), `Web route removed: ${route}`);
  }
  for (const route of docsRoutes) assert.equal(webFiles.includes(`${route}/page.tsx`), false, `Web still owns docs route: ${route}`);

  assert.equal(webPages.filter((route) => route.startsWith('admin/')).length, 21);
  assert.equal(webPages.filter((route) => route.startsWith('dashboard/')).length, 12);
  assert.equal(webFiles.some((file) => file.startsWith('docs/')), false);
});

test('Web executable source has no marketing, docs, distribution-mode, or cross-app coupling', async () => {
  const webUrl = new URL('apps/web/', rootUrl);
  const webFiles = await filesBelow(webUrl);
  const executableFiles = webFiles.filter((file) => /\.(?:css|ts|tsx)$/.test(file) && !file.endsWith('.test.ts'));
  const source = (await Promise.all(executableFiles.map((file) => read(`apps/web/${file}`)))).join('\n');

  assert.equal(webFiles.some((file) => file.startsWith('app/docs/')), false);
  assert.equal(webFiles.some((file) => file.startsWith('components/docs/')), false);
  assert.equal(webFiles.some((file) => file.startsWith('lib/docs/')), false);
  assert.equal(webFiles.some((file) => file.startsWith('components/marketing/')), false);
  assert.equal(webFiles.some((file) => file.startsWith('app/public-homepage')), false);
  assert.doesNotMatch(source, /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION|PublicHomepage/);
  assert.doesNotMatch(source, /(?:from|import\()\s*["'`][^"'`]*(?:apps\/site|\.\.\/\.\.\/site)/, 'Web imports Site source');
});

test('Site metadata, assets, dark-only theme, and accessibility hooks remain local', async () => {
  const [layout, globals, homepage, docsShell, docsSidebar, mobileNav] = await Promise.all([
    read('apps/site/app/layout.tsx'),
    read('apps/site/app/globals.css'),
    read('apps/site/app/public-homepage.tsx'),
    read('apps/site/components/docs/docs-shell.tsx'),
    read('apps/site/components/docs/docs-sidebar.tsx'),
    read('apps/site/components/docs/docs-mobile-nav.tsx'),
  ]);
  assert.match(layout, /\/pona-ekolo\.svg/);
  assert.match(layout, /<SiteSkipLink \/>/);
  assert.match(globals, /color-scheme: dark/);
  assert.match(globals, /prefers-reduced-motion: reduce/);
  assert.match(homepage, /id="main-content"/);
  assert.match(docsShell, /id="main-content"/);
  assert.match(docsSidebar, /aria-current=\{active \? 'page'/);
  assert.match(mobileNav, /aria-modal="true"/);
});
