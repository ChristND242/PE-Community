'use client';

import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function TooltipProvider({ children }: { children: ReactNode; delayDuration?: number }) {
  return children;
}

export function Tooltip({ children }: { children: ReactNode }) {
  return <span className="group/tooltip relative inline-flex">{children}</span>;
}

export function TooltipTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  return children;
}

export function TooltipContent({ className, children, side = 'top', ...props }: HTMLAttributes<HTMLSpanElement> & { side?: 'top' | 'bottom' }) {
  return (
    <span
      role="tooltip"
      className={cn(
        'pointer-events-none absolute left-1/2 z-50 w-max max-w-52 -translate-x-1/2 rounded-md border border-[var(--app-border)] bg-[var(--app-tooltip)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-control-foreground)] opacity-0 shadow-xl shadow-black/35 transition-opacity delay-200 duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
        side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
