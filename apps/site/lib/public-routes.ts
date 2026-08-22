import { docsPageOrder, getDocsPage, type DocsPageKey } from './docs/content';

export type SitePublicRoute = {
  path: string;
  source: string;
  titles: { en: string; fr: string };
  docsPageKey?: DocsPageKey;
};

export const sitePublicRoutes: readonly SitePublicRoute[] = [
  {
    path: '/',
    source: 'app/page.tsx',
    titles: { en: 'PE Community Management', fr: 'PE Community Management' },
  },
  ...docsPageOrder.map((docsPageKey): SitePublicRoute => {
    const english = getDocsPage(docsPageKey, 'en');
    const french = getDocsPage(docsPageKey, 'fr');
    return {
      path: english.href,
      source: english.href === '/docs'
        ? 'app/docs/page.tsx'
        : `app/docs/${english.href.slice('/docs/'.length)}/page.tsx`,
      titles: { en: english.title, fr: french.title },
      docsPageKey,
    };
  }),
];

export const sitePublicRoutePaths = new Set(sitePublicRoutes.map((route) => route.path));
