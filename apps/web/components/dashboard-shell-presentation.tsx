'use client';

import { ChevronDown, Menu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../lib/i18n';
import { identityVerificationForRole } from '../lib/identity-verification';
import { IdentityVerificationBadge } from './identity-verification-badge';
import { ProfilePhoto } from './profile-photo';

export type ShellCurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  communityId?: string;
  permissions?: string[];
  sessionId?: string;
  emailVerified?: boolean;
  avatarUrl?: string | null;
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
};

export function DashboardDesktopSidebar({ workspaceName, roleLabel, children, contained = false, brandHref }: { workspaceName: string; roleLabel?: string; children: React.ReactNode; contained?: boolean; brandHref?: string }) {
  const { t } = useI18n();
  const brand = (
    <>
      <ShellLogoMark alt="" size="md" />
      <span>{t.brand.short.split(' ')[0]} <span className="text-accent">{t.brand.short.split(' ').slice(1).join(' ')}</span></span>
    </>
  );
  const brandClassName = 'flex items-center gap-3 rounded-xl px-2 py-1 font-jakarta text-lg font-black';
  return (
    <aside className={`${contained ? 'absolute' : 'fixed'} inset-y-0 left-0 hidden w-72 flex-col overflow-y-auto border-r border-[var(--app-border)] bg-[var(--app-sidebar)] p-5 shadow-2xl shadow-black/30 backdrop-blur lg:flex`}>
      {brandHref
        ? <Link href={brandHref} className={brandClassName}>{brand}</Link>
        : <div className={brandClassName}>{brand}</div>}
      <DashboardWorkspaceCard workspaceName={workspaceName} roleLabel={roleLabel} />
      <div className="mt-7 flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}

export function DashboardWorkspaceCard({ workspaceName, roleLabel }: { workspaceName: string; roleLabel?: string }) {
  const { t } = useI18n();
  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">{t.common.workspace}</p>
      <p className="mt-2 text-sm font-semibold text-white">{workspaceName}</p>
      {roleLabel && <p className="mt-1 text-xs text-white/45">{roleLabel}</p>}
    </div>
  );
}

export function DashboardTopbar({ workspaceName, user, desktopControls, mobileControls, menuOpen, onOpenMenu }: { workspaceName: string; user: ShellCurrentUser | null; desktopControls: React.ReactNode; mobileControls?: React.ReactNode; menuOpen: boolean; onOpenMenu: () => void }) {
  const { t } = useI18n();
  const mobileBrand = <><ShellLogoMark alt="" size="sm" /><span className="min-w-0"><span className="block truncate font-jakarta text-sm font-black text-white">{t.brand.short}</span><span className="block truncate text-xs text-white/45">{workspaceName}</span></span></>;
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-topbar)] px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-3 rounded-xl py-1 lg:hidden">{mobileBrand}</div>
        <div className="hidden min-w-0 lg:block"><DashboardShellIdentity user={user} /></div>
      </div>
      <div className="hidden items-center gap-3 lg:flex">{desktopControls}</div>
      {mobileControls}
      <button type="button" onClick={onOpenMenu} aria-label={t.common.openMenu} aria-expanded={menuOpen} className="rounded-full border border-white/10 bg-white/[0.04] p-2.5 text-white/76 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent lg:hidden"><Menu size={19} /></button>
    </header>
  );
}

export function DashboardShellIdentity({ user }: { user: ShellCurrentUser | null }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {user && <ProfilePhoto name={user.name} avatarUrl={user.avatarUrl} dicebearStyle={user.dicebearStyle} dicebearSeed={user.dicebearSeed} size="sm" />}
      <div className="min-w-0"><p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-white"><span className="truncate">{user?.name ?? t.brand.short}</span>{user && <IdentityVerificationBadge kind={identityVerificationForRole(user.role)} size="xs" />}</p><p className="truncate text-xs text-white/45">{user ? `${t.common.signedInAs} ${user.email}` : t.common.communityPortal}</p></div>
    </div>
  );
}

