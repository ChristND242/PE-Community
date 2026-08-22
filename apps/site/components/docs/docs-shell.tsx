'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { getDocsPageKeyByHref } from '../../lib/docs/content';
import { getDocsToc } from '../../lib/docs/toc';
import { useI18n } from '../../lib/i18n';
import { DocsSidebar } from './docs-sidebar';
import { DocsToc } from './docs-toc';
import { DocsTopbar } from './docs-topbar';

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { lang } = useI18n();
  const pageKey = getDocsPageKeyByHref(pathname);
  const toc = getDocsToc(pageKey, lang);
  return (
    <div className="docs-root min-h-screen bg-[#07110d] text-white antialiased">
      <DocsTopbar />
      <div className="flex">
        <DocsSidebar />
        <main id="main-content" className="min-w-0 flex-1">
          <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-12 px-5 py-12 md:px-8 md:py-16 xl:grid-cols-[minmax(0,820px)_220px]">
            <article className="docs-article min-w-0">{children}</article>
            <DocsToc items={toc} />
          </div>
        </main>
      </div>
    </div>
  );
}
