'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type RowAction = {
  label: string;
  run?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
};

export function RowActionMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    }
    function closeFromEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener('mousedown', closeFromOutside);
    document.addEventListener('keydown', closeFromEscape);
    window.requestAnimationFrame(() => firstEnabledMenuItem(menuRef.current)?.focus());
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
      document.removeEventListener('keydown', closeFromEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function updatePosition() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const menuWidth = 192;
      const measuredHeight = menuRef.current?.offsetHeight ?? Math.max(48, actions.length * 36 + 12);
      const viewportPadding = 12;
      const sideOffset = 6;
      const spaceBelow = window.innerHeight - trigger.bottom - viewportPadding;
      const spaceAbove = trigger.top - viewportPadding;
      const nextPlacement = spaceBelow < measuredHeight + sideOffset && spaceAbove > spaceBelow ? 'top' : 'bottom';
      setPlacement(nextPlacement);
      setMenuStyle({
        position: 'fixed',
        left: Math.max(viewportPadding, Math.min(trigger.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)),
        top: nextPlacement === 'top'
          ? Math.max(viewportPadding, trigger.top - measuredHeight - sideOffset)
          : Math.min(trigger.bottom + sideOffset, window.innerHeight - measuredHeight - viewportPadding),
        width: menuWidth,
        maxHeight: Math.max(96, (nextPlacement === 'top' ? spaceAbove : spaceBelow) - sideOffset),
      });
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [actions.length, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white/45 transition hover:bg-[var(--app-interactive-hover)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 dark:hover:bg-white/[0.07]"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          data-placement={placement}
          style={menuStyle}
          onKeyDown={(event) => navigateMenu(event, menuRef.current)}
          className="z-[240] overflow-y-auto rounded-lg border border-white/10 bg-[#0b1711] p-1.5 shadow-2xl shadow-black/50"
        >
          {actions.map((action) => action.href ? (
            <Link
              key={action.label}
              href={action.href}
              role="menuitem"
              aria-disabled={action.disabled || undefined}
              tabIndex={action.disabled ? -1 : 0}
              onClick={(event) => {
                if (action.disabled) {
                  event.preventDefault();
                  return;
                }
                close();
              }}
              className={`block rounded-md px-3 py-2 text-xs font-semibold outline-none transition focus-visible:bg-[var(--app-interactive-hover)] dark:focus-visible:bg-white/[0.07] ${action.disabled ? 'pointer-events-none opacity-40' : 'text-white/65 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:bg-white/[0.07]'}`}
            >
              {action.label}
            </Link>
          ) : (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                close();
                action.run?.();
              }}
              className={`block w-full cursor-pointer rounded-md px-3 py-2 text-left text-xs font-semibold outline-none transition hover:bg-[var(--app-interactive-hover)] focus-visible:bg-[var(--app-interactive-hover)] dark:hover:bg-white/[0.07] dark:focus-visible:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 ${action.danger ? 'text-rose-200' : 'text-white/65 hover:text-white'}`}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function menuItems(menu: HTMLDivElement | null) {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]):not([aria-disabled="true"])') ?? []);
}

function firstEnabledMenuItem(menu: HTMLDivElement | null) {
  return menuItems(menu)[0];
}

function navigateMenu(event: ReactKeyboardEvent<HTMLDivElement>, menu: HTMLDivElement | null) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = menuItems(menu);
  if (!items.length) return;
  const activeIndex = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'Home') items[0]?.focus();
  else if (event.key === 'End') items.at(-1)?.focus();
  else if (event.key === 'ArrowDown') items[(activeIndex + 1 + items.length) % items.length]?.focus();
  else items[(activeIndex - 1 + items.length) % items.length]?.focus();
}
