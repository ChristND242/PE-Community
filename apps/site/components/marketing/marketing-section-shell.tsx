'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type MarketingSectionVariant = 'preview' | 'capabilities' | 'flow' | 'product' | 'identity' | 'trust' | 'minimal';
type MarketingSectionScrollState = 'upcoming' | 'active' | 'passed';

const marketingSectionIds = [
  'workspace-preview',
  'capabilities',
  'platform-flow',
  'product-in-action',
  'community-identity',
  'platform-trust',
];

const MarketingSectionContext = createContext<string | null>(null);

export function MarketingSectionsArchitecture({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visibilityRef = useRef(new Map<string, boolean>());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-marketing-section]'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const sectionId = (entry.target as HTMLElement).dataset.marketingSection;
        if (sectionId) visibilityRef.current.set(sectionId, entry.isIntersecting);
      });

      const viewportCenter = window.innerHeight * 0.48;
      const candidates = sections.filter((section) => visibilityRef.current.get(section.dataset.marketingSection ?? ''));
      if (candidates.length === 0) return;

      const closest = candidates.reduce((current, section) => {
        const currentRect = current.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        const currentDistance = Math.abs(currentRect.top + currentRect.height / 2 - viewportCenter);
        const sectionDistance = Math.abs(sectionRect.top + sectionRect.height / 2 - viewportCenter);
        return sectionDistance < currentDistance ? section : current;
      });

      setActiveSectionId(closest.dataset.marketingSection ?? null);
    }, {
      rootMargin: '-35% 0px -45% 0px',
      threshold: 0,
    });

    sections.forEach((section) => {
      const sectionId = section.dataset.marketingSection;
      if (sectionId) visibilityRef.current.set(sectionId, false);
      observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <MarketingSectionContext.Provider value={activeSectionId}>
      <div ref={containerRef} className="site-marketing-body relative bg-[#050807]">
        <MarketingBodySideDots />
        {children}
      </div>
    </MarketingSectionContext.Provider>
  );
}

function MarketingBodySideDots() {
  return (
    <>
      <div
        aria-hidden="true"
        className="site-marketing-side-dots pointer-events-none absolute inset-y-0 left-0 hidden w-[12.5%] md:block"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(110, 231, 183, 0.16) 1px, transparent 1.25px)',
          backgroundSize: '20px 20px',
          WebkitMaskImage: 'linear-gradient(to right, black 0%, black 55%, transparent 100%)',
          maskImage: 'linear-gradient(to right, black 0%, black 55%, transparent 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="site-marketing-side-dots pointer-events-none absolute inset-y-0 right-0 hidden w-[12.5%] md:block"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(110, 231, 183, 0.16) 1px, transparent 1.25px)',
          backgroundSize: '20px 20px',
          WebkitMaskImage: 'linear-gradient(to left, black 0%, black 55%, transparent 100%)',
          maskImage: 'linear-gradient(to left, black 0%, black 55%, transparent 100%)',
        }}
      />
    </>
  );
}

