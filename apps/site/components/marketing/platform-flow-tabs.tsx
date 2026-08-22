'use client';

import {
  Bell,
  CalendarDays,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/utils';

type PlatformFlowTabItem = {
  id: string;
  key: string;
  label: string;
  title: string;
  description: string;
  capabilities: string[];
};

type PlatformFlowVisual = {
  activeBackgroundClass: string;
  activeIndicatorClass: string;
  accentClass: string;
  accentLineClass: string;
  cardBackgroundClass: string;
  cardBorderClass: string;
  glowClass: string;
  iconBackgroundClass: string;
  iconTextClass: string;
  rowClass: string;
  rowDotClass: string;
};

const icons: Record<string, LucideIcon> = {
  configure: Settings,
  members: Users,
  operations: CalendarDays,
  notifications: Bell,
};

const visuals: Record<string, PlatformFlowVisual> = {
  configure: {
    activeBackgroundClass: 'border-emerald-300/25 bg-emerald-300/[0.10]',
    activeIndicatorClass: 'bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.34)]',
    accentClass: 'text-emerald-200',
    accentLineClass: 'bg-emerald-300/40',
    cardBackgroundClass: 'bg-[radial-gradient(circle_at_86%_12%,rgba(52,211,153,0.15),transparent_32%),linear-gradient(145deg,rgba(16,185,129,0.08),rgba(13,20,18,0.96)_58%)]',
    cardBorderClass: 'border-emerald-300/20',
    glowClass: 'bg-emerald-300/[0.10]',
    iconBackgroundClass: 'border-emerald-300/20 bg-emerald-300/[0.10]',
    iconTextClass: 'text-emerald-200',
    rowClass: 'border-emerald-200/10 bg-emerald-300/[0.035]',
    rowDotClass: 'bg-emerald-300',
  },
  members: {
    activeBackgroundClass: 'border-cyan-300/25 bg-cyan-300/[0.09]',
    activeIndicatorClass: 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.30)]',
    accentClass: 'text-cyan-200',
    accentLineClass: 'bg-cyan-300/40',
    cardBackgroundClass: 'bg-[radial-gradient(circle_at_86%_12%,rgba(34,211,238,0.15),transparent_32%),linear-gradient(145deg,rgba(8,145,178,0.08),rgba(13,20,18,0.96)_58%)]',
    cardBorderClass: 'border-cyan-300/20',
    glowClass: 'bg-cyan-300/[0.10]',
    iconBackgroundClass: 'border-cyan-300/20 bg-cyan-300/[0.10]',
    iconTextClass: 'text-cyan-200',
    rowClass: 'border-cyan-200/10 bg-cyan-300/[0.035]',
    rowDotClass: 'bg-cyan-300',
  },
  operations: {
    activeBackgroundClass: 'border-violet-300/25 bg-violet-300/[0.09]',
    activeIndicatorClass: 'bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.30)]',
    accentClass: 'text-violet-200',
    accentLineClass: 'bg-violet-300/40',
    cardBackgroundClass: 'bg-[radial-gradient(circle_at_86%_12%,rgba(139,92,246,0.16),transparent_32%),linear-gradient(145deg,rgba(99,102,241,0.08),rgba(13,20,18,0.96)_58%)]',
    cardBorderClass: 'border-violet-300/20',
    glowClass: 'bg-violet-300/[0.10]',
    iconBackgroundClass: 'border-violet-300/20 bg-violet-300/[0.10]',
    iconTextClass: 'text-violet-200',
    rowClass: 'border-violet-200/10 bg-violet-300/[0.035]',
    rowDotClass: 'bg-violet-300',
  },
  notifications: {
    activeBackgroundClass: 'border-amber-300/25 bg-amber-300/[0.09]',
    activeIndicatorClass: 'bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.28)]',
    accentClass: 'text-amber-200',
    accentLineClass: 'bg-amber-300/40',
    cardBackgroundClass: 'bg-[radial-gradient(circle_at_86%_12%,rgba(251,191,36,0.15),transparent_32%),linear-gradient(145deg,rgba(245,158,11,0.07),rgba(13,20,18,0.96)_58%)]',
    cardBorderClass: 'border-amber-300/20',
    glowClass: 'bg-amber-300/[0.09]',
    iconBackgroundClass: 'border-amber-300/20 bg-amber-300/[0.10]',
    iconTextClass: 'text-amber-200',
    rowClass: 'border-amber-200/10 bg-amber-300/[0.035]',
    rowDotClass: 'bg-amber-300',
  },
};

const fallbackVisual = visuals.configure;
const activeBackgroundLayoutId = 'platform-flow-active-background';
const activeIndicatorLayoutId = 'platform-flow-active-indicator';

