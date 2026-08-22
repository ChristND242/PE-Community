import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  Sparkles,
} from 'lucide-react';
import { type DocsCalloutVariant } from '../../lib/docs/content';
import { cn } from '../../lib/utils';

const variants: Record<
  DocsCalloutVariant,
  { icon: typeof Info; className: string; label: string }
> = {
  note: {
    icon: Info,
    className:
      'border-sky-700/20 bg-sky-100/55 text-sky-900 dark:border-sky-300/20 dark:bg-sky-300/[0.08] dark:text-sky-50',
    label: 'Note',
  },
  warning: {
    icon: AlertTriangle,
    className:
      'border-amber-700/25 bg-amber-100/60 text-amber-900 dark:border-amber-300/22 dark:bg-amber-300/[0.09] dark:text-amber-50',
    label: 'Warning',
  },
  security: {
    icon: Lock,
    className:
      'border-emerald-700/20 bg-emerald-100/60 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/[0.08] dark:text-emerald-50',
    label: 'Security',
  },
  production: {
    icon: CheckCircle2,
    className:
      'border-emerald-700/20 bg-emerald-100/60 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/[0.08] dark:text-emerald-50',
    label: 'Production',
  },
  tip: {
    icon: Sparkles,
    className:
      'border-violet-700/20 bg-violet-100/55 text-violet-900 dark:border-violet-300/20 dark:bg-violet-300/[0.08] dark:text-violet-50',
    label: 'Tip',
  },
};

export function DocsCallout({
  variant = 'note',
  title,
  children,
  showIcon = true,
}: {
  variant?: DocsCalloutVariant;
  title: string;
  children: React.ReactNode;
  showIcon?: boolean;
}) {
  const config = variants[variant];
  const Icon = config.icon;
  return (
    <aside className={cn('my-6 rounded-2xl border p-[18px]', config.className)}>
      <div className="flex gap-3">
        {showIcon && <Icon className="mt-0.5 h-5 w-5 shrink-0" />}
        <div>
          <p className="text-sm font-semibold tracking-[-0.01em]">{title}</p>
          <div className="mt-2 text-sm leading-6 opacity-75">{children}</div>
        </div>
      </div>
    </aside>
  );
}
