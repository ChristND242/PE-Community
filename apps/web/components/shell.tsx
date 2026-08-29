'use client';

import { Bell, CalendarClock, CalendarDays, CalendarRange, ChevronDown, ClipboardCheck, ClipboardList, FileText, Flame, KeyRound, LayoutDashboard, ListChecks, LogOut, Mail, MessageCircle, Newspaper, Settings, Shield, ShieldCheck, SlidersHorizontal, UserRound, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, RefObject, SetStateAction } from 'react';
import { toast } from 'sonner';
import { apiUrl, COMMUNITY_ID, handleUnauthorizedResponse } from '../lib/api';
import { useAdminNotifications } from '../hooks/use-admin-notifications';
import { useMemberNotifications } from '../hooks/use-member-notifications';
import { useChatUnreadCount } from '../hooks/use-chat-unread-count';
import { useGlobalNotificationToasts } from '../hooks/use-global-notification-toasts';
import { taskNotificationHref } from '../lib/task-notification-link';
import { publishSessionActivityMessage } from '../lib/session-activity';
import type { AdminNotificationItem } from '../hooks/use-admin-notifications';
import type { MemberNotificationItem } from '../hooks/use-member-notifications';
import { LanguageSwitcher, useI18n } from '../lib/i18n';
import { memberNotificationHref } from '../lib/member-notification-link';
import { identityVerificationForRole } from '../lib/identity-verification';
import { PERMISSIONS, hasPermission } from '../lib/permissions';
import { userRoleLabel } from '../lib/user-role';
import { ProfilePhoto } from './profile-photo';
import { IdentityVerificationBadge } from './identity-verification-badge';
import { ConfirmDialog, Spinner } from './ui';
import { ThemeToggle } from './theme-toggle';
import {
  DashboardDesktopSidebar,
  DashboardSidebarNavItem,
  DashboardTopbar,
  HeaderNotificationBadge,
  ShellLogoMark,
  SidebarBadge,
  SidebarNavGroup,
} from './dashboard-shell-presentation';
import type { ShellCurrentUser } from './dashboard-shell-presentation';

type CurrentUser = ShellCurrentUser;
type SidebarLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  settingsMenu?: boolean;
};
type SidebarCounts = {
  feed: number;
};