export function DashboardSidebarNavItem({ label, icon: Icon, active, badgeCount = 0, href, onClick, ariaLabel, mobile = false }: { label: string; icon: LucideIcon; active: boolean; badgeCount?: number; href?: string; onClick?: () => void; ariaLabel?: string; mobile?: boolean }) {
  const tone = mobile
    ? active ? 'border-accent/20 bg-accent/15 text-accent' : 'border-transparent text-white/68 hover:border-accent/10 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:border-white/10 dark:hover:bg-white/[0.055]'
    : active ? 'border-accent/20 bg-accent/15 text-accent shadow-lg shadow-accent/5' : 'border-transparent text-white/62 hover:border-accent/10 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:border-white/10 dark:hover:bg-white/[0.055]';
  const className = `group flex w-full items-center gap-3 rounded-xl border px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${mobile ? 'py-3' : 'py-2.5'} ${tone}`;
  const content = <><Icon size={17} /><span className="min-w-0 flex-1 truncate font-medium">{label}</span><SidebarBadge count={badgeCount} /></>;
  if (href) return <Link href={href} onClick={onClick} aria-label={ariaLabel} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} aria-label={ariaLabel} aria-pressed={active} className={className}>{content}</button>;
}

export function SidebarNavGroup({ label, icon: Icon, sections, open, setOpen, pathname, controlsId, mobile = false, onNavigate, previewActiveHref, onPreviewNavigate }: { label: string; icon: LucideIcon; sections: Array<{ href: string; label: string; icon: LucideIcon }>; open: boolean; setOpen: Dispatch<SetStateAction<boolean>>; pathname: string; controlsId: string; mobile?: boolean; onNavigate?: () => void; previewActiveHref?: string; onPreviewNavigate?: (href: string) => void }) {
  const activePath = previewActiveHref ?? pathname;
  const active = sections.some((section) => sidebarRouteIsActive(activePath, section.href));
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={controlsId} onClick={() => setOpen((current) => !current)} className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${mobile ? 'py-3' : 'py-2.5'} ${active ? 'border-accent/20 bg-accent/15 text-accent shadow-lg shadow-accent/5' : open ? 'border-accent/10 bg-[var(--app-interactive-open)] text-white dark:border-transparent dark:bg-transparent dark:text-white/62' : 'border-transparent text-white/62 hover:border-accent/10 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:border-white/10 dark:hover:bg-white/[0.055]'}`}><Icon size={17} /><span className="min-w-0 flex-1 truncate font-medium">{label}</span><ChevronDown size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} /></button>
      {open && <div id={controlsId} className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">{sections.map((section) => { const childActive = sidebarRouteIsActive(activePath, section.href); const className = `flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${childActive ? 'border-accent/15 bg-accent/10 text-accent' : 'border-transparent text-white/55 hover:border-accent/10 hover:bg-[var(--app-interactive-hover)] hover:text-white dark:hover:border-white/10 dark:hover:bg-white/[0.045]'}`; const content = <><section.icon size={15} /><span className="min-w-0 flex-1 truncate font-medium">{section.label}</span></>; return onPreviewNavigate ? <button key={section.href} type="button" onClick={() => onPreviewNavigate(section.href)} aria-pressed={childActive} className={className}>{content}</button> : <Link key={section.href} href={section.href} onClick={onNavigate} aria-current={childActive ? 'page' : undefined} className={className}>{content}</Link>; })}</div>}
    </div>
  );
}

function sidebarRouteIsActive(pathname: string, href: string) { return pathname === href || pathname.startsWith(`${href}/`); }

export function SidebarBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-none text-white shadow-sm shadow-red-950/25">{count > 99 ? '99+' : count}</span>;
}

export function HeaderNotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-none text-white shadow-sm shadow-red-950/25">{count > 99 ? '99+' : count}</span>;
}

export function ShellLogoMark({ alt, size }: { alt: string; size: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === 'sm' ? 'h-9 w-9' : 'h-10 w-10';
  if (failed) return <span className={`grid ${sizeClass} shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-sm font-semibold text-accent`}>PE</span>;
  return <span className={`grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-lg border border-accent/25 bg-white/[0.035] p-1.5`}><img src="/Pona%20Ekolo.svg" alt={alt} className="h-full w-full object-contain" onError={() => setFailed(true)} /></span>;
}
