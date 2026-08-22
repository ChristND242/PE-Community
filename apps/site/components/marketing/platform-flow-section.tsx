'use client';

import { useI18n } from '../../lib/i18n';
import { MarketingSectionIntro, PlatformFlowStagesAside } from './marketing-section-intro';
import { PlatformFlowTabs } from './platform-flow-tabs';

export function PlatformFlowSection() {
  const { t } = useI18n();
  const copy = t.landing.platformFlow;

  return (
    <section id="features" aria-labelledby="platform-flow-title" className="relative overflow-hidden px-5 py-24 md:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute right-[-8rem] top-20 h-80 w-80 rounded-full bg-accent/[0.025] blur-3xl" />
      <div className="relative mx-auto max-w-[1280px]">
        <MarketingSectionIntro
          aside={<PlatformFlowStagesAside items={copy.overviewStages} />}
          description={copy.description}
          eyebrow={copy.eyebrow}
          headingId="platform-flow-title"
          layout="wide"
          titleLines={copy.titleLines}
        />

        <PlatformFlowTabs items={copy.stages} label={copy.tabsLabel} />
      </div>
    </section>
  );
}
