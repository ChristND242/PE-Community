'use client';

import { Braces, Check, ChevronRight, Copy, Variable } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card } from './ui';
import { cn } from '../lib/utils';

export type TemplateToken = {
  value: string;
  label?: string;
  description?: string;
};

export function TemplateTokenCollapsible({
  title,
  description,
  tokens,
  emptyLabel,
  copyLabel,
  copiedLabel,
  copyFailedLabel,
  icon = 'variable',
  className,
}: {
  title: string;
  description: string;
  tokens: TemplateToken[];
  emptyLabel: string;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
  icon?: 'placeholder' | 'variable';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentId = `template-tokens-${useId()}`;
  const HeaderIcon = icon === 'placeholder' ? Braces : Variable;

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  async function copyToken(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      toast.error(copyFailedLabel);
    }
  }

  return (
    <Card className={cn('overflow-hidden rounded-xl border-white/[0.08] bg-black/20 p-0 shadow-none', className)}>
      <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((current) => !current)} className={cn('flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/40', open && 'border-b border-white/[0.07]')}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300"><HeaderIcon size={16} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-white">{title}</span><span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/10 px-1.5 text-[11px] font-bold text-white/60">{tokens.length}</span></span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-white/42">{description}</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" className={cn('shrink-0 text-white/40 transition-transform duration-200', open && 'rotate-90')} />
      </button>

      {open && (
        <div id={contentId} className="divide-y divide-white/[0.07]">
          {tokens.length ? tokens.map((token) => {
            const copied = copiedValue === token.value;
            return (
              <div key={token.value} className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-white/[0.025]">
                <div className="min-w-0 flex-1">
                  <code className="block max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1 font-mono text-xs text-white/72" title={token.value}>{token.value}</code>
                  {(token.label || token.description) && <div className="mt-1.5">{token.label && <p className="text-xs font-medium text-white/72">{token.label}</p>}{token.description && <p className="mt-0.5 text-xs leading-5 text-white/42">{token.description}</p>}</div>}
                </div>
                <button type="button" onClick={() => void copyToken(token.value)} aria-label={`${copyLabel}: ${token.value}`} className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40">
                  {copied ? <Check size={14} className="text-emerald-300" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  <span className="hidden sm:inline" aria-hidden="true">{copied ? copiedLabel : copyLabel}</span>
                  <span className="sr-only" aria-live="polite">{copied ? copiedLabel : ''}</span>
                </button>
              </div>
            );
          }) : <p className="px-4 py-6 text-center text-xs text-white/42">{emptyLabel}</p>}
        </div>
      )}
    </Card>
  );
}
