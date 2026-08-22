'use client';

import type { HighlightedDocsCode } from '../../lib/docs/highlighter';
import { cn } from '../../lib/utils';
import { DocsCopyButton } from './docs-copy-button';

export function DocsCodeBlock({ code }: { code: HighlightedDocsCode }) {
  return (
    <figure className="docs-code-block my-6 min-w-0 overflow-hidden rounded-xl border border-white/[0.09] bg-[#07100d]">
      <figcaption className="docs-code-header flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0a1712] px-3 py-2.5 sm:px-4">
        <div className="docs-code-meta flex min-w-0 flex-1 items-center gap-2.5">
          {code.title && (
            <span
              className="docs-code-title truncate text-xs font-semibold text-white/72"
              title={code.title}
            >
              {code.title}
            </span>
          )}
          {code.title && (
            <span
              className="docs-code-separator h-3 w-px shrink-0 bg-white/10"
              aria-hidden="true"
            />
          )}
          <span className="docs-code-language shrink-0 text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-200/55">
            {code.languageLabel}
          </span>
        </div>
        <DocsCopyButton value={code.copyCode} />
      </figcaption>
      <div
        className={cn(
          'docs-code-body min-w-0 overflow-x-auto text-sm leading-7',
          code.showLineNumbers && 'has-line-numbers',
        )}
        data-language={code.language}
        data-supported-language={code.supported}
        dangerouslySetInnerHTML={{ __html: code.html }}
      />
    </figure>
  );
}
