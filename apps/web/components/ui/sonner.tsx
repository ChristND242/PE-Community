'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      position="top-center"
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-2xl !border !border-[var(--app-border)] !bg-[var(--app-toast)] !text-[var(--app-foreground)] !shadow-2xl !shadow-black/35 !backdrop-blur-xl',
          title: 'text-sm font-semibold !text-[var(--app-foreground)]',
          description: 'text-sm !text-[var(--app-muted-foreground)]',
          success: '!border-emerald-300/20',
          error: '!border-rose-300/20',
          info: '!border-cyan-300/20',
          warning: '!border-amber-300/20',
          loading: '!border-[var(--app-border)]',
          icon: 'text-accent',
          actionButton: '!rounded-full !bg-accent !px-3 !py-1.5 !text-[#04100b]',
          cancelButton: '!rounded-full !bg-[var(--app-panel-muted)] !px-3 !py-1.5 !text-[var(--app-foreground)]',
          closeButton: '!border-[var(--app-border)] !bg-[var(--app-elevated)] !text-[var(--app-muted-foreground)] hover:!bg-[var(--app-panel-muted)] hover:!text-[var(--app-foreground)]',
        },
      }}
    />
  );
}
