'use client';

import { ArrowRight, Menu, X } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import Link from 'next/link';
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GhostLink } from '../components/ui';
import { ThemeSwitch } from '../components/theme-switch';
import { BrandWordmark } from '../components/brand-wordmark';
import { LanguageSwitcher, useI18n } from '../lib/i18n';
import { getAppHref } from '../lib/app-links';
import { PublicHomepageFooter } from './public-homepage-footer';
import { DashboardPreviewSection } from './public-homepage-preview';
import { PlatformCapabilitiesSection } from '../components/marketing/platform-capabilities-section';
import { cardSpotlightLayerClassName, useCardSpotlight } from '../components/marketing/use-card-spotlight';
import { PlatformFlowSection } from '../components/marketing/platform-flow-section';
import { ProductOperationsSection } from '../components/marketing/product-operations-section';
import { CommunityIdentityShowcase } from '../components/marketing/community-identity-showcase';
import { MarketingSectionShell, MarketingSectionsArchitecture } from '../components/marketing/marketing-section-shell';
import { PlatformTrustSection } from '../components/marketing/platform-trust-section';
import { marketingMotionEase, marketingMotionTokens } from '../components/marketing/motion/marketing-motion-config';
import { MarketingReveal } from '../components/marketing/motion/marketing-reveal';
import { MarketingScrollProgress } from '../components/marketing/motion/marketing-scroll-progress';

const publicMobileMenuId = 'site-public-mobile-navigation';

