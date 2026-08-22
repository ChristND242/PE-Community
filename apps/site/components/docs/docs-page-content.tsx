'use client';

import {
  getDocsPage,
  getDocsPrevNext,
  type DocsPageKey,
  type DocsSection,
} from '../../lib/docs/content';
import type { HighlightedDocsCode } from '../../lib/docs/highlighter';
import { useI18n } from '../../lib/i18n';
import { DocsBreadcrumbs } from './docs-breadcrumbs';
import { DocsCallout } from './docs-callout';
import { DocsCard } from './docs-card';
import { DocsCodeBlock } from './docs-code-block';
import { DocsMermaidDiagram } from './docs-mermaid-diagram';
import { DocsNextPrev } from './docs-next-prev';
import { DocsPageHeader } from './docs-page-header';
import { DocsSectionHeading } from './docs-section-heading';

type HighlightedPageCode = Record<
  'en' | 'fr',
  Record<string, HighlightedDocsCode>
>;

export function DocsPageContent({
  pageKey,
  highlightedCode,
}: {
  pageKey: DocsPageKey;
  highlightedCode: HighlightedPageCode;
}) {
  const { lang } = useI18n();
  const page = getDocsPage(pageKey, lang);
  const { previous, next } = getDocsPrevNext(pageKey, lang);
  return (
    <>
      <DocsBreadcrumbs current={page.title} />
      <DocsPageHeader
        eyebrow={page.eyebrow}
        title={page.title}
        description={page.description}
      />
      {page.cards && (
        <div className="mb-12 grid gap-3.5 md:grid-cols-2">
          {page.cards.map((card) => (
            <DocsCard key={card.href} {...card} />
          ))}
        </div>
      )}
      <div className="space-y-12">
        {page.sections.map((section) => (
          <DocsPageSection
            key={section.id}
            section={section}
            lang={lang}
            highlightedCode={highlightedCode[lang][section.id]}
          />
        ))}
      </div>
      <DocsNextPrev previous={previous} next={next} />
    </>
  );
}

function DocsPageSection({
  section,
  lang,
  highlightedCode,
}: {
  section: DocsSection;
  lang: 'en' | 'fr';
  highlightedCode?: HighlightedDocsCode;
}) {
  return (
    <section className="min-w-0 border-b border-white/[0.045] pb-12 last:border-b-0 last:pb-0">
      <DocsSectionHeading id={section.id}>{section.title}</DocsSectionHeading>
      {section.body?.map((paragraph) => (
        <p
          key={paragraph}
          className="mt-4 max-w-[760px] text-[15px] leading-8 text-white/62"
        >
          {paragraph}
        </p>
      ))}
      {section.bullets && (
        <ul className="mt-5 grid max-w-[760px] gap-3 text-[15px] leading-7 text-white/64">
          {section.bullets.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300/60" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {section.table && (
        <div className="docs-table mt-6 overflow-x-auto rounded-2xl border border-white/[0.065] bg-white/[0.025]">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="docs-table-head bg-white/[0.03] text-xs uppercase tracking-[0.13em] text-white/42">
              <tr>
                {section.table.headers.map((header) => (
                  <th
                    key={header}
                    className="border-b border-white/[0.08] px-4 py-3 font-semibold"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {section.table.rows.map((row) => (
                <tr key={row.join('|')} className="text-white/64">
                  {row.map((cell, index) => (
                    <td
                      key={`${cell}-${index}`}
                      className="px-4 py-3 align-top leading-6 first:font-semibold first:text-white/82"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.code && highlightedCode && (
        <DocsCodeBlock code={highlightedCode} />
      )}
      {section.diagram && (
        <DocsDiagram
          caption={section.diagram.caption}
          nodes={section.diagram.nodes}
        />
      )}
      {section.mermaid && (
        <DocsMermaidDiagram
          title={section.mermaid.title}
          description={section.mermaid.description}
          source={section.mermaid.sources[lang]}
          unavailableLabel={section.mermaid.unavailableLabel}
        />
      )}
      {section.callout && (
        <DocsCallout
          variant={section.callout.variant}
          title={section.callout.title}
          showIcon={section.callout.showIcon}
        >
          {section.callout.body}
        </DocsCallout>
      )}
    </section>
  );
}

function DocsDiagram({ caption, nodes }: { caption: string; nodes: string[] }) {
  return (
    <div className="docs-diagram mt-6 overflow-x-auto rounded-2xl border border-white/[0.065] bg-white/[0.025] p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/42">
        {caption}
      </p>
      <div className="flex min-w-max items-center gap-3">
        {nodes.map((node, index) => (
          <div key={`${node}-${index}`} className="flex items-center gap-3">
            <div className="docs-diagram-node rounded-xl border border-white/[0.08] bg-[#0b1712] px-4 py-3 text-sm font-semibold text-white/78 shadow-sm shadow-black/20">
              {node}
            </div>
            {index < nodes.length - 1 && (
              <span className="text-emerald-200/45" aria-hidden="true">
                -&gt;
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
