import type { Metadata } from 'next';
import { getDocsPage, type DocsPageKey } from './content';

export function createDocsMetadata(pageKey: DocsPageKey): Metadata {
  const page = getDocsPage(pageKey, 'en');
  return {
    title: `${page.title} | PE Community Management`,
    description: page.description,
  };
}
