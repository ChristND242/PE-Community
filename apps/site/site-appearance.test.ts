import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const siteUrl = new URL('./', import.meta.url);

async function read(path: string) {
  return readFile(new URL(path, siteUrl), 'utf8');
}

async function filesBelow(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = `${prefix}${entry.name}`;
        if (entry.name === '.next' || entry.name === 'node_modules') return [];
        return entry.isDirectory()
          ? filesBelow(new URL(`${entry.name}/`, directory), `${path}/`)
          : [path];
      }),
    )
  ).flat();
}

test('Site owns one system-aware persistent appearance provider', async () => {
  const [provider, layout] = await Promise.all([
    read('components/appearance-provider.tsx'),
    read('app/layout.tsx'),
  ]);

  assert.match(provider, /attribute="class"/);
  assert.match(provider, /defaultTheme="system"/);
  assert.match(provider, /enableSystem/);
  assert.match(provider, /storageKey="pe-site-appearance"/);
  assert.match(provider, /resolvedTheme === 'dark'/);
  assert.equal((layout.match(/<SiteAppearanceProvider>/g) ?? []).length, 1);
  assert.match(layout, /suppressHydrationWarning/);
});

test('dual-icon switch is provider-driven, hydration-safe, and keyboard operable', async () => {
  const [source, i18n] = await Promise.all([
    read('components/theme-switch.tsx'),
    read('lib/i18n.tsx'),
  ]);

  assert.match(source, /useTheme\(\)/);
  assert.match(source, /resolvedTheme/);
  assert.match(source, /setTheme\(theme\)/);
  assert.match(source, /<Sun /);
  assert.match(source, /<Moon /);
  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked=\{isDark\}/);
  assert.match(source, /type="button"/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /disabled=\{!mounted\}/);
  assert.match(source, /inline-flex h-8/);
  assert.match(source, /site-theme-track relative h-4 w-8/);
  assert.match(source, /site-theme-thumb absolute left-0\.5 top-0\.5 h-3 w-3/);
  assert.doesNotMatch(source, /useState\(['"](?:light|dark)['"]\)/);
  assert.match(i18n, /Use light mode/);
  assert.match(i18n, /Use dark mode/);
  assert.match(i18n, /Switch between light and dark mode/);
  assert.match(i18n, /Utiliser le mode clair/);
  assert.match(i18n, /Utiliser le mode sombre/);
  assert.match(i18n, /Basculer entre le mode clair et le mode sombre/);
});

test('public header omits Login and uses the compact Site wordmark', async () => {
  const [homepage, footer, wordmark] = await Promise.all([
    read('app/public-homepage.tsx'),
    read('app/public-homepage-footer.tsx'),
    read('components/brand-wordmark.tsx'),
  ]);

  assert.doesNotMatch(homepage, /t\.landing\.launch/);
  assert.match(homepage, /<BrandWordmark className="text-lg"/);
  assert.match(footer, /<BrandWordmark className="text-2xl text-white"/);
  assert.match(wordmark, /t\.brand\.short\.split\(' '\)/);
  assert.match(wordmark, /text-accent/);
  assert.doesNotMatch(wordmark, /Community\./);
});

test('Marketing and Docs expose the same Site switch without local providers', async () => {
  const [marketing, docsTopbar, docsLayout] = await Promise.all([
    read('app/public-homepage.tsx'),
    read('components/docs/docs-topbar.tsx'),
    read('app/docs/layout.tsx'),
  ]);

  assert.equal((marketing.match(/<ThemeSwitch/g) ?? []).length, 2);
  assert.equal((docsTopbar.match(/<ThemeSwitch/g) ?? []).length, 1);
  assert.doesNotMatch(
    `${marketing}\n${docsTopbar}\n${docsLayout}`,
    /ThemeProvider|SiteAppearanceProvider/,
  );
  assert.match(marketing, /lg:flex/);
  assert.match(marketing, /publicMobileMenuId/);
});

test('Site light and dark tokens cover Marketing and Docs surfaces', async () => {
  const [globals, docsShell, code, callout, footer] = await Promise.all([
    read('app/globals.css'),
    read('components/docs/docs-shell.tsx'),
    read('components/docs/docs-code-block.tsx'),
    read('components/docs/docs-callout.tsx'),
    read('app/public-homepage-footer.tsx'),
  ]);

  assert.match(globals, /:root\s*\{[\s\S]*color-scheme: light/);
  assert.match(globals, /\.dark\s*\{[\s\S]*color-scheme: dark/);
  assert.match(globals, /--site-background: #f3f7f4/);
  assert.match(globals, /\.dark[\s\S]*--site-background: #070b0a/);
  assert.match(globals, /--site-accent: #137f59/);
  assert.match(globals, /\.dark[\s\S]*--site-accent: #5ed29c/);
  assert.match(globals, /\.docs-code-block/);
  assert.match(globals, /\.docs-sidebar/);
  assert.match(globals, /\.site-footer-surface/);
  assert.match(globals, /--site-grid: rgba\(24, 82, 60, 0\.09\)/);
  assert.match(globals, /--site-dot: rgba\(13, 148, 95, 0\.3\)/);
  assert.match(globals, /\.site-hero-background/);
  assert.match(globals, /\.site-capability-engagement/);
  assert.match(globals, /\.site-flow-card-operations/);
  assert.match(globals, /\.site-trust-card-notifications/);
  assert.match(globals, /\.docs-search-control/);
  assert.doesNotMatch(globals, /\[class\*="bg-\[radial-gradient"\]/);
  assert.match(docsShell, /docs-root/);
  assert.match(code, /docs-code-block/);
  assert.match(callout, /dark:text-sky-50/);
  assert.match(callout, /text-amber-900/);
  assert.match(footer, /site-footer-surface/);
});

test('light Site preserves dark product showcases and member accent panels', async () => {
  const [globals, productOperations, memberDashboard, workspacePreview] =
    await Promise.all([
      read('app/globals.css'),
      read('components/marketing/product-operations-section.tsx'),
      read('components/member-dashboard-view.tsx'),
      read('app/public-homepage-preview.tsx'),
    ]);

  assert.match(
    productOperations,
    /contentClassName="site-dark-product-preview bg-black\/20"/,
  );
  assert.match(productOperations, /mode === 'kanban'/);
  assert.match(productOperations, /mode === 'automation'/);
  assert.match(productOperations, /<EmailOperationsPreview \/>/);
  assert.match(
    globals,
    /html:not\(\.dark\) \.site-dark-product-preview\s*\{[\s\S]*background: #07100d !important/,
  );
  assert.match(
    globals,
    /\.site-dark-product-preview \[role="tabpanel"\]\s*\{\s*background: transparent !important/,
  );
  assert.match(
    globals,
    /\.site-dark-product-preview \.recharts-cartesian-axis-tick-value/,
  );
  assert.match(
    memberDashboard,
    /site-dark-accent-panel site-member-preview-hero/,
  );
  assert.match(
    memberDashboard,
    /site-dark-accent-panel site-member-preview-streak/,
  );
  assert.match(
    workspacePreview,
    /contentClassName="site-workspace-preview bg-white\/\[0\.025\]"/,
  );
  assert.doesNotMatch(
    workspacePreview,
    /site-workspace-preview[^"']*opacity-(?:40|50|60)/,
  );
  assert.doesNotMatch(
    productOperations,
    /site-dark-product-preview[^"']*opacity-(?:40|50|60)/,
  );
});

test('Site appearance stays isolated from Web and retired public-site mode', async () => {
  const files = (await filesBelow(siteUrl)).filter(
    (file) => /\.(?:css|ts|tsx)$/.test(file) && !file.endsWith('.test.ts'),
  );
  const source = (await Promise.all(files.map((file) => read(file)))).join(
    '\n',
  );

  assert.doesNotMatch(
    source,
    /from\s+['"][^'"]*(?:apps\/web|\.\.\/\.\.\/web|@pe\/web)/,
  );
  assert.doesNotMatch(source, /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION/);
});
