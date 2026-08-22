'use client';

import Link from 'next/link';
import { useI18n } from '../../lib/i18n';

export function DocsBreadcrumbs({ current }: { current: string }) {
  const { lang } = useI18n();
  const labels = lang === 'fr' ? { docs: 'Documentation', aria: 'Fil d’Ariane' } : { docs: 'Docs', aria: 'Breadcrumbs' };
  return (
    <nav className="mb-6 flex items-center gap-2 text-sm text-white/40" aria-label={labels.aria}>
      <Link href="/docs" className="transition hover:text-emerald-100/85">{labels.docs}</Link>
      <span aria-hidden="true">/</span>
      <span className="text-white/70" aria-current="page">{current}</span>
    </nav>
  );
}
