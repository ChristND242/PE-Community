'use client';

import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Columns3,
  ContactRound,
  Database,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  Megaphone,
  MessagesSquare,
  Newspaper,
  ScrollText,
  Server,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '../ui';
import { useI18n } from '../../lib/i18n';
import { CapabilityPillarsAside, MarketingSectionIntro } from './marketing-section-intro';
import { cardSpotlightLayerClassName, useCardSpotlight } from './use-card-spotlight';

type CapabilityItem = {
  id: string;
  category: string;
  tone: CapabilityTone;
  title: string;
  description: string;
};

type CapabilityTone = 'operations' | 'engagement' | 'security';

const capabilityIcons: Record<string, LucideIcon> = {
  'member-management': Users,
  'registration-workflows': ClipboardCheck,
  'member-directory': ContactRound,
  'role-based-access': ShieldCheck,
  'admin-dashboard': LayoutDashboard,
  'audit-logs': ScrollText,
  announcements: Megaphone,
  'community-feed': Newspaper,
  'events-rsvps': CalendarDays,
  'task-boards': Columns3,
  'community-chat': MessagesSquare,
  notifications: Bell,
  'self-hosted-deployment': Server,
  'data-ownership': Database,
  'branded-email': Mail,
  'multi-factor-authentication': KeyRound,
  'secure-password-storage': LockKeyhole,
  'first-run-setup': Settings2,
};

export function PlatformCapabilitiesSection() {
  const { t } = useI18n();
  const copy = t.landing.capabilities;
  const operations = withCategory(copy.lanes.operations, copy.categories.operations, 'operations');
  const engagement = withCategory(copy.lanes.engagement, copy.categories.engagement, 'engagement');
  const ownershipSecurity = withCategory(copy.lanes.ownershipSecurity, copy.categories.ownershipSecurity, 'security');
  const allCapabilities = [...operations, ...engagement, ...ownershipSecurity];
  const tabletLanes = [
    allCapabilities.filter((_, index) => index % 2 === 0),
    allCapabilities.filter((_, index) => index % 2 === 1),
  ];

  return (
    <section id="capabilities" aria-labelledby="platform-capabilities-title" className="relative overflow-hidden border-t border-white/10 px-5 py-20 sm:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.025] blur-3xl" />
      <div className="relative mx-auto max-w-[1280px]">
        <MarketingSectionIntro
          aside={<CapabilityPillarsAside items={copy.pillars} />}
          description={copy.description}
          eyebrow={copy.eyebrow}
          headingId="platform-capabilities-title"
          titleClassName="max-w-2xl"
          titleLines={copy.titleLines}
        />

        <div className="relative mt-10">
          <div aria-hidden="true" className="capabilities-marquee-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-background via-background/85 to-transparent sm:h-28" />
          <div aria-hidden="true" className="capabilities-marquee-fade pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-background via-background/85 to-transparent sm:h-28" />

          <div className="hidden gap-5 lg:grid lg:grid-cols-3">
            <VerticalMarquee items={operations} duration={34} />
            <VerticalMarquee items={engagement} duration={38} reverse />
            <VerticalMarquee items={ownershipSecurity} duration={32} />
          </div>

          <div className="hidden gap-5 sm:grid sm:grid-cols-2 lg:hidden">
            <VerticalMarquee items={tabletLanes[0]} duration={36} />
            <VerticalMarquee items={tabletLanes[1]} duration={38} reverse />
          </div>

          <div className="sm:hidden">
            <VerticalMarquee items={allCapabilities} duration={38} />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .capabilities-marquee-viewport {
          height: 540px;
          overflow: hidden;
        }
        .capabilities-marquee-track {
          animation: capabilities-marquee var(--capabilities-duration) linear infinite;
          will-change: transform;
        }
        .capabilities-marquee-track-reverse {
          animation-name: capabilities-marquee-reverse;
        }
        .capabilities-marquee-viewport:hover .capabilities-marquee-track,
        .capabilities-marquee-viewport:focus-within .capabilities-marquee-track {
          animation-play-state: paused;
        }
        @keyframes capabilities-marquee {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @keyframes capabilities-marquee-reverse {
          from { transform: translateY(-50%); }
          to { transform: translateY(0); }
        }
        @media (min-width: 640px) {
          .capabilities-marquee-viewport { height: 600px; }
        }
        @media (min-width: 1024px) {
          .capabilities-marquee-viewport { height: 700px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .capabilities-marquee-viewport {
            height: auto;
            overflow: visible;
          }
          .capabilities-marquee-track {
            animation: none;
            transform: none;
            will-change: auto;
          }
          .capabilities-marquee-duplicate,
          .capabilities-marquee-fade {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}

function VerticalMarquee({ items, reverse = false, duration }: { items: CapabilityItem[]; reverse?: boolean; duration: number }) {
  return (
    <div className="capabilities-marquee-viewport" role="list">
      <div className={`capabilities-marquee-track ${reverse ? 'capabilities-marquee-track-reverse' : ''}`} style={{ '--capabilities-duration': `${duration}s` } as CSSProperties}>
        <CapabilitySequence items={items} />
        <div aria-hidden="true" className="capabilities-marquee-duplicate">
          <CapabilitySequence items={items} />
        </div>
      </div>
    </div>
  );
}

function CapabilitySequence({ items }: { items: CapabilityItem[] }) {
  return (
    <div className="flex flex-col gap-4 pb-4">
      {items.map((item) => <PlatformCapabilityCard key={item.id} capability={item} />)}
    </div>
  );
}

function PlatformCapabilityCard({ capability }: { capability: CapabilityItem }) {
  const Icon = capabilityIcons[capability.id] ?? ShieldCheck;
  const { spotlightRef, spotlightHandlers } = useCardSpotlight<HTMLDivElement>();
  return (
    <Card {...spotlightHandlers} role="listitem" style={{ '--spotlight-x': '50%', '--spotlight-y': '50%' } as CSSProperties} className={`site-capability-card site-capability-${capability.tone} group relative min-h-[190px] w-full overflow-hidden rounded-2xl border-white/10 bg-white/[0.025] p-5 shadow-none transition-[border-color,background-color,box-shadow,transform] duration-300 hover:border-emerald-300/20 hover:bg-white/[0.04]`}>
      <div ref={spotlightRef} aria-hidden="true" className={cardSpotlightLayerClassName} />
      <div className="relative z-10 flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <span className="site-capability-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06]">
            <Icon aria-hidden="true" className="h-4 w-4 text-emerald-300" />
          </span>
          <span className="text-right text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{capability.category}</span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{capability.title}</h3>
          <p className="mt-2 text-sm leading-6 text-white/50">{capability.description}</p>
        </div>
      </div>
    </Card>
  );
}

function withCategory(items: Array<{ id: string; title: string; description: string }>, category: string, tone: CapabilityTone): CapabilityItem[] {
  return items.map((item) => ({ ...item, category, tone }));
}
