'use client';

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils';

const TooltipDelayContext = createContext(200);
const TooltipContext = createContext<{
  contentId: string;
  open: boolean;
  triggerRef: RefObject<HTMLSpanElement | null>;
} | null>(null);

export function TooltipProvider({ children, delayDuration = 200 }: { children: ReactNode; delayDuration?: number }) {
  return <TooltipDelayContext.Provider value={delayDuration}>{children}</TooltipDelayContext.Provider>;
}

export function Tooltip({ children }: { children: ReactNode }) {
  const delayDuration = useContext(TooltipDelayContext);
  const contentId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  function clearOpenTimer() {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  function openAfterDelay() {
    clearOpenTimer();
    timeoutRef.current = window.setTimeout(() => setOpen(true), delayDuration);
  }

  function close() {
    clearOpenTimer();
    setOpen(false);
  }

  useEffect(() => () => clearOpenTimer(), []);

  return (
    <TooltipContext.Provider value={{ contentId, open, triggerRef }}>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={openAfterDelay}
        onMouseLeave={close}
        onFocusCapture={() => { clearOpenTimer(); setOpen(true); }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      >
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  const context = useContext(TooltipContext);
  const child = Children.only(children);
  if (!context || !isValidElement(child)) return child;
  const element = child as ReactElement<{ tabIndex?: number; 'aria-describedby'?: string }>;
  const nativeInteractive = typeof element.type === 'string' && ['a', 'button', 'input', 'select', 'textarea'].includes(element.type);
  return cloneElement(element, {
    'aria-describedby': context.open ? context.contentId : undefined,
    ...(!nativeInteractive && element.props.tabIndex === undefined ? { tabIndex: 0 } : {}),
  });
}

export function TooltipContent({ className, children, side = 'top', ...props }: HTMLAttributes<HTMLSpanElement> & { side?: 'top' | 'bottom' }) {
  const context = useContext(TooltipContext);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, zIndex: 60, ready: false });

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!mounted || !context?.open) return;
    const trigger = context.triggerRef.current;
    const content = contentRef.current;
    if (!trigger || !content) return;
    const triggerElement = trigger;
    const contentElement = content;

    function updatePosition() {
      const triggerRect = triggerElement.getBoundingClientRect();
      const contentRect = contentElement.getBoundingClientRect();
      const viewportMargin = 8;
      const sideOffset = 8;
      const maxLeft = Math.max(viewportMargin, window.innerWidth - contentRect.width - viewportMargin);
      const left = Math.min(maxLeft, Math.max(viewportMargin, triggerRect.left + (triggerRect.width - contentRect.width) / 2));
      const topPosition = triggerRect.top - contentRect.height - sideOffset;
      const bottomPosition = triggerRect.bottom + sideOffset;
      const preferTop = side === 'top';
      const topFits = topPosition >= viewportMargin;
      const bottomFits = bottomPosition + contentRect.height <= window.innerHeight - viewportMargin;
      const top = preferTop
        ? (topFits || !bottomFits ? topPosition : bottomPosition)
        : (bottomFits || !topFits ? bottomPosition : topPosition);

      let ownerLayer = 0;
      for (let ancestor = triggerElement.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const zIndex = Number.parseInt(window.getComputedStyle(ancestor).zIndex, 10);
        if (Number.isFinite(zIndex)) ownerLayer = Math.max(ownerLayer, zIndex);
      }
      setPosition({ left, top: Math.max(viewportMargin, top), zIndex: Math.max(60, ownerLayer + 10), ready: true });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(triggerElement);
    resizeObserver.observe(contentElement);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      resizeObserver.disconnect();
    };
  }, [context, mounted, side]);

  if (!mounted || !context?.open) return null;
  return createPortal(
    <span
      ref={contentRef}
      id={context.contentId}
      role="tooltip"
      className={cn(
        'pointer-events-none fixed w-max max-w-52 rounded-md border border-[var(--app-border)] bg-[var(--app-tooltip)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-control-foreground)] shadow-xl shadow-black/35',
        className,
      )}
      style={{ left: position.left, top: position.top, zIndex: position.zIndex, visibility: position.ready ? 'visible' : 'hidden' }}
      {...props}
    >
      {children}
    </span>,
    document.body,
  );
}
