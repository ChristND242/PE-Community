import {
  getDocsPage,
  type DocsLang,
  type DocsPageKey,
} from '../../lib/docs/content';
import {
  highlightDocsCode,
  type HighlightedDocsCode,
} from '../../lib/docs/highlighter';
import { DocsPageContent } from './docs-page-content';

const docsLanguages = ['en', 'fr'] as const satisfies readonly DocsLang[];

export async function DocsPage({ pageKey }: { pageKey: DocsPageKey }) {
  const highlightedCode = Object.fromEntries(
    await Promise.all(
      docsLanguages.map(
        async (lang) => [lang, await highlightPageCode(pageKey, lang)] as const,
      ),
    ),
  ) as Record<DocsLang, Record<string, HighlightedDocsCode>>;

  return (
    <DocsPageContent pageKey={pageKey} highlightedCode={highlightedCode} />
  );
}

async function highlightPageCode(pageKey: DocsPageKey, lang: DocsLang) {
  const page = getDocsPage(pageKey, lang);
  const entries = await Promise.all(
    page.sections
      .filter((section) => section.code)
      .map(
        async (section) =>
          [section.id, await highlightDocsCode(section.code!)] as const,
      ),
  );
  return Object.fromEntries(entries);
}
