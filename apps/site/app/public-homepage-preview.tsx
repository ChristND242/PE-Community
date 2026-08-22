'use client';

import type { KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import { AdminDashboardView } from '../components/admin-dashboard-view';
import type { AdminDashboardViewModel } from '../components/admin-dashboard-view';
import { MemberDashboardView } from '../components/member-dashboard-view';
import type { MemberDashboardActivityTab, MemberDashboardViewModel } from '../components/member-dashboard-view';
import { WorkspacePreviewShell } from '../components/marketing/workspace-preview-shell';
import type { PreviewLanguage } from '../components/marketing/workspace-preview-shell';
import { ShineBorder } from '../components/marketing/shine-border';
import { MarketingSectionIntro, WorkspaceIntroAside } from '../components/marketing/marketing-section-intro';
import { WorkspacePreviewMotion } from '../components/marketing/motion/workspace-preview-motion';
import type { ShellCurrentUser } from '../components/dashboard-shell-presentation';
import { useI18n } from '../lib/i18n';

type PreviewWorkspace = 'admin' | 'member';

const adminViewer: ShellCurrentUser = {
  id: 'preview-admin',
  email: 'admin@example.org',
  name: 'Operations Lead',
  role: 'OWNER',
};

const memberViewer: ShellCurrentUser = {
  id: 'preview-member',
  email: 'member@example.org',
  name: 'Alex Morgan',
  role: 'MEMBER',
};

const adminPreviewData: AdminDashboardViewModel = {
  metrics: {
    totalMembers: 128,
    activeMembers: 119,
    suspendedMembers: 2,
    pendingRegistrations: 7,
    recentRsvps: 36,
    announcements: 5,
    upcomingEvents: 4,
    recentAdminActions: 18,
  },
  charts: {
    membersByStatus: [{ label: 'ACTIVE', value: 119 }, { label: 'SUSPENDED', value: 2 }, { label: 'PENDING', value: 7 }],
    registrationPipeline: [{ label: 'APPROVED', value: 21 }, { label: 'PENDING', value: 7 }, { label: 'REJECTED', value: 3 }],
    eventRsvps: [{ label: 'Going', value: 36 }, { label: 'Maybe', value: 12 }, { label: 'Declined', value: 4 }],
    recentAdminActivity: [{ label: 'registration.approved', value: 7 }, { label: 'announcement.published', value: 5 }, { label: 'settings.security.updated', value: 3 }],
  },
  recentActivity: [
    { id: 'activity-1', action: 'registration.approved', targetType: 'Registration', createdAt: '2026-07-22T09:30:00.000Z' },
    { id: 'activity-2', action: 'announcement.published', targetType: 'Announcement', createdAt: '2026-07-21T14:15:00.000Z' },
    { id: 'activity-3', action: 'event.created', targetType: 'Event', createdAt: '2026-07-20T11:00:00.000Z' },
    { id: 'activity-4', action: 'settings.security.updated', targetType: 'CommunitySettings', createdAt: '2026-07-19T08:45:00.000Z' },
  ],
};

const memberPreviewData: MemberDashboardViewModel = {
  referenceTime: '2026-07-23T00:00:00.000Z',
  user: { id: memberViewer.id, email: memberViewer.email, name: memberViewer.name, communityId: 'preview-community', role: memberViewer.role },
  profile: {
    user: { name: memberViewer.name, email: memberViewer.email },
    profile: {
      title: 'Community member',
      avatarUrl: null,
      dicebearStyle: 'initials',
      dicebearSeed: 'Alex Morgan',
      bio: 'Community operations volunteer',
      location: 'Toronto',
      interests: ['Community building'],
      skills: ['Event coordination'],
      socialLinks: {},
    },
    streakBoard: {
      currentStreak: 6,
      longestStreak: 14,
      activeToday: true,
      rank: 4,
      totalRankedUsers: 48,
      leader: { userId: 'preview-leader', displayName: 'Community Leader', currentStreak: 18, longestStreak: 24 },
    },
  },
  feed: {
    announcements: [
      { id: 'announcement-1', title: 'July community update', body: 'Program updates and upcoming opportunities for community members.', publishedAt: '2026-07-21T10:00:00.000Z' },
      { id: 'announcement-2', title: 'Volunteer orientation', body: 'Orientation details for members supporting the next community event.', publishedAt: '2026-07-18T12:00:00.000Z' },
      { id: 'announcement-3', title: 'Member directory refresh', body: 'Review your member profile and keep your contact details current.', publishedAt: '2026-07-15T09:00:00.000Z' },
      { id: 'announcement-4', title: 'Community survey', body: 'Share feedback about this season’s member programs.', publishedAt: '2026-07-12T16:00:00.000Z' },
      { id: 'announcement-5', title: 'Workshop resources', body: 'Resources from the latest community workshop are now available.', publishedAt: '2026-07-10T08:00:00.000Z' },
    ],
  },
  events: {
    events: [
      { id: 'event-1', title: 'Community leadership forum', startsAt: '2026-08-14T17:00:00.000Z', location: 'Community Hall', myRsvp: 'GOING' },
      { id: 'event-2', title: 'Member planning session', startsAt: '2026-08-22T15:00:00.000Z', location: 'Online', onlineUrl: 'preview-only', myRsvp: 'GOING' },
      { id: 'event-3', title: 'Volunteer orientation', startsAt: '2026-09-05T13:00:00.000Z', location: 'Training Room', myRsvp: 'MAYBE' },
    ],
  },
  notifications: { notifications: Array.from({ length: 9 }, (_, index) => ({ id: `notification-${index + 1}`, readAt: index > 8 ? '2026-07-20T08:00:00.000Z' : null })) },
  assignedEventTasks: {
    assignedEventTasks: [
      { id: 'task-1', eventId: 'event-1', eventTitle: 'Community leadership forum', title: 'Confirm speaker schedule', status: 'IN_PROGRESS', priority: 'MEDIUM', dueDate: '2026-08-08T12:00:00.000Z' },
      { id: 'task-2', eventId: 'event-3', eventTitle: 'Volunteer orientation', title: 'Prepare welcome materials', status: 'TODO', priority: 'LOW', dueDate: '2026-08-29T12:00:00.000Z' },
    ],
  },
};

export function DashboardPreviewSection() {
  const { lang, t } = useI18n();
  const [workspace, setWorkspace] = useState<PreviewWorkspace>('admin');
  const [previewLanguage, setPreviewLanguage] = useState<PreviewLanguage>(lang);
  const [memberActivityTab, setMemberActivityTab] = useState<MemberDashboardActivityTab>('announcements');
  const adminTabRef = useRef<HTMLButtonElement>(null);
  const memberTabRef = useRef<HTMLButtonElement>(null);
  const preview = t.landing.preview;

  function selectWorkspace(nextWorkspace: PreviewWorkspace, focus = false) {
    setWorkspace(nextWorkspace);
    if (focus) (nextWorkspace === 'admin' ? adminTabRef.current : memberTabRef.current)?.focus();
  }

  function handleWorkspaceKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentWorkspace: PreviewWorkspace) {
    let nextWorkspace: PreviewWorkspace | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') nextWorkspace = currentWorkspace === 'admin' ? 'member' : 'admin';
    if (event.key === 'Home') nextWorkspace = 'admin';
    if (event.key === 'End') nextWorkspace = 'member';
    if (!nextWorkspace) return;
    event.preventDefault();
    selectWorkspace(nextWorkspace, true);
  }

  return (
    <section id="product-preview" aria-labelledby="workspace-preview-title" className="relative overflow-hidden px-5 py-20 md:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-[1400px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-24 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-accent/[0.045] blur-3xl" />
      <div className="relative mx-auto max-w-[1400px]">
        <MarketingSectionIntro
          aside={<WorkspaceIntroAside items={preview.workspaces} />}
          description={preview.description}
          eyebrow={preview.eyebrow}
          headingId="workspace-preview-title"
          titleLines={preview.titleLines}
        />

        <div className="mt-6 flex justify-end">
          <div className="site-workspace-toggle inline-flex w-fit rounded-full border border-white/10 bg-black/25 p-1" role="tablist" aria-label={preview.switchLabel}>
            {(['admin', 'member'] as const).map((item) => <button key={item} ref={item === 'admin' ? adminTabRef : memberTabRef} id={`workspace-preview-tab-${item}`} type="button" role="tab" aria-selected={workspace === item} aria-controls={`workspace-preview-panel-${item}`} tabIndex={workspace === item ? 0 : -1} onClick={() => selectWorkspace(item)} onKeyDown={(event) => handleWorkspaceKeyDown(event, item)} className={`site-workspace-toggle-item cursor-pointer rounded-full border px-4 py-2 text-sm font-bold transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b0a] ${workspace === item ? 'border-accent/35 bg-accent/15 text-accent' : 'border-transparent text-white/58 hover:bg-white/[0.04] hover:text-white'}`}>{item === 'admin' ? preview.adminTab : preview.memberTab}</button>)}
          </div>
        </div>

        <WorkspacePreviewMotion>
          <ShineBorder borderRadiusClassName="rounded-[2rem]" className="site-workspace-frame mt-6 shadow-[0_35px_100px_rgba(0,0,0,0.45)]" contentClassName="site-workspace-preview bg-white/[0.025]">
            <div className="site-preview-topbar flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">{preview.switchLabel}</p><div className="flex items-center gap-2"><span className="text-xs font-medium text-white/42">{preview.label}</span><span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">{workspace === 'admin' ? preview.adminTab : preview.memberTab}</span></div></div>
            <div key={workspace} id={`workspace-preview-panel-${workspace}`} role="tabpanel" aria-labelledby={`workspace-preview-tab-${workspace}`} tabIndex={0} className="preview-workspace-panel outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/45">
              {workspace === 'admin' ? (
                <WorkspacePreviewShell workspace="admin" viewer={adminViewer} notificationCount={3} feedUnreadCount={0} chatUnreadCount={4} language={previewLanguage} onLanguageChange={setPreviewLanguage}><AdminDashboardView data={adminPreviewData} locale={previewLanguage} timeZone="UTC" presentation="marketing-preview" /></WorkspacePreviewShell>
              ) : (
                <WorkspacePreviewShell workspace="member" viewer={memberViewer} notificationCount={9} feedUnreadCount={2} chatUnreadCount={5} language={previewLanguage} onLanguageChange={setPreviewLanguage}><MemberDashboardView data={memberPreviewData} activeActivityTab={memberActivityTab} onActivityTabChange={setMemberActivityTab} mode="marketing-preview" locale={previewLanguage} timeZone="UTC" /></WorkspacePreviewShell>
              )}
            </div>
          </ShineBorder>
        </WorkspacePreviewMotion>
      </div>
      <style jsx>{`.preview-workspace-panel{animation:preview-workspace-enter 220ms ease-out}@keyframes preview-workspace-enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){.preview-workspace-panel{animation:none}}`}</style>
    </section>
  );
}
