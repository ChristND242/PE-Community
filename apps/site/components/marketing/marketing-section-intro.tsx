'use client';

import type { ReactNode } from 'react';
import { MarketingReveal } from './motion/marketing-reveal';
import { marketingMotionTokens } from './motion/marketing-motion-config';

type MarketingSectionIntroProps = {
  aside: ReactNode;
  description: string;
  eyebrow: string;
  headingId: string;
  layout?: 'split' | 'wide';
  titleClassName?: string;
  titleLines: readonly string[];
};

type WorkspaceIntroItem = {
  description: string;
  label: string;
};

type CapabilityPillar = WorkspaceIntroItem & {
  index: string;
};

type PlatformFlowOverviewStage = {
  index: string;
  label: string;
};

export function MarketingSectionIntro({
  aside,
  description,
  eyebrow,
  headingId,
  layout = 'split',
  titleClassName,
  titleLines,
}: MarketingSectionIntroProps) {
  const delayStep = marketingMotionTokens.revealDelayStep;
  const isWide = layout === 'wide';

  return (
    <div className={isWide
      ? 'border-b border-white/[0.08] pb-10 lg:pb-12'
      : 'grid items-start gap-10 border-b border-white/[0.08] pb-10 md:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.72fr)] md:gap-12 lg:gap-20 lg:pb-12'}
    >
      <header className="min-w-0">
        <MarketingReveal distance={18}>
          <p className="font-jakarta text-[11px] font-bold uppercase tracking-[0.24em] text-accent">{eyebrow}</p>
        </MarketingReveal>
        <MarketingReveal delay={delayStep} distance={22}>
          <h2
            id={headingId}
            className={['mt-4 max-w-3xl text-4xl font-black leading-[1.08] text-white md:text-[2.75rem]', titleClassName]
              .filter(Boolean)
              .join(' ')}
          >
            {titleLines.map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </h2>
        </MarketingReveal>
        <MarketingReveal delay={delayStep * 2} distance={22}>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/62 md:text-base">{description}</p>
        </MarketingReveal>
      </header>

      <MarketingReveal className={isWide ? 'mt-9 md:mt-11' : 'md:pt-1'} delay={delayStep * 3} distance={22}>
        {aside}
      </MarketingReveal>
    </div>
  );
}

export function WorkspaceIntroAside({ items }: { items: readonly WorkspaceIntroItem[] }) {
  return (
    <dl className="site-workspace-aside border-t border-white/10 md:border-l md:border-t-0 md:pl-8">
      {items.map((item, index) => (
        <div key={item.label} className={index > 0 ? 'border-t border-white/[0.08] py-5 md:py-6' : 'py-5 md:pb-6 md:pt-0'}>
          <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">{item.label}</dt>
          <dd className="mt-2 text-sm leading-6 text-white/58">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CapabilityPillarsAside({ items }: { items: readonly CapabilityPillar[] }) {
  return (
    <ol className="border-t border-white/10 md:border-l md:border-t-0 md:pl-8">
      {items.map((item, index) => (
        <li key={item.index} className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-3 ${index > 0 ? 'border-t border-white/[0.08] py-4' : 'py-4 md:pt-0'}`}>
          <span className="font-mono text-xs text-accent/70">{item.index}</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/88">{item.label}</p>
            <p className="mt-1.5 text-sm leading-6 text-white/52">{item.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PlatformFlowStagesAside({ items }: { items: readonly PlatformFlowOverviewStage[] }) {
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-4">
      {items.map((item, index) => (
        <li
          key={item.index}
          className={[
            'relative grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0',
            'sm:block sm:pb-0',
          ].filter(Boolean).join(' ')}
        >
          {index < items.length - 1 ? (
            <>
              <span aria-hidden="true" className="absolute bottom-0 left-[0.3rem] top-3 w-px bg-white/[0.12] sm:hidden" />
              <span
                aria-hidden="true"
                className={[
                  'absolute left-3 right-[-1.5rem] top-[0.3rem] hidden h-px bg-white/[0.12] sm:block',
                  index === 1 ? 'sm:hidden lg:block' : '',
                ].filter(Boolean).join(' ')}
              />
            </>
          ) : null}
          <span aria-hidden="true" className="relative z-10 mt-0.5 h-2.5 w-2.5 rounded-full border border-accent/70 bg-background ring-4 ring-background sm:absolute sm:left-0 sm:top-0 sm:mt-0" />
          <div className="flex min-w-0 items-baseline gap-2 sm:mt-4 sm:block">
            <span className="font-mono text-xs text-accent/70">{item.index}</span>
            <span className="text-sm font-semibold text-white/78 sm:mt-1.5 sm:block">{item.label}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
