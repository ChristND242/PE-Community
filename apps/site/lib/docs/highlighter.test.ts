import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  cleanDocsCodeForCopy,
  DOCS_CODE_LANGUAGES,
  DOCS_SHIKI_THEME,
  getDocsCodeLanguageLabel,
  highlightDocsCode,
  normalizeDocsCodeLanguage,
} from './highlighter';
import { docsPageOrder, getDocsPage } from './content';

const siteRoot = new URL('../../', import.meta.url);
const repositoryRoot = new URL('../../../../', import.meta.url);

const grammarCases = [
  ['typescript', 'const answer: number = 42'],
  ['tsx', 'export const App = () => <main>Hello</main>'],
  ['javascript', 'const answer = JSON.parse("42")'],
  ['bash', 'pnpm --filter @pe/site build'],
  ['json', '{"enabled": true}'],
  ['yaml', 'services:\n  api:\n    image: pe-api'],
  ['dotenv', 'DATABASE_URL=postgresql://example.invalid/db'],
] as const;

test('central Shiki highlighter supports the documented grammar set and aliases', async () => {
  assert.equal(DOCS_SHIKI_THEME, 'vitesse-dark');
  assert.ok(DOCS_CODE_LANGUAGES.includes('prisma'));
  assert.equal(normalizeDocsCodeLanguage('sh'), 'bash');
  assert.equal(normalizeDocsCodeLanguage('yml'), 'yaml');
  assert.equal(normalizeDocsCodeLanguage('ps1'), 'powershell');
  assert.equal(normalizeDocsCodeLanguage('env'), 'dotenv');
  assert.equal(getDocsCodeLanguageLabel('ts'), 'TypeScript');
  assert.equal(getDocsCodeLanguageLabel('bash'), 'Terminal');

  for (const [language, value] of grammarCases) {
    const result = await highlightDocsCode({ language, value });
    assert.equal(result.supported, true, language);
    assert.equal(result.rawCode, value, language);
    assert.equal(result.copyCode, value, language);
    assert.match(result.html, /<pre class="shiki vitesse-dark"/, language);
    assert.match(result.html, /class="line"/, language);
    assert.match(result.html, /style="color:/, language);
  }
});

test('unknown languages fall back to escaped plain text without losing the label or copy value', async () => {
  const value = '<unsafe-example>& still text';
  const result = await highlightDocsCode({
    language: 'future-language',
    value,
  });

  assert.equal(result.supported, false);
  assert.equal(result.language, 'future-language');
  assert.equal(result.languageLabel, 'future-language');
  assert.equal(result.copyCode, value);
  assert.match(
    result.html,
    /(?:&lt;|&#x3C;)unsafe-example(?:&gt;|>)(?:&amp;|&#x26;) still text/,
  );
});

test('every existing EN and FR Docs code object is highlighted by the shared renderer', async () => {
  let codeBlockCount = 0;
  for (const language of ['en', 'fr'] as const) {
    for (const pageKey of docsPageOrder) {
      const page = getDocsPage(pageKey, language);
      for (const section of page.sections) {
        if (!section.code) continue;
        codeBlockCount += 1;
        const result = await highlightDocsCode(section.code);
        assert.equal(
          result.supported,
          true,
          `${language}:${pageKey}:${section.id}`,
        );
        assert.equal(
          result.rawCode,
          section.code.value,
          `${language}:${pageKey}:${section.id}`,
        );
        assert.match(
          result.html,
          /<pre class="shiki vitesse-dark"/,
          `${language}:${pageKey}:${section.id}`,
        );
      }
    }
  }
  assert.ok(codeBlockCount > 0);
});

test('the real setup-token block supplies its title and language without theme state', async () => {
  const setupPage = getDocsPage('firstRunSetup', 'en');
  const setupToken = setupPage.sections.find(
    (section) => section.id === 'setup-token-protection',
  )?.code;
  assert.ok(setupToken);

  const result = await highlightDocsCode(setupToken);
  assert.equal(result.title, 'generate a URL-safe token');
  assert.equal(result.languageLabel, 'Terminal');
  assert.equal(result.copyCode, 'openssl rand -hex 32');

  const languageOnly = await highlightDocsCode({
    language: 'json',
    value: '{"ok":true}',
  });
  assert.equal(languageOnly.title, undefined);
  assert.equal(languageOnly.languageLabel, 'JSON');
});

test('titles, line numbers, metadata, and controlled notation transformers are preserved', async () => {
  const value = [
    'const first = true',
    '// [!code highlight]',
    'const highlighted = true',
    '// [!code ++]',
    'const added = true',
    '// [!code --]',
    'const removed = true',
    '// [!code focus]',
    'const focused = true',
    '// [!code error]',
    'const error = true',
    '// [!code warning]',
    'const warning = true',
    '// [!code info]',
    'const info = true',
  ].join('\n');
  const result = await highlightDocsCode({
    language: 'ts',
    value,
    title: 'apps/api/src/main.ts',
    meta: '{1}',
    showLineNumbers: true,
  });

  assert.equal(result.title, 'apps/api/src/main.ts');
  assert.equal(result.showLineNumbers, true);
  assert.match(result.html, /class="line highlighted"/);
  assert.match(result.html, /class="line diff add"/);
  assert.match(result.html, /class="line diff remove"/);
  assert.match(result.html, /class="line focused"/);
  assert.match(result.html, /class="line highlighted error"/);
  assert.match(result.html, /class="line highlighted warning"/);
  assert.match(result.html, /class="line highlighted info"/);
  assert.doesNotMatch(result.html, /\[!code/);
  assert.doesNotMatch(result.copyCode, /\[!code/);
  assert.equal(
    cleanDocsCodeForCopy('const stable = true'),
    'const stable = true',
  );
});

test('highlighting remains server-owned and isolated from client and Marketing code', async () => {
  const [serverPage, highlighter, codeBlock, contentPage, packageSource] =
    await Promise.all([
      readFile(new URL('components/docs/docs-page.tsx', siteRoot), 'utf8'),
      readFile(new URL('lib/docs/highlighter.ts', siteRoot), 'utf8'),
      readFile(
        new URL('components/docs/docs-code-block.tsx', siteRoot),
        'utf8',
      ),
      readFile(
        new URL('components/docs/docs-page-content.tsx', siteRoot),
        'utf8',
      ),
      readFile(new URL('package.json', siteRoot), 'utf8'),
    ]);

  assert.doesNotMatch(serverPage, /^['"]use client['"]/);
  assert.match(serverPage, /highlightDocsCode/);
  assert.equal((highlighter.match(/createHighlighter\(/g) ?? []).length, 1);
  assert.doesNotMatch(
    codeBlock,
    /from ['"](?:shiki|@shikijs\/transformers)['"]/,
  );
  assert.doesNotMatch(
    contentPage,
    /from ['"](?:shiki|@shikijs\/transformers)['"]/,
  );
  assert.match(codeBlock, /dangerouslySetInnerHTML/);
  assert.match(packageSource, /"shiki":/);
  assert.match(packageSource, /"@shikijs\/transformers":/);

  const marketingSource = await readSourceBelow(
    new URL('components/marketing/', siteRoot),
  );
  const webSource = await readSourceBelow(new URL('apps/web/', repositoryRoot));
  assert.doesNotMatch(marketingSource, /shiki|docs\/highlighter/);
  assert.doesNotMatch(webSource, /from ['"][^'"]*shiki|@shikijs\/transformers/);
});

test('code block UI contains overflow, preserves whitespace, and keeps inline code outside Shiki', async () => {
  const [component, copyButton, styles, contentPage] = await Promise.all([
    readFile(new URL('components/docs/docs-code-block.tsx', siteRoot), 'utf8'),
    readFile(new URL('components/docs/docs-copy-button.tsx', siteRoot), 'utf8'),
    readFile(new URL('app/globals.css', siteRoot), 'utf8'),
    readFile(
      new URL('components/docs/docs-page-content.tsx', siteRoot),
      'utf8',
    ),
  ]);

  assert.match(component, /docs-code-header/);
  assert.match(component, /docs-code-meta/);
  assert.match(component, /docs-code-title/);
  assert.match(component, /docs-code-separator/);
  assert.match(component, /docs-code-language/);
  assert.match(component, /code\.languageLabel/);
  assert.match(component, /code\.title/);
  assert.match(component, /<DocsCopyButton value=\{code\.copyCode\}/);
  assert.equal((component.match(/<DocsCopyButton/g) ?? []).length, 1);
  assert.match(component, /<figure className="docs-code-block/);
  assert.match(component, /<figcaption className="docs-code-header/);
  assert.match(component, /truncate text-xs font-semibold text-white\/72/);
  assert.match(copyButton, /docs-code-copy/);
  assert.match(copyButton, /text-white\/58/);
  assert.match(copyButton, /data-state=\{state\}/);
  assert.doesNotMatch(
    `${component}\n${copyButton}`,
    /dark:(?:hidden|block)|hidden.*dark:block|opacity-0.*dark:|text-transparent/,
  );
  assert.doesNotMatch(
    `${component}\n${copyButton}`,
    /absolute|sm:hidden|md:hidden|lg:hidden|useTheme|isDark/,
  );
  assert.match(component, /overflow-x-auto/);
  assert.match(
    styles,
    /\.docs-code-body \.shiki\s*\{[\s\S]*white-space|\.docs-code-body \.shiki/,
  );
  assert.match(styles, /\.docs-code-block ::selection/);
  assert.match(styles, /\.docs-code-body\.has-line-numbers \.line::before/);
  assert.match(
    styles,
    /html:not\(\.dark\) \.docs-code-block \.docs-code-header/,
  );
  assert.match(
    styles,
    /html:not\(\.dark\) \.docs-code-block \.docs-code-title\s*\{[\s\S]*color: #20352b !important/,
  );
  assert.match(
    styles,
    /html:not\(\.dark\) \.docs-code-block \.docs-code-copy\s*\{[\s\S]*color: #29483a !important/,
  );
  assert.match(
    styles,
    /html:not\(\.dark\) \.docs-code-block \.docs-code-language/,
  );
  assert.match(styles, /\.docs-code-block\s*\{[\s\S]*background: #07100d/);
  assert.doesNotMatch(contentPage, /<code[^>]*>.*highlightDocsCode/);
});

async function readSourceBelow(directory: URL): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === 'node_modules' || entry.name === '.next') return '';
      const url = new URL(
        entry.isDirectory() ? `${entry.name}/` : entry.name,
        directory,
      );
      if (entry.isDirectory()) return readSourceBelow(url);
      return /\.(?:ts|tsx|js|jsx)$/.test(entry.name)
        ? readFile(url, 'utf8')
        : '';
    }),
  );
  return sources.join('\n');
}
