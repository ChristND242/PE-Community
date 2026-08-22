'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const selectTheme = (theme: 'light' | 'dark') => {
    if (mounted) setTheme(theme);
  };

  return (
    <div
      className={`site-theme-switch group inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] px-1 ${className}`}
      data-state={mounted ? (isDark ? 'checked' : 'unchecked') : 'pending'}
    >
      <button
        type="button"
        onClick={() => selectTheme('light')}
        disabled={!mounted}
        aria-label={t.common.useLightMode}
        aria-pressed={mounted && !isDark}
        className="site-theme-icon grid h-6 w-6 place-items-center rounded-full text-white/42 transition hover:bg-white/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-wait group-data-[state=unchecked]:text-accent"
      >
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={t.common.switchAppearance}
        disabled={!mounted}
        onClick={() => selectTheme(isDark ? 'light' : 'dark')}
        className="site-theme-track relative h-4 w-8 shrink-0 rounded-full border border-white/15 bg-black/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-wait group-data-[state=checked]:bg-accent/30 group-data-[state=unchecked]:bg-emerald-900/15"
      >
        <span className={`site-theme-thumb absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-accent shadow-sm transition-transform ${isDark ? 'translate-x-3.5' : 'translate-x-0'}`} />
      </button>
      <button
        type="button"
        onClick={() => selectTheme('dark')}
        disabled={!mounted}
        aria-label={t.common.useDarkMode}
        aria-pressed={mounted && isDark}
        className="site-theme-icon grid h-6 w-6 place-items-center rounded-full text-white/42 transition hover:bg-white/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-wait group-data-[state=checked]:text-accent"
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
