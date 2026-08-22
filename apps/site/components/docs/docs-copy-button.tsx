'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  getDocsCopyLabels,
  type DocsCopyState,
  writeClipboardText,
} from '../../lib/docs/copy';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';

export function DocsCopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [state, setState] = useState<DocsCopyState>('idle');
  const timeoutRef = useRef<number | null>(null);
  const pendingRef = useRef(false);
  const { lang } = useI18n();
  const labels = getDocsCopyLabels(lang);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  async function copy() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    try {
      await writeClipboardText(value);
      setState('copied');
    } catch {
      setState('failed');
    } finally {
      pendingRef.current = false;
      timeoutRef.current = window.setTimeout(() => setState('idle'), 1600);
    }
  }

  const label = labels[state];

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label.ariaLabel}
      data-state={state}
      className={cn(
        'docs-code-copy inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.035] px-2.5 text-xs font-semibold text-white/58 transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.07] hover:text-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/45 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {state === 'copied' ? (
        <Check size={14} aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
      {label.text}
    </button>
  );
}
