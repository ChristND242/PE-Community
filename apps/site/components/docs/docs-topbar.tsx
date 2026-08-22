'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '../../lib/i18n';
import { ThemeSwitch } from '../theme-switch';
import { DocsLanguageToggle } from './docs-language-toggle';
import { DocsMobileNav } from './docs-mobile-nav';
import { DocsSearch } from './docs-search';

export function DocsTopbar() {
  const pathname = usePathname();
  const { lang } = useI18n();
  const labels = lang === 'fr'
    ? { home: 'Aller à la page d’accueil', brand: 'Documentation PE Community', docs: 'Documentation', deployment: 'Déploiement' }
    : { home: 'Go to home page', brand: 'PE Community Docs', docs: 'Docs', deployment: 'Deployment' };
  return (
    <header className="docs-topbar sticky top-0 z-40 h-16 border-b border-white/[0.06] bg-[#07110d]/80 backdrop-blur-md">
      <div className="flex h-full items-center gap-4 px-4 md:px-5 lg:px-6">
        <DocsMobileNav />
        <Link href="/" className="flex min-w-fit items-center gap-3" aria-label={labels.home}>
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04]">
            <Image src="/Pona%20Ekolo.svg" alt="Pona Ekolo logo" width={28} height={28} className="rounded-lg object-contain" />
          </span>
          <span className="hidden font-semibold tracking-tight text-white sm:inline">{labels.brand}</span>
          <span className="font-semibold tracking-tight text-white sm:hidden">{labels.docs}</span>
        </Link>
        <div className="hidden flex-1 justify-center md:flex">
          <DocsSearch />
        </div>
        <ThemeSwitch className="ml-auto" />
        <nav className="hidden items-center gap-5 text-sm font-medium text-white/52 lg:flex">
          <Link href="/docs" aria-current={pathname === '/docs' ? 'page' : undefined} className="transition hover:text-white/85">{labels.docs}</Link>
          <Link href="/docs/deployment" aria-current={pathname === '/docs/deployment' ? 'page' : undefined} className="transition hover:text-white/85">{labels.deployment}</Link>
          <DocsLanguageToggle />
        </nav>
      </div>
    </header>
  );
}
