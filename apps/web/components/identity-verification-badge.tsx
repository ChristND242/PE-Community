'use client';

import { BadgeCheck } from 'lucide-react';
import type { IdentityVerificationKind } from '../lib/identity-verification';
import { useI18n } from '../lib/i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export type IdentityVerificationBadgeSize = 'xs' | 'sm' | 'md';

const iconSizeClasses: Record<IdentityVerificationBadgeSize, string> = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-4',
};

const kindClasses: Record<IdentityVerificationKind, string> = {
  administrator: 'fill-sky-500 text-white dark:fill-sky-400',
  owner: 'fill-amber-400 text-amber-950 dark:fill-amber-300 dark:text-amber-950',
  'official-community': 'fill-sky-500 text-white dark:fill-sky-400',
};

export function IdentityVerificationBadge({ kind, size = 'sm', className = '' }: {
  kind?: IdentityVerificationKind | null;
  size?: IdentityVerificationBadgeSize;
  className?: string;
}) {
  const { t } = useI18n();
  if (!kind) return null;
  const label = kind === 'owner'
    ? t.status.owner
    : kind === 'administrator'
      ? t.dashboard.administratorPublisher
      : t.dashboard.officialCommunityPublication;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`} aria-label={label}>
            <BadgeCheck className={`${iconSizeClasses[size]} ${kindClasses[kind]}`} aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
