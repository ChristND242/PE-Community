'use client';

import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';

export function DocsLanguageToggle() {
  const { lang, setLang } = useI18n();
  const label = lang === 'fr' ? 'Langue de la documentation' : 'Documentation language';
  return (
    <div className="site-language-toggle flex rounded-full border border-white/[0.08] bg-white/[0.025] p-0.5" aria-label={label}>
      {(['en', 'fr'] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLang(item)}
          className={cn(
            'h-8 rounded-full px-3 text-xs font-semibold uppercase tracking-[0.08em] transition',
            lang === item ? 'bg-white/[0.09] text-white' : 'text-white/45 hover:text-white/75',
          )}
          aria-pressed={lang === item}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
