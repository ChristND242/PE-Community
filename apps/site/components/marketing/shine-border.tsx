import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type ShineBorderProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  borderRadiusClassName?: string;
  borderWidth?: number;
  duration?: number;
};

export function ShineBorder({
  children,
  className,
  contentClassName,
  borderRadiusClassName = 'rounded-[28px]',
  borderWidth = 1,
  duration = 7,
}: ShineBorderProps) {
  return (
    <div
      className={cn('relative isolate overflow-hidden bg-white/10', borderRadiusClassName, className)}
      style={{ padding: borderWidth }}
    >
      <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', borderRadiusClassName)}>
        <div
          className="marketing-shine-border absolute -inset-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(52,211,153,0.05)_55deg,rgba(110,231,183,0.55)_92deg,rgba(45,212,191,0.20)_125deg,transparent_170deg,transparent_360deg)] opacity-70"
          style={{ animationDuration: `${duration}s` }}
        />
      </div>
      <div className={cn('relative z-10 h-full overflow-hidden', borderRadiusClassName, contentClassName)}>
        {children}
      </div>
    </div>
  );
}
