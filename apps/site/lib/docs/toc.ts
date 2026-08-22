import { getDocsPage, type DocsLang, type DocsPageKey } from './content';

export type DocsTocItem = {
  id: string;
  title: string;
};

export function getDocsToc(pageKey: DocsPageKey, lang: DocsLang = 'en'): DocsTocItem[] {
  return getDocsPage(pageKey, lang).sections.map((section) => ({ id: section.id, title: section.title }));
}
