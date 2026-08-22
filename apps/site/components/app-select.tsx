'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
};

export function AppSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
  disabled,
  dense = false,
  placeholder,
  ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  dense?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const updatePlacement = () => {
      const trigger = rootRef.current?.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 288;
      if (!trigger) return;
      const spaceBelow = window.innerHeight - trigger.bottom;
      const spaceAbove = trigger.top;
      const nextPlacement = spaceBelow < menuHeight + 16 && spaceAbove > spaceBelow ? 'top' : 'bottom';
      const availableSpace = Math.max(160, (nextPlacement === 'top' ? spaceAbove : spaceBelow) - 16);
      const menuWidth = Math.max(trigger.width, 160);
      setPlacement(nextPlacement);
      setMenuStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(trigger.right - menuWidth, window.innerWidth - menuWidth - 8)),
        top: nextPlacement === 'top' ? Math.max(8, trigger.top - Math.min(menuHeight, availableSpace) - 8) : Math.min(trigger.bottom + 8, window.innerHeight - Math.min(menuHeight, availableSpace) - 8),
        maxHeight: availableSpace,
        width: menuWidth,
      });
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative min-w-[10rem]', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-white/42">{label}</span>}
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#050907] px-3 text-left text-sm font-medium text-white/82 shadow-lg shadow-black/10 outline-none transition-colors duration-200 hover:border-white/20 hover:bg-[#0a120e] focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn('truncate', !selected && 'text-white/38')}>{selected?.label ?? placeholder ?? options[0]?.label}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-white/45 transition', open && 'rotate-180 text-accent')} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle}
          className="z-[100] overflow-y-auto rounded-xl border border-white/[0.10] bg-[#07100b] p-1 shadow-2xl shadow-black/50"
          data-placement={placement}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  dense ? 'flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm outline-none transition-colors duration-200 focus:bg-white/[0.06]' : 'flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm outline-none transition-colors duration-200 focus:bg-white/[0.06]',
                  active ? 'bg-emerald-400/[0.12] text-emerald-200' : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
                )}
              >
                <span>{option.label}</span>
                {active && <Check size={15} />}
              </button>
            );
          })}
        </div>
      , document.body)}
    </div>
  );
}