function HeroSpotlightCard({ children }: { children: ReactNode }) {
  const { spotlightRef, spotlightHandlers } = useCardSpotlight<HTMLDivElement>();

  return (
    <div
      {...spotlightHandlers}
      style={{ '--spotlight-x': '50%', '--spotlight-y': '50%' } as CSSProperties}
      className="site-hero-card glass-card group relative mb-2 h-[200px] w-[200px] translate-y-[-50px] overflow-hidden rounded-[24px] border border-white/20 bg-black/20 p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur transition-[border-color,background-color,box-shadow,transform] duration-300 hover:border-emerald-300/30 hover:bg-black/30"
    >
      <div
        ref={spotlightRef}
        aria-hidden="true"
        className={cardSpotlightLayerClassName}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function FadeIn({ as, children, className, delay = 0, duration = 0.7, x = 0, y = 30 }: { as?: ElementType; children: ReactNode; className?: string; delay?: number; duration?: number; x?: number; y?: number }) {
  const Component = as ?? 'div';
  const ref = useRef<HTMLElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '50px', threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const style: CSSProperties = reducedMotion ? {} : {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translate3d(0, 0, 0)' : `translate3d(${x}px, ${y}px, 0)`,
    transition: `opacity ${duration}s cubic-bezier(0.25, 0.1, 0.25, 1) ${delay}s, transform ${duration}s cubic-bezier(0.25, 0.1, 0.25, 1) ${delay}s`,
    willChange: 'opacity, transform',
  };

  return <Component ref={ref} className={className} style={style}>{children}</Component>;
}

export function PublicHomepage() {
  const { t } = useI18n();
  const loginHref = getAppHref('/login');
  const [open, setOpen] = useState(false);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroContentY = useTransform(heroScrollProgress, [0, 1], [0, -64]);
  const heroContentOpacity = useTransform(heroScrollProgress, [0, 0.68, 1], [1, 1, 0.24]);
  const heroVisualScale = useTransform(heroScrollProgress, [0, 1], [1, 0.98]);
  const heroAmbientY = useTransform(heroScrollProgress, [0, 1], [0, -18]);
  const heroWatermarkY = useTransform(heroScrollProgress, [0, 1], [0, -10]);
  const nav = [
    { id: 'features', label: t.nav.features, href: '#features' },
    { id: 'security', label: t.nav.security, href: '#features' },
    { id: 'open-source', label: t.nav.openSource, href: '#open-source' },
    { id: 'docs', label: t.nav.docs, href: '/docs' },
  ];

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileMenuCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      mobileMenuTriggerRef.current?.focus();
    };
  }, [open]);
  const title = t.landing.title.endsWith('.') ? t.landing.title.slice(0, -1) : t.landing.title;
  const heroEntrance = (delay: number, distance = 22) => ({
    initial: shouldReduceMotion ? false : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: shouldReduceMotion ? 0 : marketingMotionTokens.revealDuration,
      delay: shouldReduceMotion ? 0 : delay,
      ease: marketingMotionEase,
    },
  });

  return (
    <main id="main-content" className="site-marketing-page bg-background text-white">
      <MarketingScrollProgress />
      <noscript><style>{`.marketing-motion-enter,.marketing-motion-safe{opacity:1!important;transform:none!important}`}</style></noscript>
      <section ref={heroRef} className="site-hero relative min-h-screen overflow-hidden">
        <div className="site-hero-background absolute inset-0 bg-gradient-to-br from-[#07110e] via-background to-black" />
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[66%] overflow-hidden lg:block"
          style={{ y: shouldReduceMotion ? 0 : heroWatermarkY }}
        >
          <div className="site-hero-plane absolute inset-y-[8%] right-[-8%] w-[88%] rounded-[4rem] border border-transparent" />
          <div
            className="absolute inset-0"
            style={{ WebkitMaskImage: 'radial-gradient(ellipse at 72% 48%, black 0%, rgba(0,0,0,0.8) 38%, transparent 75%)', maskImage: 'radial-gradient(ellipse at 72% 48%, black 0%, rgba(0,0,0,0.8) 38%, transparent 75%)' }}
          >
            <img src="/Pona%20Ekolo.svg" alt="" className="site-hero-watermark absolute right-[-10%] top-1/2 h-[116%] w-auto -translate-y-1/2 select-none object-contain opacity-[0.055] grayscale contrast-125 saturate-50 blur-[0.5px]" />
          </div>
        </motion.div>
        <motion.div
          aria-hidden="true"
          className="site-hero-ambient pointer-events-none absolute inset-0 max-md:!translate-y-0 bg-[radial-gradient(circle_at_68%_42%,rgba(16,185,129,0.07),transparent_34%)]"
          style={{ y: shouldReduceMotion ? 0 : heroAmbientY }}
        />
        <div className="site-hero-guide pointer-events-none absolute inset-y-0 hidden w-px bg-white/10 lg:left-1/4 lg:block" />
        <div className="site-hero-guide pointer-events-none absolute inset-y-0 hidden w-px bg-white/10 lg:left-1/2 lg:block" />
        <div className="site-hero-guide pointer-events-none absolute inset-y-0 hidden w-px bg-white/10 lg:left-3/4 lg:block" />

        <header className="site-public-header absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 lg:px-10">
          <Link href="/" aria-label={t.brand.short}><BrandWordmark className="text-lg" /></Link>
          <nav className="hidden items-center gap-8 text-xs font-bold uppercase text-white/70 lg:flex">{nav.map((item) => <a className="transition hover:text-accent" href={item.href} key={item.id}>{item.label}</a>)}</nav>
          <div className="hidden items-center gap-2.5 lg:flex"><ThemeSwitch /><LanguageSwitcher /></div>
          <button ref={mobileMenuTriggerRef} type="button" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t.common.openMenu} aria-expanded={open} aria-controls={publicMobileMenuId}><Menu aria-hidden="true" /></button>
        </header>
        {open && <div id={publicMobileMenuId} role="dialog" aria-modal="true" className="site-mobile-menu fixed inset-0 z-50 max-h-dvh overflow-y-auto bg-background p-6"><button ref={mobileMenuCloseRef} type="button" className="ml-auto block" onClick={() => setOpen(false)} aria-label={t.common.closeMenu}><X aria-hidden="true" /></button><nav className="mt-12 grid gap-6 text-xl font-bold" aria-label={t.common.navigation}>{nav.map((item) => <a key={item.id} onClick={() => setOpen(false)} href={item.href}>{item.label}</a>)}<div className="flex flex-wrap items-center gap-3"><ThemeSwitch /><LanguageSwitcher /></div></nav></div>}

        <div className="relative z-10 flex min-h-screen items-center px-5 pt-24 lg:px-20">
          <motion.div
            className="max-w-3xl max-md:!translate-y-0 max-md:!opacity-100"
            style={shouldReduceMotion
              ? { opacity: 1, y: 0 }
              : { opacity: heroContentOpacity, y: heroContentY }}
          >
            <motion.div
              className="marketing-motion-enter w-fit"
              {...heroEntrance(0)}
            >
              <motion.div
                className="max-md:!scale-100"
                style={{ scale: shouldReduceMotion ? 1 : heroVisualScale }}
              >
                <HeroSpotlightCard>
                  <p className="text-xs font-bold text-accent">{t.landing.cardTag}</p>
                  <h2 className="mt-5 text-xl font-black"><span className="font-serif italic">{t.landing.cardTitlePrefix}</span> {t.landing.cardTitleRest}</h2>
                </HeroSpotlightCard>
              </motion.div>
            </motion.div>
            <motion.p className="marketing-motion-enter font-jakarta text-[11px] font-bold uppercase tracking-[0.28em] text-accent" {...heroEntrance(0.08, 16)}>{t.landing.eyebrow}</motion.p>
            <motion.h1 className="marketing-motion-enter mt-5 max-w-4xl text-[40px] font-black uppercase leading-none tracking-tight md:text-7xl" {...heroEntrance(0.16, 20)}>{title}<span className="text-accent">.</span></motion.h1>
            <motion.div className="marketing-motion-enter" {...heroEntrance(0.24, 22)}>
              <p className="mt-7 max-w-xl text-lg font-semibold text-white/90 sm:text-xl">{t.landing.emphasis}</p>
              <p className="mt-3 max-w-xl text-base leading-7 text-white/60 sm:text-lg">{t.landing.body}</p>
              <div className="mt-8 flex flex-wrap gap-3"><Link href={loginHref} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-black uppercase text-background">{t.landing.start}<ArrowRight size={16} /></Link><GhostLink href="#open-source">{t.landing.architecture}</GhostLink></div>
            </motion.div>
          </motion.div>
        </div>
      </section>
      <MarketingSectionsArchitecture>
        <MarketingSectionShell sectionId="workspace-preview" variant="preview">
          <DashboardPreviewSection />
        </MarketingSectionShell>
        <MarketingSectionShell sectionId="capabilities" variant="capabilities">
          <PlatformCapabilitiesSection />
        </MarketingSectionShell>
        <MarketingSectionShell sectionId="platform-flow" variant="flow">
          <PlatformFlowSection />
        </MarketingSectionShell>
        <MarketingSectionShell sectionId="product-in-action" variant="product">
          <ProductOperationsSection />
        </MarketingSectionShell>
        <MarketingSectionShell sectionId="community-identity" variant="identity">
          <section id="open-source" className="relative overflow-hidden px-5 py-20 md:py-28 lg:py-36">
            <div className="pointer-events-none absolute left-1/2 top-0 h-px w-full max-w-[1280px] -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
            <div className="site-identity-ambient pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(94,210,156,0.12),transparent_34%)]" />
            <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-16">
              <MarketingReveal className="lg:col-span-5">
                <div className="lg:sticky lg:top-24">
                  <p className="font-jakarta text-[11px] font-bold uppercase tracking-[0.24em] text-accent">{t.landing.communityIdentity.eyebrow}</p>
                  <h2 className="mt-5 max-w-[540px] text-[clamp(2.6rem,5vw,5rem)] font-black leading-[0.98] tracking-tight">{t.landing.communityIdentity.title}</h2>
                  <p className="mt-6 max-w-[560px] text-lg leading-[1.7] text-white/62 md:text-xl">{t.landing.communityIdentity.description}</p>
                  <p className="mt-8 max-w-xl border-l border-accent/35 pl-6 text-base font-semibold leading-7 text-white/78">{t.landing.communityIdentity.emphasis}</p>
                  <p className="mt-5 max-w-xl text-sm leading-6 text-white/50">{t.landing.communityIdentity.supporting}</p>
                </div>
              </MarketingReveal>
              <FadeIn className="lg:col-span-7" delay={0.08} y={28}>
                <div className="site-identity-frame relative min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(94,210,156,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] md:p-8 lg:min-h-[620px]">
                  <div className="site-card-grid pointer-events-none absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:34px_34px]" />
                  <CommunityIdentityShowcase />
                </div>
              </FadeIn>
            </div>
          </section>
        </MarketingSectionShell>
        <MarketingSectionShell sectionId="platform-trust" variant="trust">
          <PlatformTrustSection />
        </MarketingSectionShell>
      </MarketingSectionsArchitecture>
      <PublicHomepageFooter />
    </main>
  );
}
