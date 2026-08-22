'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { Button } from './ui';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme !== 'light';
  const label = isDark ? t.common.switchToLightMode : t.common.switchToDarkMode;

  return (
    <Button
      type="button"
      disabled={!mounted}
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'h-9 w-9 cursor-pointer rounded-full border bg-transparent p-0 shadow-none focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-55',
        isDark
          ? 'border-amber-400/65 text-amber-300 hover:bg-amber-400/10 focus-visible:border-amber-300 focus-visible:ring-amber-300/35'
          : 'border-sky-600/55 text-sky-700 hover:bg-sky-600/10 focus-visible:border-sky-600 focus-visible:ring-sky-600/25',
        className,
      )}
    >
      <span className="grid h-[18px] w-[18px] place-items-center" aria-hidden="true">
        {mounted ? (isDark ? <Sun size={17} /> : <Moon size={17} />) : <span className="h-4 w-4 rounded-full border border-current/40" />}
      </span>
    </Button>
  );
}
