'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { type DocsPage } from '../../lib/docs/content';
import { useI18n } from '../../lib/i18n';

export function DocsNextPrev({ previous, next }: { previous?: DocsPage; next?: DocsPage }) {
  const { lang } = useI18n();
  const labels = lang === 'fr'
    ? { aria: 'Pages de documentation précédente et suivante', previous: 'Précédent', next: 'Suivant' }
    : { aria: 'Next and previous docs pages', previous: 'Previous', next: 'Next' };
  if (!previous && !next) return null;
  return (
    <nav className="mt-14 grid gap-4 border-t border-white/[0.08] pt-8 md:grid-cols-2" aria-label={labels.aria}>
      {previous ? (
        <Link href={previous.href} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-emerald-300/20 hover:bg-white/[0.045]">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40"><ArrowLeft size={14} /> {labels.previous}</span>
          <span className="mt-2 block text-sm font-semibold text-white">{previous.title}</span>
        </Link>
      ) : <span />}
      {next && (
        <Link href={next.href} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-emerald-300/20 hover:bg-white/[0.045] md:text-right">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/40 md:justify-end">{labels.next} <ArrowRight size={14} /></span>
          <span className="mt-2 block text-sm font-semibold text-white">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