export function PlatformFlowTabs({
  items,
  label,
}: {
  items: readonly PlatformFlowTabItem[];
  label: string;
}) {
  const [activeTab, setActiveTab] = useState(items[0]?.key ?? '');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldReduceMotion = useReducedMotion();
  const activeItem = items.find((item) => item.key === activeTab) ?? items[0];

  if (!activeItem) return null;
  const activeVisual = visuals[activeItem.key] ?? fallbackVisual;
  const ActiveIcon = icons[activeItem.key] ?? Settings;

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const previousKeys = ['ArrowLeft', 'ArrowUp'];
    const nextKeys = ['ArrowRight', 'ArrowDown'];
    let nextIndex = index;

    if (previousKeys.includes(event.key)) nextIndex = (index - 1 + items.length) % items.length;
    else if (nextKeys.includes(event.key)) nextIndex = (index + 1) % items.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = items.length - 1;
    else return;

    event.preventDefault();
    const nextItem = items[nextIndex];
    if (!nextItem) return;
    setActiveTab(nextItem.key);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="mt-10 grid min-w-0 gap-6 md:mt-12 lg:grid-cols-[minmax(15rem,0.38fr)_minmax(0,1fr)] lg:gap-10">
      <div
        aria-label={label}
        className="chat-scrollbar flex min-w-0 gap-2 overflow-x-auto border-b border-border pb-3 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8"
        role="tablist"
      >
        {items.map((item, index) => {
          const active = item.key === activeItem.key;
          const Icon = icons[item.key] ?? Settings;
          const visual = visuals[item.key] ?? fallbackVisual;
          return (
            <button
              key={item.key}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`platform-flow-tab-${item.key}`}
              type="button"
              role="tab"
              aria-controls={`platform-flow-panel-${item.key}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(item.key)}
              onKeyDown={(event) => selectFromKeyboard(event, index)}
              data-tone={item.key}
              className={cn(
                'site-flow-tab group relative flex min-h-14 shrink-0 cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-4 py-3 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:w-full',
                active ? 'text-white' : 'text-white/65 hover:bg-white/[0.035] hover:text-white/90',
              )}
            >
              {active ? (
                <>
                  <motion.span
                    layoutId={activeBackgroundLayoutId}
                    aria-hidden="true"
                    className={cn('absolute inset-0 rounded-xl border', visual.activeBackgroundClass)}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
                  />
                  <motion.span
                    layoutId={activeIndicatorLayoutId}
                    aria-hidden="true"
                    className={cn('absolute bottom-0 left-3 right-3 h-0.5 rounded-full lg:bottom-2 lg:left-0 lg:right-auto lg:top-2 lg:h-auto lg:w-0.5', visual.activeIndicatorClass)}
                    transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </>
              ) : null}
              <span className={cn(
                'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent transition-colors duration-200',
                active ? visual.iconBackgroundClass : 'bg-white/[0.035] text-white/45 group-hover:bg-white/[0.055] group-hover:text-white/70',
              )}>
                <Icon aria-hidden="true" className={cn('h-4 w-4', active && visual.iconTextClass)} />
              </span>
              <span className="relative z-10 whitespace-nowrap text-sm font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={activeItem.key}
            id={`platform-flow-panel-${activeItem.key}`}
            role="tabpanel"
            aria-labelledby={`platform-flow-tab-${activeItem.key}`}
            initial={shouldReduceMotion ? false : { opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3 }}
            className={cn(
              `site-flow-card site-flow-card-${activeItem.key} relative min-h-[310px] overflow-hidden rounded-2xl border bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-8 lg:min-h-[360px] lg:p-10`,
              activeVisual.cardBackgroundClass,
              activeVisual.cardBorderClass,
            )}
          >
            <div aria-hidden="true" className={cn('pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full blur-3xl', activeVisual.glowClass)} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="relative">
              <div className="flex items-center justify-between gap-4">
                <div className={cn('flex items-center gap-3', activeVisual.accentClass)}>
                  <span className="font-mono text-xs font-semibold tabular-nums">{activeItem.id}</span>
                  <span className={cn('h-px w-8', activeVisual.accentLineClass)} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em]">{activeItem.label}</span>
                </div>
                <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl border', activeVisual.iconBackgroundClass, activeVisual.iconTextClass)}>
                  <ActiveIcon aria-hidden="true" className="h-5 w-5" />
                </span>
              </div>
              <h3 className="mt-7 max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">{activeItem.title}</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/64 sm:text-base">{activeItem.description}</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {activeItem.capabilities.map((capability) => (
                  <li key={capability} className={cn('site-flow-row flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-white/80', activeVisual.rowClass)}>
                    <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', activeVisual.rowDotClass)} />
                    {capability}
                  </li>
                ))}
              </ul>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  );
}
