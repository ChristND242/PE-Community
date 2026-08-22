'use client';

import {
  Check,
  FileClock,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { MermaidDiagram } from '../mermaid-diagram';
import {
  createNotificationDiagramSource,
  createOwnershipDiagramSource,
  type MarketingDiagramOrientation,
  type NotificationDiagramLabels,
  type OwnershipDiagramLabels,
} from './marketing-mermaid-sources';
import { OpenSourceDeploymentOrbit } from './orbiting-circles';

type PlatformTrustCardId = 'security' | 'notifications' | 'ownership' | 'deployment';

const cardOrder: Array<{ id: PlatformTrustCardId; index: '01' | '02' | '03' | '04' }> = [
  { id: 'security', index: '01' },
  { id: 'notifications', index: '02' },
  { id: 'ownership', index: '03' },
  { id: 'deployment', index: '04' },
];

const cardSurfaceClassNames: Record<PlatformTrustCardId, string> = {
  security: 'bg-[radial-gradient(circle_at_78%_18%,rgba(110,231,183,0.17),transparent_30%),linear-gradient(135deg,#06100c_0%,#0a271c_56%,#07110d_100%)]',
  notifications: 'bg-[radial-gradient(circle_at_82%_18%,rgba(34,211,238,0.14),transparent_30%),linear-gradient(135deg,#06100e_0%,#08302b_54%,#071213_100%)]',
  ownership: 'bg-[radial-gradient(circle_at_75%_20%,rgba(148,163,184,0.10),transparent_30%),linear-gradient(135deg,#07100c_0%,#10251d_52%,#0b1412_100%)]',
  deployment: 'bg-[radial-gradient(circle_at_78%_16%,rgba(167,243,208,0.18),transparent_31%),linear-gradient(135deg,#07110d_0%,#075044_58%,#08211b_100%)]',
};

function useMarketingDiagramOrientation(): MarketingDiagramOrientation {
  const [orientation, setOrientation] =
    useState<MarketingDiagramOrientation>('landscape');

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setOrientation(query.matches ? 'portrait' : 'landscape');

    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return orientation;
}

export function PlatformTrustSection() {
  const { t } = useI18n();
  const copy = t.landing.platformTrust;
  const diagramOrientation = useMarketingDiagramOrientation();

  return (
    <section id="platform-trust" aria-labelledby="platform-trust-title" className="relative px-5 pb-4 pt-24 md:pb-6 md:pt-28 xl:pb-8 xl:pt-32">
      <div className="relative mx-auto max-w-[1400px]">
        <header className="max-w-3xl">
          <p className="font-jakarta text-[11px] font-bold uppercase tracking-[0.24em] text-accent">{copy.eyebrow}</p>
          <h2 id="platform-trust-title" className="mt-5 text-[clamp(2.5rem,5vw,5rem)] font-black leading-[0.98] tracking-tight text-white">{copy.title}</h2>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/58 md:text-lg">{copy.description}</p>
        </header>

        <ol className="mt-14 space-y-8 xl:mt-20 xl:space-y-0">
          {cardOrder.map(({ id, index }, cardIndex) => {
            const card = copy.cards[id];
            const visualFirst = id === 'notifications' || id === 'ownership';
            return (
              <li
                key={id}
                className="relative xl:sticky xl:top-[var(--trust-card-top)]"
                style={{ '--trust-card-top': `${24 + cardIndex * 14}px`, zIndex: cardIndex + 1 } as CSSProperties}
              >
                <article
                  className={cn(
                    `site-trust-card site-trust-card-${id} relative isolate overflow-hidden rounded-[32px] border border-white/[0.11] shadow-[0_28px_90px_rgba(0,0,0,0.34)]`,
                    visualFirst
                      ? 'xl:min-h-[clamp(520px,calc(100dvh-180px),620px)]'
                      : 'xl:min-h-[clamp(650px,calc(100dvh-96px),760px)]',
                    cardSurfaceClassNames[id],
                  )}
                >
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100/45 to-transparent" />
                  <div aria-hidden="true" className="site-card-grid pointer-events-none absolute inset-0 opacity-[0.075] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:64px_64px]" />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.035),transparent_35%,rgba(255,255,255,0.015))]" />

                  <div
                    className={cn(
                      'relative z-10 grid min-h-full items-center gap-10 p-6 sm:p-8 md:p-10',
                      visualFirst
                        ? 'xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] xl:gap-10 xl:p-12 2xl:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)] 2xl:gap-12 2xl:p-14'
                        : 'xl:grid-cols-[0.92fr_1.08fr] xl:gap-14 xl:p-14 2xl:p-16',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-jakarta text-sm font-bold tabular-nums text-emerald-200">{index}</span>
                        <span className="h-px w-10 bg-emerald-200/35" />
                        <p className="font-jakarta text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/70">{card.eyebrow}</p>
                      </div>
                      <h3 className="mt-6 max-w-2xl text-[clamp(2rem,4vw,3.7rem)] font-black leading-[1.02] tracking-tight text-white">{card.title}</h3>
                      <p className="mt-5 max-w-xl text-base leading-7 text-white/65 md:text-lg">{card.description}</p>
                      {card.points.length > 0 ? (
                        <ul className="mt-8 grid gap-x-7 gap-y-4 sm:grid-cols-2">
                          {card.points.map((point) => (
                            <li key={point} className="flex items-start gap-3">
                              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-emerald-300" strokeWidth={2.2} />
                              <span className="text-sm font-semibold leading-6 text-white/78">{point}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {id === 'deployment' ? (
                        <div className="mt-9 flex flex-wrap gap-3">
                          <Link
                            href="/docs"
                            className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-emerald-300 px-5 text-sm font-black text-[#03110a] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07342b] active:translate-y-px motion-reduce:transition-none"
                          >
                            {copy.cards.deployment.ctaDocumentation}
                          </Link>
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      {id === 'security' ? <SecurityVisual labels={copy.cards.security.visual} /> : null}
                      {id === 'notifications' ? <NotificationVisual labels={copy.cards.notifications.visual} orientation={diagramOrientation} /> : null}
                      {id === 'ownership' ? <OwnershipVisual labels={copy.cards.ownership.visual} orientation={diagramOrientation} /> : null}
                      {id === 'deployment' ? <DeploymentVisual labels={copy.cards.deployment.visual} /> : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function SecurityVisual({ labels }: { labels: Record<'protectedAccount' | 'login' | 'mfa' | 'roles' | 'sessions' | 'audit', string> }) {
  const nodes: Array<{ key: Exclude<keyof typeof labels, 'protectedAccount'>; icon: ComponentType<{ size?: number; className?: string }>; className: string }> = [
    { key: 'mfa', icon: KeyRound, className: 'left-1/2 top-[4%] -translate-x-1/2' },
    { key: 'roles', icon: Users, className: 'left-[2%] top-1/2 -translate-y-1/2' },
    { key: 'sessions', icon: FileClock, className: 'right-[2%] top-1/2 -translate-y-1/2' },
    { key: 'login', icon: LockKeyhole, className: 'bottom-[4%] left-[16%]' },
    { key: 'audit', icon: ShieldCheck, className: 'bottom-[4%] right-[16%]' },
  ];

  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[510px]">
      <div className="absolute inset-[16%] rounded-full border border-emerald-200/10 bg-emerald-300/[0.025]" />
      <div className="absolute inset-[27%] rounded-full border border-emerald-200/15 bg-[radial-gradient(circle,rgba(52,211,153,0.13),rgba(5,18,12,0.35)_66%,transparent_67%)] shadow-[0_0_55px_rgba(16,185,129,0.12)]" />
      <span className="absolute left-1/2 top-[14%] h-[28%] w-px -translate-x-1/2 bg-gradient-to-b from-emerald-200/10 to-emerald-200/35" />
      <span className="absolute bottom-[14%] left-1/2 h-[28%] w-px -translate-x-1/2 bg-gradient-to-b from-emerald-200/35 to-emerald-200/10" />
      <span className="absolute left-[14%] top-1/2 h-px w-[30%] bg-gradient-to-r from-emerald-200/10 to-emerald-200/35" />
      <span className="absolute right-[14%] top-1/2 h-px w-[30%] bg-gradient-to-r from-emerald-200/35 to-emerald-200/10" />
      <div className="absolute left-1/2 top-1/2 grid h-32 w-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-emerald-200/25 bg-[#07150f]/90 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-40 sm:w-40">
        <div>
          <UserRoundCheck className="mx-auto text-emerald-200" size={30} />
          <p className="mt-3 px-4 text-xs font-bold uppercase tracking-[0.12em] text-white/75">{labels.protectedAccount}</p>
        </div>
      </div>
      {nodes.map(({ key, icon: Icon, className }) => (
        <div key={key} className={cn('absolute flex min-w-24 items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 shadow-lg shadow-black/20', className)}>
          <Icon className="shrink-0 text-emerald-200" size={15} />
          <span className="text-[11px] font-semibold text-white/72">{labels[key]}</span>
        </div>
      ))}
    </div>
  );
}

function NotificationVisual({
  labels,
  orientation,
}: {
  labels: NotificationDiagramLabels;
  orientation: MarketingDiagramOrientation;
}) {
  return (
    <div className="site-marketing-mermaid-visual mx-auto w-full max-w-[760px]">
      <MermaidDiagram
        id="marketing-notification-journey"
        title={labels.diagramTitle}
        description={labels.diagramDescription}
        source={createNotificationDiagramSource(labels, orientation)}
        unavailableLabel={labels.unavailable}
        presentation="marketing"
      />
    </div>
  );
}

function OwnershipVisual({
  labels,
  orientation,
}: {
  labels: OwnershipDiagramLabels;
  orientation: MarketingDiagramOrientation;
}) {
  return (
    <div className="site-marketing-mermaid-visual mx-auto w-full max-w-[760px]">
      <MermaidDiagram
        id="marketing-data-ownership"
        title={labels.diagramTitle}
        description={labels.diagramDescription}
        source={createOwnershipDiagramSource(labels, orientation)}
        unavailableLabel={labels.unavailable}
        presentation="marketing"
      />
    </div>
  );
}

function DeploymentVisual({ labels }: { labels: Record<'communityReady' | 'operational', string> }) {
  return (
    <div aria-hidden="true" className="site-deployment-visual relative mx-auto min-h-[360px] max-w-[620px] overflow-hidden px-2 py-6 sm:px-5 sm:py-8 xl:min-h-[500px]">
      <span className="site-deployment-wordmark pointer-events-none absolute -bottom-2 right-0 select-none whitespace-nowrap font-jakarta text-[clamp(3.25rem,7vw,6.75rem)] font-black leading-none text-emerald-50/[0.045] mix-blend-soft-light">
        PE Community.
      </span>
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="font-jakarta text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100/55">{labels.operational}</span>
        <span className="flex items-center gap-2 text-[10px] font-semibold text-emerald-100/65"><span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.45)]" />{labels.communityReady}</span>
      </div>
      <div className="relative z-10">
        <OpenSourceDeploymentOrbit />
      </div>
    </div>
  );
}
