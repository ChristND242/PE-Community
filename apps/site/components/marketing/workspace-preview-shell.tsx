'use client';

import { Bell, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, KeyRound, LayoutDashboard, LogOut, Mail, MessageCircle, Newspaper, Settings, Shield, UserRound, Users, X } from 'lucide-react';
import { useState } from 'react';
import {
  DashboardDesktopSidebar,
  DashboardSidebarNavItem,
  DashboardTopbar,
  HeaderNotificationBadge,
  SidebarNavGroup,
} from '../dashboard-shell-presentation';
import type { ShellCurrentUser } from '../dashboard-shell-presentation';
import { LanguageSwitcher, statusLabel, useI18n } from '../../lib/i18n';

type PreviewWorkspace = 'admin' | 'member';
export type PreviewLanguage = 'en' | 'fr';

export function WorkspacePreviewShell({ workspace, viewer, notificationCount, feedUnreadCount, chatUnreadCount, language, onLanguageChange, children }: { workspace: PreviewWorkspace; viewer: ShellCurrentUser; notificationCount: number; feedUnreadCount: number; chatUnreadCount: number; language: PreviewLanguage; onLanguageChange: (language: PreviewLanguage) => void; children: React.ReactNode }) {
  const { t } = useI18n();
  const [activeHref, setActiveHref] = useState(workspace === 'admin' ? '/admin' : '/dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const admin = workspace === 'admin';
  const workspaceName = admin ? t.admin.operations : t.common.communityPortal;
  const primaryLinks = admin
    ? [
        { href: '/admin', label: t.nav.admin, icon: Shield, badgeCount: 0 },
        { href: '/admin/chat', label: t.nav.chat, icon: MessageCircle, badgeCount: chatUnreadCount },
      ]
    : [
        { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard, badgeCount: 0 },
        { href: '/dashboard/profile', label: t.nav.profile, icon: UserRound, badgeCount: 0 },
        { href: '/dashboard/members', label: t.nav.directory, icon: Users, badgeCount: 0 },
        { href: '/dashboard/feed', label: t.nav.feed, icon: Newspaper, badgeCount: feedUnreadCount },
        { href: '/dashboard/events', label: t.nav.events, icon: CalendarDays, badgeCount: 0 },
        { href: '/dashboard/task-boards', label: t.nav.taskBoards, icon: ClipboardList, badgeCount: 0 },
        { href: '/dashboard/chat', label: t.nav.chat, icon: MessageCircle, badgeCount: chatUnreadCount },
      ];
  const operationsSections = [
    { href: '/admin/events', label: t.nav.events, icon: CalendarDays },
    { href: '/admin/calendar', label: t.nav.calendar, icon: CalendarRange },
    { href: '/admin/task-boards', label: t.nav.taskBoards, icon: ClipboardList },
    { href: '/admin/announcements', label: t.nav.announcements, icon: Newspaper },
  ];
  const userManagementSections = [
    { href: '/admin/registrations', label: t.nav.registrations, icon: ClipboardCheck },
    { href: '/admin/members', label: t.nav.members, icon: Users },
    { href: '/admin/roles', label: t.nav.roles, icon: KeyRound },
  ];
  const auditSections = [
    { href: '/admin/emails', label: t.nav.emailAudit, icon: Mail },
    { href: '/admin/streaks', label: t.nav.streak, icon: ClipboardList },
  ];

  const desktopControls = (
    <>
      <button type="button" aria-disabled="true" className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
        <Bell size={16} /><HeaderNotificationBadge count={notificationCount} />
      </button>
      <LanguageSwitcher value={language} onChange={onLanguageChange} />
      <button type="button" aria-disabled="true" className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"><LogOut size={16} />{t.common.logout}</button>
    </>
  );

  return (
    <div className="site-workspace-app relative h-[760px] overflow-hidden bg-background bg-[radial-gradient(circle_at_top_right,rgba(94,210,156,0.08),transparent_34rem)]">
      <DashboardDesktopSidebar contained brandHref="/" workspaceName={workspaceName} roleLabel={statusLabel(t, viewer.role)}>
        <nav className="space-y-1.5">
          {primaryLinks.map((link) => <DashboardSidebarNavItem key={link.href} label={link.label} icon={link.icon} active={activeHref === link.href} badgeCount={link.badgeCount} onClick={() => setActiveHref(link.href)} />)}
          {admin && <SidebarNavGroup label={t.admin.operations} icon={CalendarDays} sections={operationsSections} open={operationsOpen} setOpen={setOperationsOpen} pathname="" controlsId="preview-admin-operations" previewActiveHref={activeHref} onPreviewNavigate={setActiveHref} />}
          {admin && <SidebarNavGroup label={t.nav.userManagement} icon={UserRound} sections={userManagementSections} open={userManagementOpen} setOpen={setUserManagementOpen} pathname="" controlsId="preview-admin-user-management" previewActiveHref={activeHref} onPreviewNavigate={setActiveHref} />}
          {admin && <SidebarNavGroup label={t.nav.audit} icon={ClipboardList} sections={auditSections} open={auditOpen} setOpen={setAuditOpen} pathname="" controlsId="preview-admin-audit" previewActiveHref={activeHref} onPreviewNavigate={setActiveHref} />}
        </nav>
        <nav className="mt-auto space-y-1.5 border-t border-white/10 pt-4">
          <DashboardSidebarNavItem label={t.nav.settings} icon={Settings} active={activeHref === (admin ? '/admin/settings' : '/dashboard/settings')} onClick={() => setActiveHref(admin ? '/admin/settings' : '/dashboard/settings')} />
        </nav>
      </DashboardDesktopSidebar>

      <main className="h-full overflow-y-auto lg:pl-72">
        <DashboardTopbar workspaceName={workspaceName} user={viewer} desktopControls={desktopControls} menuOpen={mobileMenuOpen} onOpenMenu={() => setMobileMenuOpen(true)} />
        {mobileMenuOpen && (
          <div className="absolute inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.common.navigation}>
            <button type="button" aria-label={t.common.closeMenu} className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute right-0 top-0 flex h-full w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-y-auto border-l border-accent/15 bg-[#07100d]/98 p-4 shadow-2xl shadow-black/50">
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label={t.common.closeMenu} className="ml-auto rounded-full border border-white/10 bg-black/20 p-2 text-white/68 transition hover:border-accent/30 hover:text-accent"><X size={17} /></button>
              <nav className="mt-4 space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.025] p-2">{primaryLinks.map((link) => <DashboardSidebarNavItem key={link.href} mobile label={link.label} icon={link.icon} active={activeHref === link.href} badgeCount={link.badgeCount} onClick={() => { setActiveHref(link.href); setMobileMenuOpen(false); }} />)}</nav>
            </aside>
          </div>
        )}
        <div className="site-preview-content mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
