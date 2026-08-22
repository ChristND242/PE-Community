'use client';

import { type DocsTocItem } from '../../lib/docs/toc';
import { useI18n } from '../../lib/i18n';

export function DocsToc({ items }: { items: DocsTocItem[] }) {
  const { lang } = useI18n();
  const label = lang === 'fr' ? 'Sur cette page' : 'On this page';
  if (!items.length) return null;
  return (
    <aside className="sticky top-24 hidden max-h-[calc(100vh-7rem)] w-[220px] overflow-y-auto border-l border-white/[0.06] pl-5 xl:block">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p>
      <nav className="mt-3 grid gap-1.5">
        {items.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="rounded-lg px-2 py-1 text-sm leading-5 text-white/45 transition hover:bg-white/[0.035] hover:text-emerald-100/85">
            {item.title}
          </a>
        ))}
      </nav>
    </aside>
  );
}
