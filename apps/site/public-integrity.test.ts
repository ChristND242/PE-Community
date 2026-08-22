import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { docsPageOrder, getDocsPage, getDocsPrevNext } from './lib/docs/content';
import { docsNavigation } from './lib/docs/navigation';
import { getDocsToc } from './lib/docs/toc';
import { sitePublicRoutePaths, sitePublicRoutes } from './lib/public-routes';

const siteUrl = new URL('./', import.meta.url);

async function filesBelow(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = `${prefix}${entry.name}`;
    if (entry.name === '.next' || entry.name === 'node_modules') return [];
    return entry.isDirectory() ? filesBelow(new URL(`${entry.name}/`, directory), `${path}/`) : [path];
  }))).flat();
}

test('public route manifest is complete, unique, localized, and source-backed', async () => {
  assert.equal(sitePublicRoutes.length, docsPageOrder.length + 1);
  assert.equal(new Set(sitePublicRoutes.map((route) => route.path)).size, sitePublicRoutes.length);
  assert.deepEqual(sitePublicRoutes.map((route) => route.path), ['/', ...docsPageOrder.map((key) => getDocsPage(key).href)]);
  for (const route of sitePublicRoutes) {
    assert.ok(route.titles.en.trim(), `${route.path} lacks an English title`);
    assert.ok(route.titles.fr.trim(), `${route.path} lacks a French title`);
    await access(new URL(route.source, siteUrl));
    if (route.docsPageKey) {
      const source = await readFile(new URL(route.source, siteUrl), 'utf8');
      assert.match(source, new RegExp(`createDocsMetadata\\(['\"]${route.docsPageKey}['\"]\\)`));
    }
  }
});

test('documentation navigation and previous/next form one non-circular graph', () => {
  const navigationHrefs = docsNavigation.flatMap((group) => group.items.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
  const docsHrefs = docsPageOrder.map((key) => getDocsPage(key).href);
  assert.deepEqual(new Set(navigationHrefs), new Set(docsHrefs));
  for (const item of docsNavigation.flatMap((group) => group.items)) {
    const key = docsPageOrder.find((candidate) => getDocsPage(candidate).href === item.href);
    assert.ok(key, `navigation route is not registered: ${item.href}`);
  }

  docsPageOrder.forEach((key, index) => {
    const page = getDocsPage(key);
    const { previous, next } = getDocsPrevNext(key);
    assert.equal(previous?.href, index > 0 ? getDocsPage(docsPageOrder[index - 1]!).href : undefined);
    assert.equal(next?.href, index < docsPageOrder.length - 1 ? getDocsPage(docsPageOrder[index + 1]!).href : undefined);
    assert.notEqual(previous?.href, page.href);
    assert.notEqual(next?.href, page.href);
    const toc = getDocsToc(key);
    assert.deepEqual(toc.map((item) => item.id), page.sections.map((section) => section.id));
  });
});

test('literal Site links and anchors are safe and resolve inside the manifest', async () => {
  const allFiles = (await filesBelow(siteUrl)).filter((file) => /\.(?:ts|tsx)$/.test(file) && !file.endsWith('.test.ts'));
  const files = allFiles.filter((file) => (
    /\.(?:ts|tsx)$/.test(file)
    && !file.endsWith('.test.ts')
    && (
      file.startsWith('app/')
      || file.startsWith('components/docs/')
      || file === 'lib/i18n.tsx'
      || file === 'lib/docs/navigation.ts'
      || file === 'lib/docs/content.ts'
    )
  ));
  const sources = await Promise.all(files.map(async (file) => ({ file, source: await readFile(new URL(file, siteUrl), 'utf8') })));
  const allSource = sources.map(({ source }) => source).join('\n');
  const anchorSource = (await Promise.all(allFiles.map((file) => readFile(new URL(file, siteUrl), 'utf8')))).join('\n');
  const homepageAnchors = new Set([...anchorSource.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const hrefs = sources.flatMap(({ file, source }) => [
    ...[...source.matchAll(/\bhref=["']([^"']*)["']/g)].map((match) => ({ file, href: match[1]! })),
    ...[...source.matchAll(/\bhref:\s*["']([^"']*)["']/g)].map((match) => ({ file, href: match[1]! })),
  ]);

  for (const { file, href } of hrefs) {
    assert.ok(href, `${file} has an empty href`);
    assert.doesNotMatch(href, /^javascript:/i, file);
    assert.doesNotMatch(href, /^\/\//, file);
    if (href.startsWith('#')) assert.ok(homepageAnchors.has(href.slice(1)), `${file} has a missing anchor ${href}`);
    if (href.startsWith('/')) {
      assert.doesNotMatch(href.split(/[?#]/)[0]!, /\/\//, `${file} has duplicate path separators`);
      assert.ok(sitePublicRoutePaths.has(href.split(/[?#]/)[0]!), `${file} links to missing Site route ${href}`);
    }
    if (/^https?:/i.test(href)) assert.match(href, /^https:\/\//, `${file} external link must use HTTPS`);
  }
  assert.doesNotMatch(allSource, /href(?:=|:)\s*["']\/(?:login|register|setup|admin|dashboard)(?:[\/"'])/, 'application route bypasses getAppHref');
});

test('local image and favicon references exist and metadata has no false canonical origin', async () => {
  const files = (await filesBelow(siteUrl)).filter((file) => /\.(?:css|ts|tsx)$/.test(file) && !file.endsWith('.test.ts'));
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, siteUrl), 'utf8')))).join('\n');
  const assetPaths = new Set(
    [...source.matchAll(/(?:src\s*=|icon\s*:|shortcut\s*:|apple\s*:)[\s{]*["'](\/[^"'?#]+)["']/g)]
      .map((match) => decodeURIComponent(match[1]!.slice(1))),
  );
  assert.ok(assetPaths.has('pona-ekolo.svg'));
  for (const assetPath of assetPaths) await access(new URL(`public/${assetPath}`, siteUrl));

  const layout = await readFile(new URL('app/layout.tsx', siteUrl), 'utf8');
  const docsLayout = await readFile(new URL('app/docs/layout.tsx', siteUrl), 'utf8');
  assert.match(layout, /title: 'PE Community Management'/);
  assert.match(layout, /description:/);
  assert.match(layout, /icon: '\/pona-ekolo\.svg'/);
  assert.match(docsLayout, /Docs \| PE Community Management/);
  assert.doesNotMatch(`${layout}\n${docsLayout}`, /canonical|localhost|127\.0\.0\.1/);
});
