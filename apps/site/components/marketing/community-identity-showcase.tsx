'use client';

import { useEffect, useRef, useState } from 'react';
import { ProfilePhoto } from '../profile-photo';
import { Button } from '../ui';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { COMMUNITY_IDENTITY_MEMBERS, type CommunityIdentityRole } from './community-identity-data';

type ShowcasePhase = 'list' | 'list-exit' | 'generator';

const avatarPreviewSeeds = [
  'identity-generator-01',
  'identity-generator-02',
  'identity-generator-03',
  'identity-generator-04',
  'identity-generator-05',
  'identity-generator-06',
] as const;

const roleTone: Record<CommunityIdentityRole, string> = {
  OWNER: 'border-emerald-200/30 bg-emerald-300/15 text-emerald-100',
  ADMIN: 'border-teal-200/20 bg-teal-300/10 text-teal-100',
  MEMBER: 'border-white/10 bg-white/[0.055] text-white/58',
};

export function CommunityIdentityShowcase() {
  const { t } = useI18n();
  const copy = t.landing.communityIdentity;
  const showcaseRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<ShowcasePhase>('list');
  const [visibleCount, setVisibleCount] = useState(0);
  const [seedIndex, setSeedIndex] = useState(0);
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sequenceStarted, setSequenceStarted] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setReducedMotion(query.matches);
      setMotionPreferenceReady(true);
      if (query.matches) {
        setVisibleCount(0);
        setPhase('generator');
      }
    };
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const showcase = showcaseRef.current;
    if (!showcase) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setSequenceStarted(true);
      observer.disconnect();
    }, { threshold: 0.15 });
    observer.observe(showcase);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!motionPreferenceReady || reducedMotion || !sequenceStarted) return;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const initialDelay = 350;
    const cardInterval = 700;
    COMMUNITY_IDENTITY_MEMBERS.forEach((_, index) => {
      timers.push(setTimeout(() => setVisibleCount(index + 1), initialDelay + index * cardInterval));
    });
    const listCompleteAt = initialDelay + (COMMUNITY_IDENTITY_MEMBERS.length - 1) * cardInterval;
    timers.push(setTimeout(() => setPhase('list-exit'), listCompleteAt + 1800));
    timers.push(setTimeout(() => setPhase('generator'), listCompleteAt + 2250));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [motionPreferenceReady, reducedMotion, sequenceStarted]);

  return (
    <div ref={showcaseRef} className="relative z-10 flex min-h-[554px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <span className="font-jakarta text-[10px] font-bold uppercase tracking-[0.2em] text-accent/80">{copy.memberIdentity}</span>
        <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">{copy.interactivePreview}</span>
      </div>

      <div className="relative flex flex-1 items-center py-5 sm:py-6">
        {phase !== 'generator' ? (
          <div aria-hidden="true" className={cn('mx-auto grid w-full max-w-xl gap-2.5 transition-opacity duration-500 motion-reduce:transition-none', phase === 'list-exit' && 'opacity-0')}>
            {COMMUNITY_IDENTITY_MEMBERS.map((identity, index) => (
              <article
                key={identity.name}
                className={cn(
                  'flex min-h-[70px] items-center gap-3.5 rounded-[1.15rem] border border-white/[0.09] bg-[#08100d]/[0.82] px-4 py-3 opacity-0 shadow-[0_14px_35px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur transition-[opacity,transform] duration-500 motion-reduce:transition-none sm:px-5',
                  index < visibleCount ? 'translate-y-0 opacity-100' : 'translate-y-3',
                )}
              >
                <ProfilePhoto name={identity.name} dicebearStyle="notionists" dicebearSeed={identity.avatarSeed} size="md" alt={identity.name} className="h-12 w-12 rounded-xl border-white/10 bg-white/[0.045]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white sm:text-[15px]">{identity.name}</p>
                  <p className="mt-1 truncate text-xs text-white/44 sm:text-sm">{copy.subtitles[identity.subtitle]}</p>
                </div>
                <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] sm:text-[10px]', roleTone[identity.role])}>{copy.roles[identity.role]}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="identity-generator-enter mx-auto flex w-full max-w-lg flex-col items-center text-center">
            <p className="font-jakarta text-[10px] font-bold uppercase tracking-[0.2em] text-accent/80">{copy.createIdentity}</p>
            <ProfilePhoto
              name="Sample Owner"
              dicebearStyle="notionists"
              dicebearSeed={avatarPreviewSeeds[seedIndex]}
              size="frame"
              alt={`${copy.generatedAvatarAlt} Sample Owner`}
              className="mt-7 h-36 w-36 rounded-[1.75rem] border-emerald-300/20 bg-emerald-300/[0.055] shadow-[0_24px_65px_rgba(0,0,0,0.36)] sm:h-44 sm:w-44"
            />
            <h3 className="mt-6 text-2xl font-semibold tracking-tight text-white">Sample Owner</h3>
            <p className="mt-2 text-sm text-white/48">{copy.communityMember}</p>
            <Button
              type="button"
              onClick={() => setSeedIndex((current) => (current + 1) % avatarPreviewSeeds.length)}
              className="mt-7 min-h-11 cursor-pointer px-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08100d] active:translate-y-px"
            >
              {copy.generate}
            </Button>
          </div>
        )}
      </div>

      <style jsx>{`
        .identity-generator-enter { animation: identity-generator-enter 450ms ease-out both; }
        @keyframes identity-generator-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .identity-generator-enter { animation: none; }
        }
      `}</style>
    </div>
  );
}
