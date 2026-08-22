'use client';

import { useTheme } from 'next-themes';
import { useEffect, useId, useState } from 'react';
import type { MermaidPresentation } from '../lib/docs/mermaid-config';
import { renderMermaid } from '../lib/docs/mermaid-renderer';
import { cn } from '../lib/utils';

type RenderState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error' };

export function MermaidDiagram({
  id,
  title,
  description,
  source,
  unavailableLabel,
  presentation,
}: {
  id?: string;
  title: string;
  description: string;
  source: string;
  unavailableLabel: string;
  presentation: MermaidPresentation;
}) {
  const { resolvedTheme } = useTheme();
  const reactId = useId();
  const diagramId = id ?? reactId;
  const [state, setState] = useState<RenderState>({ status: 'loading' });
  const titleId = `${diagramId}-title`;
  const descriptionId = `${diagramId}-description`;
  const marketing = presentation === 'marketing';

  useEffect(() => {
    if (!resolvedTheme) return;
    let active = true;
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light';
    const renderId = `site-mermaid-${diagramId}-${theme}-${presentation}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    );

    setState({ status: 'loading' });
    void renderMermaid({ id: renderId, source, theme, presentation })
      .then(({ svg }) => {
        if (active) setState({ status: 'ready', svg });
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error(`Could not render Mermaid illustration "${title}".`, error);
        }
        if (active) setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [diagramId, presentation, resolvedTheme, source, title]);

  return (
    <figure
      className={cn(
        marketing
          ? 'site-marketing-mermaid relative w-full overflow-visible py-2'
          : 'docs-mermaid mt-6 overflow-hidden rounded-xl border border-white/[0.065] bg-white/[0.025] p-4 sm:p-5',
      )}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <figcaption
        id={titleId}
        className={marketing ? 'sr-only' : 'text-sm font-semibold text-white/82'}
      >
        {title}
      </figcaption>
      <p
        id={descriptionId}
        className={marketing ? 'sr-only' : 'mt-1 text-sm leading-6 text-white/52'}
      >
        {description}
      </p>
      <div className={marketing ? 'site-marketing-mermaid-viewport' : 'mt-5 min-h-48'}>
        {state.status === 'ready' ? (
          <div
            className={cn(
              'site-mermaid-output',
              marketing
                ? 'site-marketing-mermaid-output'
                : 'docs-mermaid-output',
            )}
            role="img"
            aria-label={description}
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        ) : state.status === 'error' ? (
          <div
            className={cn(
              'flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-5 text-center text-sm text-white/52',
              marketing ? 'h-full min-h-[280px] w-full' : 'min-h-48',
            )}
          >
            {unavailableLabel}
          </div>
        ) : (
          <div
            className={cn(
              'docs-mermaid-loading rounded-xl bg-white/[0.018]',
              marketing ? 'h-full min-h-[280px] w-full' : 'min-h-48',
            )}
            aria-hidden="true"
          />
        )}
      </div>
    </figure>
  );
}
