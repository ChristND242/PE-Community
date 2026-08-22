'use client';

import { LanguageSwitcher } from '../lib/i18n';
import { ThemeToggle } from './theme-toggle';

export function AuthHeaderControls() {
  return <div className="flex shrink-0 items-center gap-2"><ThemeToggle /><LanguageSwitcher /></div>;
}
