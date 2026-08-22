'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { getDocsNavigation } from '../../lib/docs/navigation';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { DocsLanguageToggle } from './docs-language-toggle';
import { DocsSearch } from './docs-search';

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const { lang } = useI18n();
  const navigation = getDocsNavigation(lang);
  const labels = lang === 'fr'
    ? { open: 'Ouvrir la navigation docs', close: 'Fermer la navigation docs', title: 'Navigation docs', language: 'Langue' }
    : { open: 'Open docs navigation', close: 'Close docs navigation', title: 'Docs navigation', language: 'Language' };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white lg:hidden" aria-label={labels.open} aria-expanded={open} aria-controls={drawerId}>
        <Menu size={19} aria-hidden="true" />
      </button>
      {open && (
        <div id={drawerId} role="dialog" aria-modal="true" aria-label={labels.title} className="docs-mobile-panel fixed inset-0 z-[70] max-h-dvh overflow-hidden bg-[#07110d]">
          <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-5">
            <span className="font-semibold text-white">{labels.title}</span>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white" aria-label={labels.close}>
              <X size={19} aria-hidden="true" />
            </button>
          </div>
          <nav className="h-[calc(100vh-64px)] overflow-y-auto px-5 py-6">
            <div className="mb-6 grid gap-4">
              <DocsSearch />
              <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                <span className="text-sm text-white/52">{labels.language}</span>
                <DocsLanguageToggle />
              </div>
            </div>
            <div className="grid gap-7">
              {navigation.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/32">{group.title}</p>
                  <div className="grid gap-1">
                    {group.items.map((item) => {
                      const active = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setOpen(false)}
                          className={cn('rounded-xl border border-transparent px-3 py-2.5 text-sm transition', active ? 'border-emerald-300/[0.12] bg-emerald-400/[0.09] text-emerald-50' : 'text-white/62 hover:bg-white/[0.045] hover:text-white/80')}
                        >
                          {item.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
