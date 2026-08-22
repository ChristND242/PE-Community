import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const siteUrl = new URL('./', import.meta.url);

const docsRoutes = [
  ['docs', 'overview'],
  ['docs/administration', 'administration'],
  ['docs/architecture', 'architecture'],
  ['docs/automation', 'automation'],
  ['docs/backup-restore', 'backupRestore'],
  ['docs/configuration', 'configuration'],
  ['docs/contributing', 'contributing'],
  ['docs/deployment', 'deployment'],
  ['docs/docker-compose', 'dockerCompose'],
  ['docs/encrypted-chat', 'encryptedChat'],
  ['docs/environment-variables', 'environmentVariables'],
  ['docs/first-run-setup', 'firstRunSetup'],
  ['docs/getting-started', 'gettingStarted'],
  ['docs/installation', 'installation'],
  ['docs/notifications', 'notifications'],
  ['docs/security', 'security'],
  ['docs/troubleshooting', 'troubleshooting'],
  ['docs/upgrades', 'upgrades'],
] as const;

async function read(path: string) {
  return readFile(new URL(path, siteUrl), 'utf8');
}

test('Site owns the current marketing homepage composition', async () => {
  const [page, homepage, footer] = await Promise.all([
    read('app/page.tsx'),
    read('app/public-homepage.tsx'),
    read('app/public-homepage-footer.tsx'),
  ]);

  assert.match(page, /<PublicHomepage \/>/);
  assert.match(homepage, /PE Community|t\.brand\.short/);
  assert.match(homepage, /<BrandWordmark/);
  assert.doesNotMatch(homepage, /t\.landing\.launch/);
  assert.match(homepage, /<PlatformCapabilitiesSection \/>/);
  assert.match(homepage, /<PlatformFlowSection \/>/);
  assert.match(homepage, /<ProductOperationsSection \/>/);
  assert.match(homepage, /<CommunityIdentityShowcase \/>/);
  assert.match(homepage, /<PlatformTrustSection \/>/);
  assert.match(homepage, /<PublicHomepageFooter \/>/);
  assert.match(footer, /<footer/);
  assert.match(homepage, /href: '\/docs'/);
});

test('Site owns every current documentation route and page key', async () => {
  for (const [route, pageKey] of docsRoutes) {
    const path = `app/${route}/page.tsx`;
    await access(new URL(path, siteUrl));
    assert.match(await read(path), new RegExp(`pageKey=["']${pageKey}["']`), path);
  }
});

test('documentation shell preserves navigation, search, reading aids, and copy behavior', async () => {
  const [shell, topbar, page, pageContent, search, copy, breadcrumbs, nextPrev, language] = await Promise.all([
    read('components/docs/docs-shell.tsx'),
    read('components/docs/docs-topbar.tsx'),
    read('components/docs/docs-page.tsx'),
    read('components/docs/docs-page-content.tsx'),
    read('components/docs/docs-search.tsx'),
    read('components/docs/docs-copy-button.tsx'),
    read('components/docs/docs-breadcrumbs.tsx'),
    read('components/docs/docs-next-prev.tsx'),
    read('components/docs/docs-language-toggle.tsx'),
  ]);

  assert.match(shell, /<DocsSidebar \/>/);
  assert.match(shell, /<DocsToc items=\{toc\} \/>/);
  assert.match(topbar, /<DocsMobileNav \/>/);
  assert.match(topbar, /<DocsSearch \/>/);
  assert.match(page, /<DocsPageContent/);
  assert.match(pageContent, /<DocsBreadcrumbs/);
  assert.match(pageContent, /<DocsNextPrev/);
  assert.match(search, /searchDocs\(query, lang\)/);
  assert.doesNotMatch(search, /fetch\(|XMLHttpRequest|WebSocket/);
  assert.match(copy, /writeClipboardText\(value\)/);
  assert.match(breadcrumbs, /aria-label=\{labels\.aria\}/);
  assert.match(nextPrev, /previous\.href/);
  assert.match(nextPrev, /next\.href/);
  assert.match(language, /\['en', 'fr'\]/);
});

test('public language state is Site-local and has no application bootstrap', async () => {
  const source = await read('lib/i18n.tsx');

  assert.match(source, /pe-site-language/);
  assert.match(source, /document\.documentElement\.lang = next/);
  assert.match(source, /Open-source community operations/);
  assert.match(source, /Opérations communautaires open source/);
  assert.doesNotMatch(source, /fetch\(|apiUrl|auth\/me|instance-bootstrap|session provider/i);
});