export function MarketingSectionShell({
  children,
  sectionId,
  variant,
}: {
  children: ReactNode;
  sectionId: string;
  variant: MarketingSectionVariant;
}) {
  const activeSectionId = useContext(MarketingSectionContext);
  const activeIndex = marketingSectionIds.findIndex((id) => id === activeSectionId);
  const sectionIndex = marketingSectionIds.findIndex((id) => id === sectionId);
  const scrollState: MarketingSectionScrollState = activeSectionId === sectionId
    ? 'active'
    : activeIndex >= 0 && sectionIndex >= 0 && sectionIndex < activeIndex
      ? 'passed'
      : 'upcoming';

  return (
    <div
      data-marketing-section={sectionId}
      data-marketing-variant={variant}
      data-marketing-section-state={scrollState}
      className={cn('relative isolate', variant === 'trust' ? 'overflow-visible' : 'overflow-hidden')}
    >
      <MarketingSectionBackground variant={variant} scrollState={scrollState} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

const variantGridClassNames: Record<MarketingSectionVariant, string> = {
  preview: 'opacity-[0.16] md:[background-size:76px_76px]',
  capabilities: 'opacity-[0.13] md:[background-size:88px_88px]',
  flow: 'opacity-[0.07] md:[background-size:104px_104px]',
  product: 'opacity-[0.11] md:[background-size:92px_92px]',
  identity: 'opacity-[0.065] md:[background-size:108px_108px]',
  trust: 'opacity-[0.07] md:[background-size:112px_112px]',
  minimal: 'opacity-[0.05] md:[background-size:120px_120px]',
};

const variantAmbientClassNames: Record<MarketingSectionVariant, string> = {
  preview: 'left-1/2 top-[18%] h-[34rem] w-[70rem] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(16,185,129,0.10),transparent_68%)]',
  capabilities: 'left-1/2 top-[42%] h-[38rem] w-[68rem] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(16,185,129,0.075),transparent_68%)]',
  flow: 'right-[-12rem] top-[20%] h-[34rem] w-[34rem] bg-[radial-gradient(circle,rgba(16,185,129,0.06),transparent_70%)]',
  product: 'left-1/2 top-[10%] h-[32rem] w-[76rem] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(16,185,129,0.085),transparent_68%)]',
  identity: 'right-[-8%] top-[14%] h-[38rem] w-[52rem] bg-[radial-gradient(ellipse,rgba(16,185,129,0.085),transparent_70%)]',
  trust: 'left-1/2 top-[8%] h-[42rem] w-[78rem] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(16,185,129,0.065),transparent_72%)]',
  minimal: 'left-1/2 top-[20%] h-[26rem] w-[54rem] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(16,185,129,0.045),transparent_72%)]',
};

const variantNodes: Record<MarketingSectionVariant, string[]> = {
  preview: ['left-[12.5%] top-[22%]', 'left-1/2 top-[58%]', 'right-[12.5%] top-[34%]'],
  capabilities: ['left-[16.666%] top-[28%]', 'left-1/2 top-[52%]', 'right-[16.666%] top-[72%]'],
  flow: ['left-[12.5%] top-[20%]', 'right-[12.5%] top-[54%]'],
  product: ['left-[12.5%] top-[18%]', 'right-[12.5%] top-[18%]', 'left-1/2 top-[82%]'],
  identity: ['left-1/2 top-[24%]', 'right-[12.5%] top-[58%]'],
  trust: ['left-[12.5%] top-[12%]', 'right-[12.5%] top-[30%]', 'left-1/2 top-[72%]'],
  minimal: ['left-[12.5%] top-[36%]', 'right-[12.5%] top-[64%]'],
};

function MarketingSectionBackground({
  variant,
  scrollState,
}: {
  variant: MarketingSectionVariant;
  scrollState: MarketingSectionScrollState;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-500 motion-reduce:transition-none',
        scrollState === 'active' ? 'opacity-100' : scrollState === 'passed' ? 'opacity-[0.72]' : 'opacity-50',
      )}
    >
      <div className="site-section-plane absolute inset-0 bg-[#050807] md:left-[12.5%] md:right-[12.5%]" />
      <div className="site-section-top-wash absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/20 to-transparent" />
      <div className="site-section-divider absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div
        className={cn(
          'site-section-grid absolute inset-0 hidden md:block [background-image:linear-gradient(rgba(255,255,255,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.13)_1px,transparent_1px)] [background-size:96px_96px]',
          variantGridClassNames[variant],
        )}
      />

      <div className="site-section-guide absolute inset-y-0 left-[12.5%] hidden w-px bg-white/[0.045] md:block" />
      <div className="site-section-guide absolute inset-y-0 left-1/2 w-px bg-white/[0.04]" />
      <div className="site-section-guide absolute inset-y-0 right-[12.5%] hidden w-px bg-white/[0.045] md:block" />
      <div className="site-section-guide absolute inset-x-0 top-1/3 h-px bg-white/[0.035]" />
      <div className="site-section-guide absolute inset-x-0 top-2/3 h-px bg-white/[0.03]" />

      {variant === 'capabilities' ? (
        <>
          <div className="absolute inset-y-0 left-1/3 hidden w-px bg-emerald-200/[0.045] lg:block" />
          <div className="absolute inset-y-0 right-1/3 hidden w-px bg-emerald-200/[0.045] lg:block" />
        </>
      ) : null}
      {variant === 'identity' ? (
        <div className="absolute inset-y-0 left-[41.666%] hidden w-px bg-emerald-200/[0.04] lg:block" />
      ) : null}

      <div className={cn('site-section-ambient absolute', variantAmbientClassNames[variant])} />

      {variantNodes[variant].map((positionClassName) => (
        <span
          key={positionClassName}
          className={cn(
            'site-section-node absolute hidden h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border md:block',
            positionClassName,
            scrollState === 'active'
              ? 'border-emerald-300/35 bg-emerald-300/15 shadow-[0_0_12px_rgba(52,211,153,0.12)]'
              : 'border-white/15 bg-white/[0.04]',
          )}
        />
      ))}
    </div>
  );
}