export function AppShell({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const userManagementRouteActive = pathname.startsWith('/admin/registrations') || pathname.startsWith('/admin/members') || pathname.startsWith('/admin/roles');
  const auditRouteActive = pathname.startsWith('/admin/emails') || pathname.startsWith('/admin/streaks') || pathname.startsWith('/admin/audit');
  const operationsRouteActive = pathname.startsWith('/admin/events') || pathname.startsWith('/admin/calendar') || pathname.startsWith('/admin/task-boards') || pathname.startsWith('/admin/announcements');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [sidebarCounts, setSidebarCounts] = useState<SidebarCounts | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [emailVerificationWarningOpen, setEmailVerificationWarningOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [userManagementMenuOpen, setUserManagementMenuOpen] = useState(userManagementRouteActive);
  const [mobileUserManagementMenuOpen, setMobileUserManagementMenuOpen] = useState(userManagementRouteActive);
  const [auditMenuOpen, setAuditMenuOpen] = useState(auditRouteActive);
  const [mobileAuditMenuOpen, setMobileAuditMenuOpen] = useState(auditRouteActive);
  const [operationsMenuOpen, setOperationsMenuOpen] = useState(operationsRouteActive);
  const [mobileOperationsMenuOpen, setMobileOperationsMenuOpen] = useState(operationsRouteActive);
  const [adminNotificationsOpen, setAdminNotificationsOpen] = useState(false);
  const [memberNotificationsOpen, setMemberNotificationsOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const adminNotificationsRef = useRef<HTMLDivElement | null>(null);
  const mobileAdminNotificationsRef = useRef<HTMLDivElement | null>(null);
  const memberNotificationsRef = useRef<HTMLDivElement | null>(null);
  const mobileMemberNotificationsRef = useRef<HTMLDivElement | null>(null);
  const adminNotificationsEnabled = admin && hasPermission(user, PERMISSIONS.notificationsAdminRead);
  const memberNotificationsEnabled = !admin && Boolean(user);
  const chatUnreadEnabled = Boolean(user && hasPermission(user, PERMISSIONS.chatView));
  const { count: chatUnreadCount } = useChatUnreadCount(chatUnreadEnabled);
  const { notifications: adminNotifications, notificationsLoading, notificationsInitialized, unreadCount: adminUnreadNotifications, markAsRead: dismissAdminNotification } = useAdminNotifications(adminNotificationsEnabled, adminNotificationsOpen);
  const { notifications: memberNotifications, loading: memberNotificationsLoading, notificationsInitialized: memberNotificationsInitialized, unreadCount: memberUnreadNotifications, markAsRead: dismissMemberNotification } = useMemberNotifications(memberNotificationsEnabled, memberNotificationsOpen);
  useGlobalNotificationToasts({
    audience: admin ? 'admin' : 'member',
    communityId: user?.communityId ?? COMMUNITY_ID,
    userId: user?.id,
    notifications: admin ? adminNotifications : memberNotifications,
    notificationsReady: admin ? notificationsInitialized : memberNotificationsInitialized,
  });
  const adminSettingsSections = admin
    ? [
        { href: '/admin/settings/profile', label: t.nav.profile, icon: UserRound },
        ...(hasPermission(user, PERMISSIONS.settingsGeneralManage) ? [{ href: '/admin/settings/general', label: t.admin.settingsGeneral, icon: SlidersHorizontal }] : []),
        ...(hasPermission(user, PERMISSIONS.settingsSecurityManage) || hasPermission(user, PERMISSIONS.settingsSmtpManage) ? [{ href: '/admin/settings/security', label: t.admin.settingsSecurity, icon: ShieldCheck }] : []),
        ...(hasPermission(user, PERMISSIONS.settingsRemindersManage) ? [{ href: '/admin/settings/reminders', label: t.admin.settingsReminders, icon: CalendarClock }] : []),
        ...(hasPermission(user, PERMISSIONS.settingsTemplatesManage) ? [{ href: '/admin/settings/templates', label: t.admin.settingsTemplates, icon: FileText }] : []),
        ...(hasPermission(user, PERMISSIONS.settingsNotificationsManage) ? [{ href: '/admin/settings/notifications', label: t.admin.settingsNotifications, icon: Bell }] : []),
      ]
    : [];
  const adminAuditSections = admin
    ? [
        ...(hasPermission(user, PERMISSIONS.emailRead) ? [{ href: '/admin/emails', label: t.nav.emailAudit, icon: Mail }] : []),
        ...(hasPermission(user, PERMISSIONS.auditLogsRead) ? [{ href: '/admin/audit/logs', label: t.nav.logs, icon: ListChecks }] : []),
        ...(hasPermission(user, PERMISSIONS.auditLogsRead) ? [{ href: '/admin/streaks', label: t.nav.streak, icon: Flame }] : []),
      ]
    : [];
  const adminUserManagementSections = admin
    ? [
        { href: '/admin/registrations', label: t.nav.registrations, icon: ClipboardCheck },
        { href: '/admin/members', label: t.nav.members, icon: Users },
        ...(hasPermission(user, PERMISSIONS.rolesRead) ? [{ href: '/admin/roles', label: t.nav.roles, icon: KeyRound }] : []),
      ]
    : [];
  const adminOperationsSections = admin
      ? [
        { href: '/admin/events', label: t.nav.events, icon: CalendarDays },
        ...(hasPermission(user, PERMISSIONS.eventsRead) ? [{ href: '/admin/calendar', label: t.nav.calendar, icon: CalendarRange }] : []),
        { href: '/admin/task-boards', label: t.nav.taskBoards, icon: ClipboardList },
        { href: '/admin/announcements', label: t.nav.announcements, icon: Newspaper },
      ]
    : [];
  const links: SidebarLink[] = admin
    ? [
        { href: '/admin', label: t.nav.admin, icon: Shield },
        ...(hasPermission(user, PERMISSIONS.chatView) ? [{ href: '/admin/chat', label: t.nav.chat, icon: MessageCircle }] : []),
      ]
    : [
        { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
        { href: '/dashboard/profile', label: t.nav.profile, icon: UserRound },
        { href: '/dashboard/members', label: t.nav.directory, icon: Users },
        { href: '/dashboard/feed', label: t.nav.feed, icon: Newspaper },
        { href: '/dashboard/events', label: t.nav.events, icon: CalendarDays },
        { href: '/dashboard/task-boards', label: t.nav.taskBoards, icon: ClipboardList },
        ...(hasPermission(user, PERMISSIONS.chatView) ? [{ href: '/dashboard/chat', label: t.nav.chat, icon: MessageCircle }] : []),
      ];
  const settingsLink: SidebarLink = admin
    ? { href: '/admin/settings', label: t.nav.settings, icon: Settings, settingsMenu: true }
    : { href: '/dashboard/settings', label: t.nav.settings, icon: Settings };
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
    } finally {
      publishSessionActivityMessage({ type: 'logout', at: Date.now() });
      window.location.replace('/login');
      setLoggingOut(false);
    }
  }
  function dismissEmailVerificationWarning() {
    if (user?.id && user.sessionId) sessionStorage.setItem(emailVerificationWarningKey(user.id, user.sessionId), 'dismissed');
    setEmailVerificationWarningOpen(false);
  }

  function openEmailVerification() {
    dismissEmailVerificationWarning();
    router.push(admin ? '/admin/settings/profile?tab=email' : '/dashboard/profile?tab=email');
  }
  useEffect(() => {
    fetch(apiUrl('/auth/me'), { credentials: 'include' })
      .then((response) => {
        if (handleUnauthorizedResponse(response)) return null;
        return response.ok ? response.json() : null;
      })
      .then((nextUser) => setUser(nextUser))
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (!user?.id || !user.sessionId || user.emailVerified) {
      setEmailVerificationWarningOpen(false);
      return;
    }
    setEmailVerificationWarningOpen(sessionStorage.getItem(emailVerificationWarningKey(user.id, user.sessionId)) !== 'dismissed');
  }, [user?.emailVerified, user?.id, user?.sessionId]);
  useEffect(() => {
    if (!user?.id) return;
    showAdminPromotionToastOnce(user, t.common.adminPromotionToast);
  }, [t.common.adminPromotionToast, user?.communityId, user?.id, user?.role]);
  useEffect(() => {
    if (!adminNotificationsEnabled) setAdminNotificationsOpen(false);
  }, [adminNotificationsEnabled]);
  useEffect(() => {
    if (!memberNotificationsEnabled) setMemberNotificationsOpen(false);
  }, [memberNotificationsEnabled]);
  useEffect(() => {
    if (admin || !user) return;
    let canceled = false;
    async function loadSidebarCounts() {
      try {
        const response = await fetch(apiUrl('/me/sidebar-counts'), { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error('Sidebar counts unavailable.');
        const counts = await response.json() as SidebarCounts;
        if (!canceled) setSidebarCounts(counts);
      } catch {
        if (!canceled) setSidebarCounts(null);
      }
    }
    loadSidebarCounts();
    const interval = window.setInterval(loadSidebarCounts, 60_000);
    window.addEventListener('pe:sidebar-counts-refresh', loadSidebarCounts);
    return () => {
      canceled = true;
      window.clearInterval(interval);
      window.removeEventListener('pe:sidebar-counts-refresh', loadSidebarCounts);
    };
  }, [admin, pathname, user]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);
  useEffect(() => {
    if (!userManagementRouteActive) return;
    setUserManagementMenuOpen(true);
    setMobileUserManagementMenuOpen(true);
  }, [userManagementRouteActive]);
  useEffect(() => {
    if (!auditRouteActive) return;
    setAuditMenuOpen(true);
    setMobileAuditMenuOpen(true);
  }, [auditRouteActive]);
  useEffect(() => {
    if (!operationsRouteActive) return;
    setOperationsMenuOpen(true);
    setMobileOperationsMenuOpen(true);
  }, [operationsRouteActive]);
  useEffect(() => {
    if (!settingsMenuOpen) return;
    function closeSettingsMenu(event: MouseEvent) {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) setSettingsMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setSettingsMenuOpen(false);
    }
    document.addEventListener('mousedown', closeSettingsMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeSettingsMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [settingsMenuOpen]);
  useEffect(() => {
    if (!adminNotificationsOpen) return;
    function closeAdminNotifications(event: MouseEvent) {
      const target = event.target as Node;
      if (adminNotificationsRef.current?.contains(target) || mobileAdminNotificationsRef.current?.contains(target)) return;
      setAdminNotificationsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAdminNotificationsOpen(false);
    }
    document.addEventListener('mousedown', closeAdminNotifications);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeAdminNotifications);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [adminNotificationsOpen]);
  useEffect(() => {
    if (!memberNotificationsOpen) return;
    function closeMemberNotifications(event: MouseEvent) {
      const target = event.target as Node;
      if (memberNotificationsRef.current?.contains(target) || mobileMemberNotificationsRef.current?.contains(target)) return;
      setMemberNotificationsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMemberNotificationsOpen(false);
    }
    document.addEventListener('mousedown', closeMemberNotifications);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMemberNotifications);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [memberNotificationsOpen]);
  function toggleAdminNotifications() {
    setAdminNotificationsOpen((open) => !open);
  }
  async function dismissAlert(id: string) {
    await dismissAdminNotification(id);
  }
  function openAdminNotification(notification: AdminNotificationItem) {
    const target = adminNotificationTarget(notification);
    if (!target) return;
    setAdminNotificationsOpen(false);
    router.push(target);
  }
  function openMemberNotification(notification: MemberNotificationItem) {
    const target = memberNotificationHref(notification);
    if (!target) return;
    setMemberNotificationsOpen(false);
    void dismissMemberNotification(notification.id);
    router.push(target);
  }
  return (
    <div className="app-authenticated min-h-screen overflow-x-hidden bg-background bg-[radial-gradient(circle_at_top_right,rgba(94,210,156,0.08),transparent_34rem)]">
      <DashboardDesktopSidebar
        workspaceName={admin ? t.admin.operations : t.common.communityPortal}
        roleLabel={user ? userRoleLabel(t, user.role) : undefined}
      >
        <nav className="space-y-1.5">
          {links.map((link) => {
            const active = link.href === '/admin/settings' ? pathname.startsWith('/admin/settings') : pathname === link.href;
            const badgeCount = sidebarBadgeCount(link.href, sidebarCounts, chatUnreadCount);
            return (
              <DashboardSidebarNavItem key={link.href} href={link.href} label={link.label} icon={link.icon} active={active} badgeCount={badgeCount} ariaLabel={sidebarLinkAriaLabel(link.label, link.href, badgeCount, t)} />
            );
          })}
          {adminOperationsSections.length > 0 && (
            <SidebarNavGroup
              label={t.admin.operations}
              icon={CalendarDays}
              sections={adminOperationsSections}
              open={operationsMenuOpen}
              setOpen={setOperationsMenuOpen}
              pathname={pathname}
              controlsId="admin-operations-menu"
            />
          )}
          {adminUserManagementSections.length > 0 && (
            <SidebarNavGroup
              label={t.nav.userManagement}
              icon={UserRound}
              sections={adminUserManagementSections}
              open={userManagementMenuOpen}
              setOpen={setUserManagementMenuOpen}
              pathname={pathname}
              controlsId="admin-user-management-menu"
            />
          )}
          {adminAuditSections.length > 0 && (
            <SidebarNavGroup
              label={t.nav.audit}
              icon={ClipboardList}
              sections={adminAuditSections}
              open={auditMenuOpen}
              setOpen={setAuditMenuOpen}
              pathname={pathname}
              controlsId="admin-audit-menu"
            />
          )}
        </nav>
        <nav className="mt-auto space-y-1.5 border-t border-white/10 pt-4">
          <SidebarSettingsLink
            link={settingsLink}
            active={pathname.startsWith(admin ? '/admin/settings' : '/dashboard/settings')}
            adminSettingsSections={adminSettingsSections}
            settingsMenuOpen={settingsMenuOpen}
            setSettingsMenuOpen={setSettingsMenuOpen}
            settingsMenuRef={settingsMenuRef}
            t={t}
          />
        </nav>
      </DashboardDesktopSidebar>
      <main className="lg:pl-72">
        <DashboardTopbar
          workspaceName={admin ? t.admin.operations : t.common.communityPortal}
          user={user}
          menuOpen={mobileMenuOpen}
          onOpenMenu={() => setMobileMenuOpen(true)}
          desktopControls={
            <>
            {adminNotificationsEnabled && (
              <div ref={adminNotificationsRef} className="relative">
                <button type="button" aria-expanded={adminNotificationsOpen} aria-controls="admin-notifications-menu" aria-label={adminUnreadNotifications > 0 ? t.admin.unreadAdminNotifications(adminUnreadNotifications) : t.admin.adminNotifications} title={adminUnreadNotifications > 0 ? t.admin.unreadAdminNotifications(adminUnreadNotifications) : t.admin.adminNotifications} onClick={toggleAdminNotifications} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                  <Bell size={16} />
                  <HeaderNotificationBadge count={adminUnreadNotifications} />
                </button>
                {adminNotificationsOpen && <AdminNotificationMenu id="admin-notifications-menu" notifications={adminNotifications} loading={notificationsLoading} unreadCount={adminUnreadNotifications} t={t} onDismiss={dismissAlert} onOpen={openAdminNotification} />}
              </div>
            )}
            {memberNotificationsEnabled && (
              <div ref={memberNotificationsRef} className="relative">
                <button type="button" aria-expanded={memberNotificationsOpen} aria-controls="member-notifications-menu" aria-label={t.dashboard.notificationsDescription(memberUnreadNotifications)} title={t.nav.notifications} onClick={() => setMemberNotificationsOpen((open) => !open)} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                  <Bell size={16} />
                  <HeaderNotificationBadge count={memberUnreadNotifications} />
                </button>
                {memberNotificationsOpen && <MemberNotificationMenu id="member-notifications-menu" notifications={memberNotifications} loading={memberNotificationsLoading} unreadCount={memberUnreadNotifications} t={t} onDismiss={dismissMemberNotification} onOpen={openMemberNotification} />}
              </div>
            )}
              <ThemeToggle />
              <LanguageSwitcher />
              <button onClick={logout} disabled={loggingOut} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-60">{loggingOut ? <Spinner /> : <LogOut size={16} />}{t.common.logout}</button>
            </>
          }
          mobileControls={
            <>
            {adminNotificationsEnabled && (
            <div ref={mobileAdminNotificationsRef} className="relative ml-auto lg:hidden">
              <button type="button" aria-expanded={adminNotificationsOpen} aria-controls="mobile-admin-notifications-menu" aria-label={adminUnreadNotifications > 0 ? t.admin.unreadAdminNotifications(adminUnreadNotifications) : t.admin.adminNotifications} title={adminUnreadNotifications > 0 ? t.admin.unreadAdminNotifications(adminUnreadNotifications) : t.admin.adminNotifications} onClick={toggleAdminNotifications} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">
                <Bell size={17} />
                <HeaderNotificationBadge count={adminUnreadNotifications} />
              </button>
              {adminNotificationsOpen && <AdminNotificationMenu id="mobile-admin-notifications-menu" notifications={adminNotifications} loading={notificationsLoading} unreadCount={adminUnreadNotifications} t={t} onDismiss={dismissAlert} onOpen={openAdminNotification} />}
            </div>
            )}
            {memberNotificationsEnabled && (
            <div ref={mobileMemberNotificationsRef} className="relative ml-auto lg:hidden">
              <button type="button" aria-expanded={memberNotificationsOpen} aria-controls="mobile-member-notifications-menu" aria-label={t.dashboard.notificationsDescription(memberUnreadNotifications)} title={t.nav.notifications} onClick={() => setMemberNotificationsOpen((open) => !open)} className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">
                <Bell size={17} />
                <HeaderNotificationBadge count={memberUnreadNotifications} />
              </button>
              {memberNotificationsOpen && <MemberNotificationMenu id="mobile-member-notifications-menu" notifications={memberNotifications} loading={memberNotificationsLoading} unreadCount={memberUnreadNotifications} t={t} onDismiss={dismissMemberNotification} onOpen={openMemberNotification} />}
            </div>
            )}
            </>
          }
        />
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t.common.navigation}>
            <button type="button" aria-label={t.common.closeMenu} className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
            <aside className="absolute right-0 top-0 flex h-full w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-y-auto border-l border-accent/15 bg-[var(--app-elevated)] p-4 text-[var(--app-foreground)] shadow-2xl shadow-black/25">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <ShellLogoMark alt={t.brand.logoAlt} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-jakarta text-base font-black text-white">{t.brand.short}</p>
                      <p className="mt-1 truncate text-xs text-white/45">{admin ? t.admin.operations : t.common.communityPortal}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label={t.common.closeMenu} className="rounded-full border border-white/10 bg-black/20 p-2 text-white/68 transition hover:border-accent/30 hover:text-accent">
                    <X size={17} />
                  </button>
                </div>
                {user && (
                  <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <ProfilePhoto name={user.name} avatarUrl={user.avatarUrl} dicebearStyle={user.dicebearStyle} dicebearSeed={user.dicebearSeed} size="sm" />
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-white"><span className="truncate">{user.name}</span><IdentityVerificationBadge kind={identityVerificationForRole(user.role)} size="xs" /></p>
                      <p className="mt-0.5 truncate text-xs text-white/45">{t.common.signedInAs} {user.email}</p>
                      <p className="mt-1 text-xs text-accent/80">{userRoleLabel(t, user.role)}</p>
                    </div>
                  </div>
                )}
              </div>
              <nav className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-2" aria-label={t.common.navigation}>
                {links.map((link) => {
                  const active = pathname === link.href;
                  const badgeCount = sidebarBadgeCount(link.href, sidebarCounts, chatUnreadCount);
                  return (
                    <DashboardSidebarNavItem key={link.href} mobile href={link.href} label={link.label} icon={link.icon} active={active} badgeCount={badgeCount} onClick={() => setMobileMenuOpen(false)} ariaLabel={sidebarLinkAriaLabel(link.label, link.href, badgeCount, t)} />
                  );
                })}
                {adminOperationsSections.length > 0 && (
                  <SidebarNavGroup
                    label={t.admin.operations}
                    icon={CalendarDays}
                    sections={adminOperationsSections}
                    open={mobileOperationsMenuOpen}
                    setOpen={setMobileOperationsMenuOpen}
                    pathname={pathname}
                    controlsId="mobile-admin-operations-menu"
                    mobile
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                )}
                {adminUserManagementSections.length > 0 && (
                  <SidebarNavGroup
                    label={t.nav.userManagement}
                    icon={UserRound}
                    sections={adminUserManagementSections}
                    open={mobileUserManagementMenuOpen}
                    setOpen={setMobileUserManagementMenuOpen}
                    pathname={pathname}
                    controlsId="mobile-admin-user-management-menu"
                    mobile
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                )}
                {adminAuditSections.length > 0 && (
                  <SidebarNavGroup
                    label={t.nav.audit}
                    icon={ClipboardList}
                    sections={adminAuditSections}
                    open={mobileAuditMenuOpen}
                    setOpen={setMobileAuditMenuOpen}
                    pathname={pathname}
                    controlsId="mobile-admin-audit-menu"
                    mobile
                    onNavigate={() => setMobileMenuOpen(false)}
                  />
                )}
              </nav>
              <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.025] p-2">
                <MobileSettingsLink
                  link={settingsLink}
                  active={pathname.startsWith(admin ? '/admin/settings' : '/dashboard/settings')}
                  adminSettingsSections={adminSettingsSections}
                  mobileSettingsOpen={mobileSettingsOpen}
                  setMobileSettingsOpen={setMobileSettingsOpen}
                  closeMobileMenu={() => setMobileMenuOpen(false)}
                  t={t}
                />
              </div>
              <div className="mt-3 space-y-3 border-t border-white/10 pt-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/38">{t.common.language}</p>
                  <div className="flex items-center gap-2"><ThemeToggle /><LanguageSwitcher /></div>
                </div>
                <button onClick={logout} disabled={loggingOut} className="flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/76 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-60">{loggingOut ? <Spinner /> : <LogOut size={16} />}{t.common.logout}</button>
              </div>
            </aside>
          </div>
        )}
        <div className={pathname.startsWith('/admin/settings') ? 'px-0 py-0' : 'mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8'}>
          {children}
        </div>
      </main>
      <ConfirmDialog
        open={emailVerificationWarningOpen}
        title={t.security.verifyYourEmail}
        description={t.security.unverifiedEmailWarning}
        confirmLabel={t.security.verifyNow}
        cancelLabel={t.security.later}
        confirmClassName="verification-heartbeat cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-200/45"
        overlayClassName="bg-black/[0.42] backdrop-blur-sm dark:bg-black/[0.72]"
        onConfirm={openEmailVerification}
        onCancel={dismissEmailVerificationWarning}
      />
    </div>
  );
}

function emailVerificationWarningKey(userId: string, sessionId: string) {
  return `pe-email-verification-warning:${userId}:${sessionId}`;
}

function sidebarBadgeCount(href: string, counts: SidebarCounts | null, chatUnreadCount: number) {
  if (href === '/admin/chat' || href === '/dashboard/chat') return chatUnreadCount;
  if (!counts) return 0;
  if (href === '/dashboard/feed') return counts.feed;
  return 0;
}

function sidebarLinkAriaLabel(label: string, href: string, count: number, t: ReturnType<typeof useI18n>['t']) {
  if (count <= 0) return label;
  if (href === '/dashboard/feed') return `${label}, ${t.dashboard.sidebarNewFeedItems(count)}`;
  if (href === '/admin/chat' || href === '/dashboard/chat') return `${label}, ${t.dashboard.sidebarUnreadChatMessages(count)}`;
  return label;
}

function SidebarSettingsLink({
  link,
  active,
  adminSettingsSections,
  settingsMenuOpen,
  setSettingsMenuOpen,
  settingsMenuRef,
  t,
}: {
  link: SidebarLink;
  active: boolean;
  adminSettingsSections: Array<{ href: string; label: string; icon: LucideIcon }>;
  settingsMenuOpen: boolean;
  setSettingsMenuOpen: Dispatch<SetStateAction<boolean>>;
  settingsMenuRef: RefObject<HTMLDivElement | null>;
  t: ReturnType<typeof useI18n>['t'];
}) {
  if (link.settingsMenu && adminSettingsSections.length > 0) {
    return (
      <div ref={settingsMenuRef} className="relative">
        <button
          type="button"
          aria-expanded={settingsMenuOpen}
          aria-controls="admin-settings-menu"
          aria-label={settingsMenuOpen ? t.admin.closeSettingsMenu : t.admin.openSettingsSectionMenu}
          onClick={() => setSettingsMenuOpen((open) => !open)}
          className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'border border-accent/20 bg-accent/15 text-accent shadow-lg shadow-accent/5' : 'border border-transparent text-white/62 hover:border-white/10 hover:bg-white/[0.055] hover:text-white'}`}
        >
          <link.icon size={17} />
          <span className="font-medium">{link.label}</span>
          <ChevronDown size={15} className={`ml-auto transition ${settingsMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {settingsMenuOpen && (
          <div id="admin-settings-menu" role="menu" aria-label={t.admin.settingsSections} className="absolute bottom-full left-2 z-30 mb-2 w-64 rounded-2xl border border-white/10 bg-[#07100d]/98 p-2 shadow-2xl shadow-black/45 backdrop-blur-xl">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/35">{t.admin.settingsSections}</p>
            {adminSettingsSections.map((section) => (
              <Link key={section.href} role="menuitem" href={section.href} onClick={() => setSettingsMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/68 transition hover:bg-white/[0.055] hover:text-white focus:bg-white/[0.055] focus:text-white focus:outline-none">
                <section.icon size={16} />
                <span className="font-medium">{section.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <Link href={link.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'border border-accent/20 bg-accent/15 text-accent shadow-lg shadow-accent/5' : 'border border-transparent text-white/62 hover:border-white/10 hover:bg-white/[0.055] hover:text-white'}`}>
      <link.icon size={17} />
      <span className="min-w-0 flex-1 truncate font-medium">{link.label}</span>
    </Link>
  );
}

function MobileSettingsLink({
  link,
  active,
  adminSettingsSections,
  mobileSettingsOpen,
  setMobileSettingsOpen,
  closeMobileMenu,
  t,
}: {
  link: SidebarLink;
  active: boolean;
  adminSettingsSections: Array<{ href: string; label: string; icon: LucideIcon }>;
  mobileSettingsOpen: boolean;
  setMobileSettingsOpen: Dispatch<SetStateAction<boolean>>;
  closeMobileMenu: () => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  if (link.settingsMenu && adminSettingsSections.length > 0) {
    return (
      <div>
        <button type="button" aria-expanded={mobileSettingsOpen} aria-controls="mobile-admin-settings-menu" onClick={() => setMobileSettingsOpen((open) => !open)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? 'border border-accent/20 bg-accent/15 text-accent' : 'border border-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.055] hover:text-white'}`}>
          <link.icon size={17} />
          <span className="font-medium">{link.label}</span>
          <ChevronDown size={15} className={`ml-auto transition ${mobileSettingsOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileSettingsOpen && (
          <div id="mobile-admin-settings-menu" className="mt-1 space-y-1 rounded-xl border border-white/10 bg-black/20 p-1.5" aria-label={t.admin.settingsSections}>
            {adminSettingsSections.map((section) => (
              <Link key={section.href} href={section.href} onClick={closeMobileMenu} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/62 transition hover:bg-white/[0.055] hover:text-white">
                <section.icon size={16} />
                <span className="font-medium">{section.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <Link href={link.href} onClick={closeMobileMenu} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? 'border border-accent/20 bg-accent/15 text-accent' : 'border border-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.055] hover:text-white'}`}>
      <link.icon size={17} />
      <span className="min-w-0 flex-1 truncate font-medium">{link.label}</span>
    </Link>
  );
}

function showAdminPromotionToastOnce(user: CurrentUser, message: string) {
  if (typeof window === 'undefined') return;
  const scope = user.communityId ?? 'default';
  const roleKey = `pe-community-last-role:${scope}:${user.id}`;
  const normalizedRole = user.role.toLowerCase();
  try {
    const previousRole = window.localStorage.getItem(roleKey)?.toLowerCase();
    if (previousRole && previousRole !== 'admin' && previousRole !== 'owner' && normalizedRole === 'admin') {
      const seenKey = `pe-community-admin-promotion-seen:${scope}:${user.id}:${previousRole}:admin`;
      if (!window.sessionStorage.getItem(seenKey)) {
        toast.success(`🎉 ${message} 🎉`, { id: `admin-promotion-${scope}-${user.id}` });
        window.sessionStorage.setItem(seenKey, 'true');
      }
    }
    window.localStorage.setItem(roleKey, normalizedRole);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function AdminNotificationMenu({ id, notifications, loading, unreadCount, t, onDismiss, onOpen }: { id: string; notifications: AdminNotificationItem[]; loading: boolean; unreadCount: number; t: ReturnType<typeof useI18n>['t']; onDismiss: (id: string) => void; onOpen: (notification: AdminNotificationItem) => void }) {
  return (
    <div id={id} className="absolute right-0 top-full z-40 mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-emerald-300/15 bg-[#07100d]/85 shadow-2xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-2xl" role="dialog" aria-label={t.admin.adminNotifications}>
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.025] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{t.admin.adminNotifications}</p>
          {unreadCount > 0 && <p className="mt-1 text-xs text-white/45">{t.admin.unreadAdminNotifications(unreadCount)}</p>}
        </div>
      </div>
      {loading && notifications.length === 0 ? (
        <div className="flex justify-center px-4 py-5 text-white/50"><Spinner /></div>
      ) : notifications.length === 0 ? (
        <p className="px-4 py-5 text-sm text-white/50">{t.admin.noAdminNotifications}</p>
      ) : (
        <div className="max-h-[min(24rem,calc(100vh-12rem))] space-y-2.5 overflow-y-auto p-2.5">
          {notifications.map((notification) => {
            const unread = !notification.readAt;
            const target = adminNotificationTarget(notification);
            const clickable = Boolean(target);
            function openFromKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
              if (!clickable || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              onOpen(notification);
            }
            return (
              <div
                key={notification.id}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onOpen(notification) : undefined}
                onKeyDown={openFromKeyboard}
                className={`group rounded-xl border px-3.5 py-3.5 text-left transition ${clickable ? 'cursor-pointer hover:border-accent/35 hover:bg-accent/10 focus:border-accent/35 focus:bg-accent/10 focus:outline-none' : ''} ${unread ? 'border-accent/20 bg-accent/10' : 'border-white/10 bg-white/[0.04]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{adminNotificationTitle(notification, t)}</p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/64">{adminNotificationBody(notification, t)}</p>
                    {notification.createdAt && <p className="mt-2.5 text-[11px] font-medium text-white/38">{formatNotificationTime(notification.createdAt)}</p>}
                  </div>
                  {unread && (
                    <button type="button" onClick={(event) => { event.stopPropagation(); onDismiss(notification.id); }} className="shrink-0 rounded-full border border-white/10 bg-black/20 p-1.5 text-white/45 opacity-0 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent/35 group-hover:opacity-100" aria-label={t.admin.dismissNotification}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberNotificationMenu({ id, notifications, loading, unreadCount, t, onDismiss, onOpen }: { id: string; notifications: MemberNotificationItem[]; loading: boolean; unreadCount: number; t: ReturnType<typeof useI18n>['t']; onDismiss: (id: string) => void; onOpen: (notification: MemberNotificationItem) => void }) {
  return (
    <div id={id} className="absolute right-0 top-full z-40 mt-2 w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-emerald-300/15 bg-[#07100d]/85 shadow-2xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-2xl" role="dialog" aria-label={t.nav.notifications}>
      <div className="border-b border-white/10 bg-white/[0.025] px-4 py-3">
        <p className="text-sm font-semibold text-white">{t.nav.notifications}</p>
        {unreadCount > 0 && <p className="mt-1 text-xs text-white/45">{t.dashboard.notificationsDescription(unreadCount)}</p>}
      </div>
      {loading && notifications.length === 0 ? (
        <div className="flex justify-center px-4 py-5 text-white/50"><Spinner /></div>
      ) : notifications.length === 0 ? (
        <p className="px-4 py-5 text-sm text-white/50">{t.dashboard.noNotifications}</p>
      ) : (
        <div className="max-h-[min(24rem,calc(100vh-12rem))] space-y-2.5 overflow-y-auto p-2.5">
          {notifications.map((notification) => {
            const clickable = Boolean(memberNotificationHref(notification));
            function openFromKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
              if (!clickable || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              onOpen(notification);
            }
            return (
              <div
                key={notification.id}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onOpen(notification) : undefined}
                onKeyDown={openFromKeyboard}
                className={`group rounded-xl border border-accent/20 bg-accent/10 px-3.5 py-3.5 text-left transition ${clickable ? 'cursor-pointer hover:border-accent/35 hover:bg-accent/[0.14] focus:border-accent/35 focus:bg-accent/[0.14] focus:outline-none' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{t.dashboard.notificationTypeLabel(notification.type ?? '')}</p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/64">{notification.body}</p>
                    {notification.createdAt && <p className="mt-2.5 text-[11px] font-medium text-white/38">{formatNotificationTime(notification.createdAt)}</p>}
                  </div>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void onDismiss(notification.id); }} className="shrink-0 rounded-full border border-white/10 bg-black/20 p-1.5 text-white/45 opacity-0 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent/35 group-hover:opacity-100" aria-label={t.dashboard.markAsRead} title={t.dashboard.markAsRead}>
                    <X size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function adminNotificationTitle(notification: AdminNotificationItem, t: ReturnType<typeof useI18n>['t']) {
  if (notification.type === 'REGISTRATION_SUBMITTED') return t.admin.registrationSubmittedNotificationTitle;
  return notification.title;
}

function adminNotificationBody(notification: AdminNotificationItem, t: ReturnType<typeof useI18n>['t']) {
  if (notification.type === 'REGISTRATION_SUBMITTED') return t.admin.registrationSubmittedNotificationBody;
  return notification.body;
}

function adminNotificationTarget(notification: AdminNotificationItem) {
  if (notification.type === 'REGISTRATION_SUBMITTED') return '/admin/registrations';
  const actionUrl = notification.metadata?.actionUrl;
  if (typeof actionUrl === 'string' && actionUrl.startsWith('/') && !actionUrl.startsWith('//')) return actionUrl;
  const taskHref = taskNotificationHref(notification, true);
  if (taskHref) return taskHref;
  return null;
}
