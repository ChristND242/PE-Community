import type { DocsLang } from './content';
import { getDocsNavigation, type DocsNavItem } from './navigation';

export type DocsSearchResult = DocsNavItem & { category: string };

export function searchDocs(query: string, lang: DocsLang): DocsSearchResult[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return [];

  const seen = new Set<string>();
  const results: DocsSearchResult[] = [];
  for (const group of getDocsNavigation(lang)) {
    for (const item of group.items.flatMap((entry) => [entry, ...(entry.children ?? [])])) {
      const searchableText = normalizeSearchValue([item.title, item.description, group.title].filter(Boolean).join(' '));
      if (!searchableText.includes(normalizedQuery) || seen.has(item.href)) continue;
      seen.add(item.href);
      results.push({ ...item, category: group.title });
    }
  }
  return results;
}

export function normalizeSearchValue(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase();
}
