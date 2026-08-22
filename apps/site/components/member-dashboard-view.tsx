'use client';

import { Award, CalendarDays, ChevronRight, Crown, Flame, TrendingUp, Trophy, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { ProfilePhoto } from './profile-photo';
import { Card, StatusBadge, TableEmptyState } from './ui';
import { statusLabel, useI18n } from '../lib/i18n';
import { userRoleLabel } from '../lib/user-role';
import { formatDashboardDate } from '../lib/utils';
import { eventTaskDueState } from '../lib/event-task-due';

export type DashboardRuntimeMode = 'application' | 'marketing-preview';
export type MemberDashboardActivityTab = 'announcements' | 'events' | 'rsvps';
export type MemberDashboardUser = { id: string; email: string; name: string; communityId: string; role: string };
export type MemberDashboardStreakBoard = {
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  rank: number | null;
  totalRankedUsers: number;
  leader: { userId: string; displayName: string; avatarUrl?: string | null; currentStreak: number; longestStreak: number } | null;
};
export type MemberDashboardProfile = {
  user: { name: string; email: string };
  profile?: {
    title?: string | null;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
    bio?: string | null;
    location?: string | null;
    interests?: string[];
    skills?: string[];
    socialLinks?: Record<string, string>;
  } | null;
  streakBoard: MemberDashboardStreakBoard;
};
export type MemberDashboardEvent = { id: string; title: string; startsAt: string; location: string; onlineUrl?: string | null; capacity?: number | null; rsvpCounts?: { going: number; maybe: number; declined: number }; myRsvp?: string | null };
export type MemberDashboardFeed = { announcements: { id: string; title: string; body: string; publishedAt: string }[] };
export type MemberDashboardNotifications = { notifications: { id: string; type?: string; metadata?: { eventId?: string; taskId?: string; kind?: string } | null; readAt?: string | null }[] };
export type MemberDashboardAssignedTask = { id: string; eventId: string; eventTitle: string; title: string; status: 'TODO' | 'IN_PROGRESS' | 'DONE'; priority: 'LOW' | 'MEDIUM' | 'HIGH'; dueDate?: string | null };

export type MemberDashboardViewModel = {
  referenceTime: string;
  user: MemberDashboardUser;
  profile: MemberDashboardProfile;
  feed: MemberDashboardFeed;
  events: { events: MemberDashboardEvent[] };
  notifications: MemberDashboardNotifications;
  assignedEventTasks: { assignedEventTasks: MemberDashboardAssignedTask[] };
};

export function MemberDashboardView({
  data,
  activeActivityTab,
  onActivityTabChange,
  mode = 'application',
  locale,
  timeZone,
}: {
  data: MemberDashboardViewModel;
  activeActivityTab: MemberDashboardActivityTab;
  onActivityTabChange: (tab: MemberDashboardActivityTab) => void;
  mode?: DashboardRuntimeMode;
  locale?: 'en' | 'fr';
  timeZone?: string;
}) {
  const { lang, t, timezone } = useI18n();
  const { user, profile, feed, events, notifications, assignedEventTasks } = data;
  const upcomingEvents = useMemo(() => {
    const referenceTime = new Date(data.referenceTime).getTime();
    return events.events.filter((event) => new Date(event.startsAt).getTime() >= referenceTime);
  }, [data.referenceTime, events.events]);
  const confirmedRsvps = useMemo(() => events.events.filter((event) => event.myRsvp === 'GOING').length, [events.events]);
  const unreadNotifications = useMemo(() => notifications.notifications.filter((notification) => !notification.readAt).length, [notifications.notifications]);
  const completion = memberProfileCompletion(profile);
  const dashboardLocale = (locale ?? lang) === 'fr' ? 'fr-FR' : 'en-US';
  const dashboardTimeZone = timeZone ?? timezone;

  return (
    <div className="space-y-6">
      <MemberDashboardHeader email={user.email} />

      <section className="site-dark-accent-panel site-member-preview-hero relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(94,210,156,0.22),transparent_34%),linear-gradient(135deg,rgba(8,13,12,0.96),rgba(6,78,59,0.42)_58%,rgba(4,12,11,0.96))] p-6 shadow-2xl shadow-black/25">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.74fr)] lg:items-center">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <ProfilePhoto name={user.name} avatarUrl={profile.profile?.avatarUrl} dicebearStyle={profile.profile?.dicebearStyle} dicebearSeed={profile.profile?.dicebearSeed} size="lg" className="h-20 w-20 border-2 border-white/15 shadow-2xl shadow-black/25" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-100/80">{t.dashboard.welcomeTitle}</p>
                <h2 className="mt-1 truncate text-3xl font-semibold tracking-tight text-white md:text-4xl">{user.name}</h2>
                <p className="mt-1 text-sm text-white/58">{profile.profile?.title || t.dashboard.memberRole(userRoleLabel(t, user.role))}</p>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-white/68">{t.dashboard.welcomeSubtitle}</p>
            <DashboardViewLink mode={mode} href="/dashboard/profile" className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-semibold text-white transition hover:border-accent/35 hover:bg-accent/10 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/30">
              {t.nav.profile}<ChevronRight size={16} />
            </DashboardViewLink>
          </div>
          <div className="grid gap-0 border-t border-white/10 pt-5 sm:grid-cols-3 sm:border-t-0 sm:pt-0 lg:min-w-[360px]">
            <HeroMetric className="sm:pr-5" label={t.dashboard.profileCompletion} value={`${completion}%`} caption={completion >= 80 ? t.dashboard.profileCompletionStrong : t.dashboard.profileCompletionInsight(completion)} />
            <HeroMetric className="border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:px-5 sm:pt-0" label={t.dashboard.unreadNotificationsLabel} value={unreadNotifications} caption={t.dashboard.notificationsDescription(unreadNotifications)} />
            <HeroMetric className="border-t border-white/10 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" label={t.dashboard.goingCount} value={confirmedRsvps} caption={t.dashboard.activityConfirmedRsvpsCaption} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <ActivityTabs activeTab={activeActivityTab} onChange={onActivityTabChange} announcements={feed.announcements} upcomingEvents={upcomingEvents} confirmedRsvps={confirmedRsvps} mode={mode} t={t} />
        <ProfileCompletionCard completion={completion} mode={mode} t={t} />
      </div>

      <StreakBoardCard board={profile.streakBoard} t={t} />

      <Card id="assigned-event-tasks" className="scroll-mt-6 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.026))]">
        <SectionHeader title={t.dashboard.assignedEventTasks} description={t.dashboard.assignedEventTasksDescription} href="/dashboard/events" cta={t.dashboard.viewEvents} mode={mode} />
        {assignedEventTasks.assignedEventTasks.length ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {assignedEventTasks.assignedEventTasks.map((task) => {
              const dueState = eventTaskDueState(task.dueDate, task.status);
              return (
                <DashboardViewLink key={task.id} mode={mode} href={`/dashboard/events/${task.eventId}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3.5 transition hover:border-accent/25 hover:bg-accent/[0.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/25">
                  <span title={eventTaskPriorityName(t, task.priority)} aria-label={eventTaskPriorityName(t, task.priority)} className={`h-2.5 w-2.5 shrink-0 rounded-full ${eventTaskPriorityTone(task.priority)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{task.title}</p>
                    <p className="mt-1 truncate text-xs text-white/42">{task.eventTitle}</p>
                    {task.dueDate && <div className="mt-1.5 flex flex-wrap items-center gap-2"><p className={`flex items-center gap-1.5 text-[11px] ${dueState === 'overdue' ? 'text-rose-200/85' : dueState === 'due-soon' ? 'text-amber-200/85' : 'text-white/45'}`}><CalendarDays size={12} />{t.dashboard.eventTaskDue} {formatAssignedTaskDate(task.dueDate, dashboardLocale)}</p>{dueState && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dueState === 'overdue' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>{dueState === 'overdue' ? t.common.overdue : t.common.dueSoon}</span>}</div>}
                  </div>
                  <StatusBadge tone={task.status === 'DONE' ? 'good' : task.status === 'IN_PROGRESS' ? 'warn' : 'neutral'}>{eventTaskStatusName(t, task.status)}</StatusBadge>
                </DashboardViewLink>
              );
            })}
          </div>
        ) : <div className="mt-5"><TableEmptyState title={t.dashboard.noAssignedEventTasks} description={t.dashboard.noAssignedEventTasksDescription} /></div>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.026))]">
          <SectionHeader title={t.dashboard.latestUpdates} description={t.dashboard.latestUpdatesDescription} href="/dashboard/feed" cta={t.nav.feed} mode={mode} />
          {feed.announcements.length ? (
            <div className="mt-5 space-y-3">
              {feed.announcements.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-white/15 hover:bg-black/25">
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{item.body}</p>
                  <p className="mt-3 text-xs text-white/40">{t.dashboard.published} {formatDashboardDate(item.publishedAt, dashboardLocale, dashboardTimeZone)}</p>
                </article>
              ))}
            </div>
          ) : <div className="mt-5"><TableEmptyState title={t.dashboard.noAnnouncements} description={t.dashboard.noAnnouncementsDescription} /></div>}
        </Card>

        <Card className="rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.026))]">
          <SectionHeader title={t.dashboard.upcomingEvents} description={t.dashboard.upcomingEventsDescription} href="/dashboard/events" cta={t.nav.events} mode={mode} />
          {upcomingEvents.length ? (
            <div className="mt-5 space-y-3">
              {upcomingEvents.slice(0, 3).map((event) => (
                <article key={event.id} className="rounded-xl border border-white/10 bg-black/20 p-4 transition hover:border-white/15 hover:bg-black/25">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{event.title}</p>
                      <p className="mt-2 text-sm text-white/55">{formatDashboardDate(event.startsAt, dashboardLocale, dashboardTimeZone)}</p>
                      <p className="mt-1 truncate text-xs text-white/42">{event.onlineUrl ? t.dashboard.onlineEvent : event.location}</p>
                    </div>
                    <StatusBadge tone={event.myRsvp === 'GOING' ? 'good' : event.myRsvp === 'MAYBE' ? 'warn' : 'neutral'}>{event.myRsvp ? statusLabel(t, event.myRsvp) : t.dashboard.rsvp}</StatusBadge>
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="mt-5"><TableEmptyState title={t.dashboard.noUpcomingEvents} description={t.dashboard.noUpcomingEventsDescription} /></div>}
        </Card>
      </div>
    </div>
  );
}

export function MemberDashboardHeader({ email }: { email?: string }) {
  const { t } = useI18n();
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{t.dashboard.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">{t.dashboard.subtitle}</p></div>
      {email && <p className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/55">{email}</p>}
    </header>
  );
}

function DashboardViewLink({ mode, href, className, children }: { mode: DashboardRuntimeMode; href: string; className: string; children: React.ReactNode }) {
  if (mode === 'marketing-preview') return <button type="button" className={`${className} cursor-default text-left`} aria-disabled="true">{children}</button>;
  return <Link href={href} className={className}>{children}</Link>;
}

function SectionHeader({ title, description, href, cta, mode }: { title: string; description: string; href: string; cta: string; mode: DashboardRuntimeMode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div><h2 className="text-base font-semibold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-white/48">{description}</p></div>
      <DashboardViewLink mode={mode} href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent transition hover:text-[#74e4b1]">{cta}<ChevronRight size={16} /></DashboardViewLink>
    </div>
  );
}

function HeroMetric({ label, value, caption, className = '' }: { label: string; value: number | string; caption: string; className?: string }) {
  return <div className={className}><p className="text-sm font-medium text-white/58">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{value}</p><p className="mt-2 text-sm leading-5 text-white/52">{caption}</p></div>;
}

function StreakBoardCard({ board, t }: { board: MemberDashboardStreakBoard; t: ReturnType<typeof useI18n>['t'] }) {
  const items = [
    { key: 'streak', title: t.dashboard.yourStreak, value: t.dashboard.streakDays(board.currentStreak), caption: t.dashboard.keepStreakAlive, Icon: Flame, iconTone: 'border-orange-300/20 bg-orange-300/10 text-orange-200', valueTone: 'text-orange-100' },
    { key: 'rank', title: t.dashboard.yourRank, value: board.rank ? `#${board.rank}` : '—', caption: t.dashboard.activeUsersRank(board.totalRankedUsers), Icon: Trophy, iconTone: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200', valueTone: 'text-cyan-100' },
    { key: 'leader', title: t.dashboard.currentLeader, value: board.leader ? t.dashboard.streakDays(board.leader.currentStreak) : '—', caption: board.leader?.displayName ?? t.dashboard.noStreakLeader, Icon: Crown, iconTone: 'border-amber-300/25 bg-amber-300/10 text-amber-200', valueTone: 'text-amber-100' },
    { key: 'best', title: t.dashboard.bestStreak, value: t.dashboard.streakDays(board.longestStreak), caption: t.dashboard.allTimeBestStreak, Icon: Award, iconTone: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200', valueTone: 'text-emerald-100' },
  ];
  return (
    <section className="site-dark-accent-panel site-member-preview-streak relative overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.14),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(6,78,59,0.42))] shadow-2xl shadow-black/20">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="relative border-b border-white/10 px-6 py-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{t.dashboard.communityStreakBoard}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-white/58">{t.dashboard.communityStreakBoardSubtitle}</p></div><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${board.activeToday ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'}`}><Flame className="h-3.5 w-3.5" aria-hidden="true" />{board.activeToday ? t.dashboard.streakActiveToday : t.dashboard.streakStartToday}</span></div></div>
      <div className="relative grid md:grid-cols-2 xl:grid-cols-4">{items.map((item) => <div key={item.key} className={`group relative min-h-[190px] overflow-hidden border-b border-white/10 p-6 transition-colors duration-300 last:border-b-0 hover:bg-white/[0.04] md:odd:border-r md:[&:nth-child(n+3)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0 ${item.key === 'leader' ? 'bg-amber-200/[0.025]' : ''}`}>{item.key === 'leader' && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />}<span className={`absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg shadow-black/10 transition duration-300 motion-safe:group-hover:scale-105 ${item.iconTone}`}><item.Icon className="h-5 w-5" aria-hidden="true" /></span><div className="relative flex min-h-[142px] flex-col pr-12"><p className="max-w-[9rem] text-sm font-semibold text-white/58">{item.title}</p><p className={`mt-7 text-4xl font-semibold tabular-nums ${item.valueTone}`}>{item.value}</p><p className="mt-auto pt-4 text-sm leading-6 text-white/55">{item.caption}</p></div></div>)}</div>
    </section>
  );
}

function ActivityTabs({ activeTab, onChange, announcements, upcomingEvents, confirmedRsvps, mode, t }: { activeTab: MemberDashboardActivityTab; onChange: (tab: MemberDashboardActivityTab) => void; announcements: MemberDashboardFeed['announcements']; upcomingEvents: MemberDashboardEvent[]; confirmedRsvps: number; mode: DashboardRuntimeMode; t: ReturnType<typeof useI18n>['t'] }) {
  const tabs: { value: MemberDashboardActivityTab; label: string }[] = [{ value: 'announcements', label: t.dashboard.announcementCount }, { value: 'events', label: t.dashboard.eventCount }, { value: 'rsvps', label: t.dashboard.goingCount }];
  const content = {
    announcements: { value: announcements.length, content: t.dashboard.activityAnnouncementsContent, summary: t.dashboard.activityAnnouncementsSummary, href: '/dashboard/feed', cta: t.dashboard.viewFeed },
    events: { value: upcomingEvents.length, content: t.dashboard.activityEventsContent, summary: t.dashboard.activityEventsSummary, href: '/dashboard/events', cta: t.dashboard.viewEvents },
    rsvps: { value: confirmedRsvps, content: t.dashboard.activityConfirmedRsvpsCaption, summary: t.dashboard.activityConfirmedReservationsSummary, href: '/dashboard/events', cta: t.dashboard.viewEvents },
  }[activeTab];
  return (
    <section className="w-full rounded-[1.5rem] border border-white/10 bg-white/[0.04] shadow-xl shadow-black/10">
      <div className="border-b border-white/10"><div role="tablist" aria-label={t.dashboard.activityTabsLabel} className="grid grid-cols-3 px-4 sm:px-6">{tabs.map((tab) => { const active = activeTab === tab.value; return <button key={tab.value} type="button" role="tab" aria-selected={active} onClick={() => onChange(tab.value)} className={`relative -mb-px flex items-center justify-center px-2 py-4 text-center text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40 sm:px-3 sm:text-sm ${active ? 'text-white after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:rounded-full after:bg-emerald-300 sm:after:left-6 sm:after:right-6' : 'text-white/45 hover:text-white/75'}`}>{tab.label}</button>; })}</div></div>
      <div role="tabpanel" className="px-6 py-6"><div className="grid min-h-[220px] gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><div className="flex min-h-[220px] flex-col"><p className="max-w-xl text-sm leading-6 text-white/65">{content.content}</p><div className="mt-8"><p className="text-6xl font-semibold leading-none tracking-[-0.06em] text-white sm:text-7xl">{content.value}</p><p className="mt-3 max-w-sm text-sm font-medium leading-6 text-white/80">{content.summary}</p></div><DashboardViewLink mode={mode} href={content.href} className="mt-auto inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-emerald-300/35 hover:bg-emerald-400/10 hover:text-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40">{content.cta}<ChevronRight size={15} /></DashboardViewLink></div><div className="hidden min-w-[160px] text-right md:block"><p className="text-[7.5rem] font-semibold leading-none tracking-[-0.08em] text-emerald-300/10">{content.value}</p></div></div></div>
    </section>
  );
}

function ProfileCompletionCard({ completion, mode, t }: { completion: number; mode: DashboardRuntimeMode; t: ReturnType<typeof useI18n>['t'] }) {
  const safeCompletion = clampPercentage(completion);
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.11),transparent_46%),rgba(255,255,255,0.045)] p-6 shadow-xl shadow-black/10"><div className="flex h-full flex-col items-center"><div className="w-full"><h2 className="text-lg font-semibold text-white">{t.dashboard.profileCompletion}</h2><p className="mt-1 text-sm leading-6 text-white/55">{t.dashboard.profileCompletionHelper}</p></div><ProfileCompletionCircle value={safeCompletion} label={t.dashboard.profileCompletion} /><div className="mt-8 w-full space-y-4"><div className="flex items-center justify-between gap-4 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/45"><span className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />{t.dashboard.progress}</span><span>{t.dashboard.target100}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-300 transition-all duration-700" style={{ width: `${safeCompletion}%` }} /></div><DashboardViewLink mode={mode} href="/dashboard/profile" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-4 text-sm font-semibold text-white/85 transition hover:border-emerald-300/35 hover:bg-emerald-400/10 hover:text-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40">{t.dashboard.completeProfile}<ChevronRight size={15} /></DashboardViewLink></div></div></section>
  );
}

function ProfileCompletionCircle({ value, label }: { value: number; label: string }) {
  const safeValue = clampPercentage(value); const size = 180; const strokeWidth = 10; const radius = (size - strokeWidth) / 2; const circumference = 2 * Math.PI * radius; const offset = circumference - (safeValue / 100) * circumference; const progressTone = safeValue >= 85 ? 'text-emerald-300' : safeValue >= 40 ? 'text-cyan-300' : 'text-rose-300';
  return <div className="relative mt-8 flex h-[180px] w-[180px] items-center justify-center"><svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={8} strokeDasharray="8 15" className="text-white/10" /><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className={`${progressTone} transition-[stroke-dashoffset] duration-700 ease-out`} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center text-center"><UserCheck className={`h-6 w-6 ${progressTone}`} /><div className="mt-2 flex items-baseline"><span className={`text-4xl font-semibold tabular-nums tracking-tight ${progressTone}`}>{safeValue}</span><span className={`ml-0.5 text-base font-semibold ${progressTone}`}>%</span></div><span className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</span></div></div>;
}

function eventTaskStatusName(t: ReturnType<typeof useI18n>['t'], status: MemberDashboardAssignedTask['status']) { if (status === 'TODO') return t.dashboard.eventTaskTodo; if (status === 'IN_PROGRESS') return t.dashboard.eventTaskInProgress; return t.dashboard.eventTaskDone; }
function eventTaskPriorityName(t: ReturnType<typeof useI18n>['t'], priority: MemberDashboardAssignedTask['priority']) { if (priority === 'LOW') return t.dashboard.eventTaskLow; if (priority === 'HIGH') return t.dashboard.eventTaskHigh; return t.dashboard.eventTaskMedium; }
function eventTaskPriorityTone(priority: MemberDashboardAssignedTask['priority']) { if (priority === 'HIGH') return 'bg-rose-300'; if (priority === 'MEDIUM') return 'bg-amber-300'; return 'bg-emerald-300'; }
function formatAssignedTaskDate(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)); }
function clampPercentage(value: number) { return Math.min(100, Math.max(0, Math.round(value || 0))); }
export function memberProfileCompletion(profile: MemberDashboardProfile) { const fields = [profile.user.name, profile.profile?.title, profile.profile?.avatarUrl, profile.profile?.bio, profile.profile?.location, ...(profile.profile?.interests ?? []), ...(profile.profile?.skills ?? []), ...Object.values(profile.profile?.socialLinks ?? {})]; return Math.round((fields.filter((value) => typeof value === 'string' && value.trim()).length / Math.max(fields.length, 6)) * 100); }
