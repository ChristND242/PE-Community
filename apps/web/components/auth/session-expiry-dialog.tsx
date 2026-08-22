'use client';

import { useEffect, useId, useRef } from 'react';
import { LoadingButton } from '../../components/ui';

export function SessionExpiryDialog({
  title,
  description,
  countdown,
  continueLabel,
  renewingLabel,
  retryMessage,
  announcement,
  renewing,
  onContinue,
}: {
  title: string;
  description: string;
  countdown: string;
  continueLabel: string;
  renewingLabel: string;
  retryMessage: string;
  announcement: string;
  renewing: boolean;
  onContinue: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', trapFocus, true);
    return () => {
      window.removeEventListener('keydown', trapFocus, true);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/75 p-4 backdrop-blur-md motion-reduce:backdrop-blur-none">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-amber-200/20 bg-[#0a1410] p-6 shadow-2xl shadow-black/60 sm:p-7"
      >
        <h2 id={titleId} className="text-xl font-semibold text-white">{title}</h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-white/62">{description}</p>
        <p className="mt-6 text-center font-mono text-5xl font-semibold tabular-nums text-amber-200" aria-label={countdown}>{countdown}</p>
        {retryMessage && <p role="status" className="mt-4 text-sm leading-6 text-amber-100/75">{retryMessage}</p>}
        <LoadingButton loading={renewing} loadingLabel={renewingLabel} onClick={onContinue} className="mt-6 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/50">
          {continueLabel}
        </LoadingButton>
        <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
      </div>
    </div>
  );
}
