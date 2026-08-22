'use client';

import Link from 'next/link';
import { useI18n } from '../lib/i18n';
import { BrandWordmark } from '../components/brand-wordmark';

type FooterItem = {
  label: string;
  href: string;
};

type FooterNavigationGroup = {
  title: string;
  items: FooterItem[];
};

export function PublicHomepageFooter() {
  const { t } = useI18n();
  const footer = t.landing.footer;
  const groups: FooterNavigationGroup[] = [
    { title: footer.product, items: footer.links.product },
    { title: footer.infrastructure, items: footer.links.infrastructure },
    { title: footer.security, items: footer.links.security },
    { title: footer.openSource, items: footer.links.openSource },
  ];

  return (
    <footer className="relative px-5 pt-10 md:pt-10 lg:pt-12">
      <div className="site-footer-surface mx-auto max-w-[1500px] overflow-hidden rounded-t-[2rem] border border-white/10 bg-[radial-gradient(circle_at_10%_0%,rgba(94,210,156,0.16),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(94,210,156,0.08),transparent_30%),linear-gradient(180deg,rgba(14,35,28,0.96),rgba(5,8,7,0.98))] px-6 pb-8 pt-12 shadow-[0_-30px_90px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] md:px-10 md:pb-10 md:pt-16 lg:px-16 lg:pb-12 lg:pt-20">
        <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative">
          <section className="grid gap-10 border-b border-white/10 pb-14 md:pb-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pb-[72px]">
            <div>
              <p className="font-jakarta text-[11px] font-bold uppercase tracking-[0.24em] text-accent">{footer.ctaEyebrow}</p>
              <h2 className="mt-4 max-w-4xl text-3xl font-black leading-tight tracking-tight text-white md:text-5xl">{footer.ctaTitle}</h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/62 md:text-base">{footer.ctaBody}</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link href="/docs/architecture" className="rounded-full border border-white/12 bg-white/[0.03] px-5 py-3 text-sm font-bold text-white/80 transition hover:border-accent/35 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55">{footer.architecture}</Link>
              <Link href="/docs/deployment" className="inline-flex items-center rounded-full bg-accent px-5 py-3 text-sm font-black text-background transition hover:bg-[#74e4b1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b211a]">{footer.deploymentGuide}</Link>
            </div>
          </section>

          <section className="grid gap-10 border-b border-white/10 py-12 sm:grid-cols-2 md:py-14 lg:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))] lg:gap-12">
            <div>
              <BrandWordmark className="text-2xl text-white" />
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/58">{footer.tagline}</p>
            </div>
            {groups.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h3 className="text-sm font-black text-white">{group.title}</h3>
                <div className="mt-5 grid gap-3">
                  {group.items.map((item) => <FooterAction key={item.label} item={item} />)}
                </div>
              </nav>
            ))}
          </section>

          <section className="flex flex-col gap-4 pt-8 text-sm text-white/46 md:flex-row md:items-center md:justify-between lg:pt-10">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span>{footer.copyright}</span>
              <span>{footer.openSourceMeta}</span>
              <span>{footer.selfHosted}</span>
            </div>
          </section>
        </div>
      </div>
    </footer>
  );
}

function FooterAction({ item }: { item: FooterItem }) {
  return <Link href={item.href} className="text-sm text-white/56 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45">{item.label}</Link>;
}
