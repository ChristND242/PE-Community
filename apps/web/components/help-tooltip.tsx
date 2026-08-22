'use client';

import { CircleHelp } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function HelpTooltip({ content }: { content: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 240;
      setStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
        top: Math.max(8, rect.top - 8),
        width,
        transform: 'translateY(-100%)',
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label={content}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-grid h-5 w-5 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/42 transition hover:border-emerald-300/25 hover:text-emerald-200 focus:border-emerald-300/35 focus:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/[0.12]"
      >
        <CircleHelp size={12} />
      </button>
      {open && createPortal(
        <div id={id} role="tooltip" style={style} className="z-[120] rounded-lg border border-white/10 bg-[#07100b]/95 px-3 py-2 text-xs leading-5 text-white/70 shadow-2xl shadow-black/45 backdrop-blur">
          {content}
        </div>,
        document.body,
      )}
    </>
  );
}
