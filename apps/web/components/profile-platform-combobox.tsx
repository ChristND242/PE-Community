'use client';

import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';
import { profileLinkDefinition, type ProfileLinkPlatform, type ProfilePlatformDefinition } from '../lib/profile-links';

type Position = { left: number; top?: number; bottom?: number; width: number };

export function ProfilePlatformCombobox({
  value,
  options,
  labels,
  searchLabel,
  emptyLabel,
  onChange,
}: {
  value: ProfileLinkPlatform;
  options: readonly ProfilePlatformDefinition[];
  labels: Record<ProfileLinkPlatform, string>;
  searchLabel: string;
  emptyLabel: string;
  onChange: (value: ProfileLinkPlatform) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = profileLinkDefinition(value);
  const SelectedIcon = selected.icon;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized ? options.filter((option) => labels[option.value].toLocaleLowerCase().includes(normalized)) : [...options];
  }, [labels, options, query]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const gap = 6;
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding);
      const estimatedHeight = 304;
      const roomBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      setPosition(roomBelow >= Math.min(estimatedHeight, rect.top - gap - viewportPadding)
        ? { left, top: rect.bottom + gap, width }
        : { left, bottom: window.innerHeight - rect.top + gap, width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !contentRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function select(platform: ProfileLinkPlatform) {
    onChange(platform);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((current) => event.key === 'ArrowDown' ? (current + 1) % filtered.length : (current - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      select(filtered[activeIndex].value);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls="profile-platform-options"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 flex h-10 w-full items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/35"
      >
        <span className="flex min-w-0 items-center gap-2"><SelectedIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{labels[value]}</span></span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-45" aria-hidden="true" />
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={contentRef}
          style={position}
          className="fixed z-50 overflow-hidden rounded-xl border border-white/10 bg-[#0a120f] p-2 shadow-2xl shadow-black/45"
        >
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" aria-hidden="true" />
            <span className="sr-only">{searchLabel}</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={onInputKeyDown}
              placeholder={searchLabel}
              role="searchbox"
              className="h-9 w-full rounded-lg border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/35"
            />
          </label>
          <div id="profile-platform-options" role="listbox" className="chat-scrollbar mt-2 max-h-60 overflow-y-auto">
            {filtered.length ? filtered.map((platform, index) => {
              const Icon = platform.icon;
              const selectedOption = platform.value === value;
              return (
                <button
                  key={platform.value}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(platform.value)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition', index === activeIndex ? 'bg-[var(--app-interactive-open)] text-white dark:bg-white/[0.07]' : 'text-white/65 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:bg-white/[0.05]')}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{labels[platform.value]}</span>
                  {selectedOption && <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />}
                </button>
              );
            }) : <p className="px-3 py-5 text-center text-sm text-white/40">{emptyLabel}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
