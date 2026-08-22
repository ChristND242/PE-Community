'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { resolveUserAvatar } from '../lib/avatar';
import { cn } from '../lib/utils';

const sizeClasses = {
  sm: 'h-9 w-9 rounded-xl text-xs',
  md: 'h-12 w-12 rounded-xl text-sm',
  lg: 'h-16 w-16 rounded-2xl text-lg',
  xl: 'h-32 w-32 rounded-2xl text-3xl',
  frame: 'h-40 w-40 rounded-2xl text-3xl',
  crop: 'h-60 w-60 rounded-2xl text-4xl',
};

export function ProfilePhoto({
  name,
  avatarUrl,
  dicebearStyle,
  dicebearSeed,
  size = 'md',
  alt,
  className,
  imageClassName,
  imageStyle,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
  size?: keyof typeof sizeClasses;
  alt?: string;
  className?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveUserAvatar({ avatarUrl, dicebearStyle, dicebearSeed });
  const showImage = resolved.type !== 'initials' && !failed;
  useEffect(() => {
    setFailed(false);
  }, [resolved.type === 'initials' ? '' : resolved.src]);
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-white/[0.045] font-semibold text-accent shadow-inner shadow-white/5', sizeClasses[size], className)}>
      {showImage ? (
        <img src={resolved.src} alt={alt ?? name ?? ''} onError={() => setFailed(true)} className={cn('mx-auto block h-full w-full object-center', resolved.type === 'dicebear' ? 'object-contain' : 'object-cover', imageClassName)} style={imageStyle} />
      ) : (
        <span aria-label={name ?? undefined}>{initialsFor(name)}</span>
      )}
    </div>
  );
}

export function initialsFor(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const value = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2);
  return (value || 'PE').toUpperCase();
}
