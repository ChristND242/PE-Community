import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function ButtonGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      className={cn('inline-flex shrink-0 items-center overflow-visible rounded-xl border border-white/10 bg-white/[0.035] shadow-sm shadow-black/20', className)}
      {...props}
    />
  );
}
