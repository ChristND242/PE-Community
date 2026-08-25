import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppSelect } from './app-select';
import { cn } from '../lib/utils';

export function Button({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-bold text-[var(--app-accent-foreground)] transition hover:bg-[var(--app-accent-hover)] disabled:opacity-50', className)} {...props} />;
}

export function GhostLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={cn('rounded-full border border-[var(--app-border)] px-4 py-2 text-sm font-semibold text-[var(--app-control-foreground)] transition hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-foreground)]', className)}>{children}</Link>;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-5 shadow-2xl shadow-black/20', className)} {...props} />;
}

export function StatusBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const tones = { good: 'app-status-success', warn: 'app-status-warning', bad: 'app-status-danger', neutral: 'app-status-neutral' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-white/60">{text}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} aria-hidden="true" />;
}

export function LoadingButton({
  loading,
  loadingLabel,
  children,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }) {
  return (
    <Button className={cn('gap-2', className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner />}
      {loading ? (loadingLabel ?? children) : children}
    </Button>
  );
}

export function TableEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-10 text-center">
      <p className="text-sm font-semibold text-white">{title}</p>
      {description && <p className="mt-2 text-sm text-white/50">{description}</p>}
    </div>
  );
}

export function TableErrorState({ title, retryLabel, onRetry }: { title: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="app-callout-danger flex flex-col gap-3 rounded-xl border px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span>{title}</span>
      <Button onClick={onRetry} className="bg-[var(--app-error-foreground)] text-[var(--app-dialog)] hover:brightness-110">{retryLabel}</Button>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="grid animate-pulse gap-3 border-b border-white/10 px-4 py-4 last:border-b-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, column) => (
            <span key={column} className="h-4 rounded bg-white/10" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DataTablePagination({
  page,
  pageSize,
  pageSizeOptions,
  total,
  previousLabel,
  nextLabel,
  rowsPerPageLabel,
  showingLabel,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  total: number;
  previousLabel: string;
  nextLabel: string;
  rowsPerPageLabel: string;
  showingLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between">
      <span>{showingLabel}</span>
      <div className="flex flex-wrap items-center gap-3">
        <AppSelect value={pageSize} label={rowsPerPageLabel} options={pageSizeOptions.map((option) => ({ value: option, label: String(option) }))} onChange={onPageSizeChange} className="min-w-[7rem]" />
        <button
          type="button"
          aria-label={previousLabel}
          title={previousLabel}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-white/10 bg-transparent text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={nextLabel}
          title={nextLabel}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-white/10 bg-transparent text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  loading,
  loadingLabel,
  danger,
  confirmClassName,
  overlayClassName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  danger?: boolean;
  confirmClassName?: string;
  overlayClassName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const loadingRef = useRef(Boolean(loading));
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  const descriptionId = useId();
  loadingRef.current = Boolean(loading);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      buttons?.item(buttons.length - 1)?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!loadingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'));
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div data-confirm-dialog-root className="fixed inset-0 z-[80] grid h-dvh place-items-center p-4">
      <div data-confirm-dialog-overlay aria-hidden="true" className={cn('fixed inset-0 z-0 bg-[var(--app-overlay)]', overlayClassName)} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-dialog)] p-5 text-[var(--app-foreground)] shadow-2xl shadow-black/50">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--app-foreground)]">{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--app-muted-foreground)]">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button className="bg-[var(--app-panel-muted)] text-[var(--app-foreground)] hover:brightness-95" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <LoadingButton loading={loading} loadingLabel={loadingLabel} onClick={onConfirm} className={cn(danger && 'bg-rose-200 text-rose-950 hover:bg-rose-100', confirmClassName)}>{confirmLabel}</LoadingButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card><p className="text-sm text-white/55">{label}</p><p className="mt-3 text-3xl font-black text-white">{value}</p></Card>;
}

export function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs text-white/60"><span>{item.label}</span><span>{item.value}</span></div>
          <div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-accent to-cyan-300" style={{ width: `${(item.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
