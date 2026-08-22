'use client';

import { useI18n } from '../lib/i18n';

export function BrandWordmark({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const [prefix, ...rest] = t.brand.short.split(' ');

  return (
    <span className={`inline-flex items-baseline gap-1.5 font-jakarta font-black tracking-[-0.035em] ${className}`}>
      <span className="text-accent">{prefix}</span>
      <span>{rest.join(' ')}</span>
    </span>
  );
}
