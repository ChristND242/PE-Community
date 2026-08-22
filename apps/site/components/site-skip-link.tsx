'use client';

import { useI18n } from '../lib/i18n';

export function SiteSkipLink() {
  const { lang } = useI18n();
  return (
    <a
      href="#main-content"
      className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-full bg-emerald-300 px-4 py-2 text-sm font-bold text-black transition focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {lang === 'fr' ? 'Aller au contenu principal' : 'Skip to main content'}
    </a>
  );
}
