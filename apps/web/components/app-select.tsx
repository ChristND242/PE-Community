'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
};

type SelectPositioningRect = Pick<DOMRect, 'bottom' | 'height' | 'left' | 'right' | 'top' | 'width'>;

export type AppSelectContainedPositioning = {
  boundaryRef: RefObject<HTMLElement | null>;
  portalRef: RefObject<HTMLElement | null>;
};

export function resolveSelectMenuPosition({
  trigger,
  boundary,
  portal,
  viewportWidth,
  viewportHeight,
  menuHeight,
  requestedWidth,
}: {
  trigger: SelectPositioningRect;
  boundary?: SelectPositioningRect;
  portal?: SelectPositioningRect;
  viewportWidth: number;
  viewportHeight: number;
  menuHeight: number;
  requestedWidth: number;
}) {
  const edgePadding = 8;
  const sideOffset = 8;
  const boundaryTop = Math.max(edgePadding, (boundary?.top ?? 0) + edgePadding);
  const boundaryRight = Math.min(viewportWidth - edgePadding, (boundary?.right ?? viewportWidth) - edgePadding);
  const boundaryBottom = Math.min(viewportHeight - edgePadding, (boundary?.bottom ?? viewportHeight) - edgePadding);
  const boundaryLeft = Math.max(edgePadding, (boundary?.left ?? 0) + edgePadding);
  const spaceBelow = Math.max(0, boundaryBottom - trigger.bottom - sideOffset);
  const spaceAbove = Math.max(0, trigger.top - boundaryTop - sideOffset);
  const placement = spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
  const availableSpace = placement === 'top' ? spaceAbove : spaceBelow;
  const renderedHeight = Math.min(menuHeight, availableSpace);
  const availableWidth = Math.max(0, boundaryRight - boundaryLeft);
  const width = Math.min(requestedWidth, availableWidth);
  const viewportLeft = Math.max(boundaryLeft, Math.min(trigger.left, boundaryRight - width));
  const viewportTop = placement === 'top'
    ? trigger.top - renderedHeight - sideOffset
    : trigger.bottom + sideOffset;

  return {
    placement: placement as 'top' | 'bottom',
    style: {
      left: viewportLeft - (portal?.left ?? 0),
      top: viewportTop - (portal?.top ?? 0),
      maxHeight: availableSpace,
      width,
    },
  };
}

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
  menuWidth,
  wrapOptions = false,
  containedPositioning,
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
  menuWidth?: number;
  wrapOptions?: boolean;
  containedPositioning?: AppSelectContainedPositioning;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const options = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      const selectedIndex = Math.max(0, options ? Array.from(options).findIndex((option) => option.getAttribute('aria-selected') === 'true') : 0);
      options?.[selectedIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePlacement = () => {
      const trigger = containedPositioning
        ? triggerRef.current?.getBoundingClientRect()
        : rootRef.current?.getBoundingClientRect();
      const menuHeight = containedPositioning
        ? menuRef.current?.scrollHeight ?? 288
        : menuRef.current?.offsetHeight ?? 288;
      if (!trigger) return;
      if (!containedPositioning) {
        const spaceBelow = window.innerHeight - trigger.bottom;
        const spaceAbove = trigger.top;
        const nextPlacement = spaceBelow < menuHeight + 16 && spaceAbove > spaceBelow ? 'top' : 'bottom';
        const availableSpace = Math.max(160, (nextPlacement === 'top' ? spaceAbove : spaceBelow) - 16);
        const resolvedMenuWidth = Math.min(
          Math.max(trigger.width, menuWidth ?? 160),
          window.innerWidth - 16,
        );
        setPlacement(nextPlacement);
        setMenuStyle({
          position: 'fixed',
          left: Math.max(8, Math.min(trigger.right - resolvedMenuWidth, window.innerWidth - resolvedMenuWidth - 8)),
          top: nextPlacement === 'top' ? Math.max(8, trigger.top - Math.min(menuHeight, availableSpace) - 8) : Math.min(trigger.bottom + 8, window.innerHeight - Math.min(menuHeight, availableSpace) - 8),
          maxHeight: availableSpace,
          width: resolvedMenuWidth,
        });
        return;
      }
      const portalElement = containedPositioning?.portalRef.current;
      const resolved = resolveSelectMenuPosition({
        trigger,
        boundary: containedPositioning?.boundaryRef.current?.getBoundingClientRect(),
        portal: portalElement?.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        menuHeight,
        requestedWidth: Math.max(trigger.width, menuWidth ?? 160),
      });
      setPlacement(resolved.placement);
      setMenuStyle({
        position: portalElement ? 'absolute' : 'fixed',
        ...resolved.style,
      });
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [containedPositioning?.boundaryRef, containedPositioning?.portalRef, menuWidth, open]);

  const portalTarget = containedPositioning?.portalRef.current ?? (typeof document === 'undefined' ? null : document.body);

  return (
    <div ref={rootRef} className={cn('relative min-w-[10rem]', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-muted-foreground)]">{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setMenuStyle(null);
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setMenuStyle(null);
            setOpen(true);
          }
        }}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-left text-sm font-medium text-[var(--app-foreground)] shadow-lg shadow-black/10 outline-none transition-colors duration-200 hover:border-emerald-500/30 hover:bg-[var(--app-input-hover)] focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span title={selected?.label} className={cn('truncate', !selected && 'text-[var(--app-muted-foreground)]')}>{selected?.label ?? placeholder ?? options[0]?.label}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-[var(--app-muted-foreground)] transition', open && 'rotate-180 text-accent')} />
      </button>
      {open && portalTarget && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle ?? { position: containedPositioning?.portalRef.current ? 'absolute' : 'fixed', visibility: 'hidden' }}
          className="z-[100] overflow-y-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] p-1 text-[var(--app-foreground)] shadow-2xl shadow-black/25 [scrollbar-gutter:stable]"
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
                  triggerRef.current?.focus();
                }}
                onKeyDown={(event) => {
                  const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
                  const index = buttons.indexOf(event.currentTarget);
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
                    buttons[nextIndex]?.focus();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                  if (event.key === 'Tab') setOpen(false);
                }}
                className={cn(
                  dense ? 'flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-sm outline-none transition-colors duration-200 focus:bg-[var(--app-interactive-hover)] dark:focus:bg-white/[0.06]' : 'flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm outline-none transition-colors duration-200 focus:bg-[var(--app-interactive-hover)] dark:focus:bg-white/[0.06]',
                  wrapOptions && 'h-auto min-h-9 items-start py-2',
                  active ? 'bg-emerald-400/[0.12] text-emerald-200' : 'text-white/70 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:bg-white/[0.06]',
                )}
              >
                <span className={cn('min-w-0 flex-1', wrapOptions && 'whitespace-normal break-words leading-5')}>{option.label}</span>
                {active && <Check size={15} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      , containedPositioning?.portalRef.current ?? document.body)}
    </div>
  );
}
