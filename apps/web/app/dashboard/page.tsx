'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/shell';
import { MemberDashboardHeader, MemberDashboardView } from '../../components/member-dashboard-view';
import type {
  MemberDashboardActivityTab,
  MemberDashboardAssignedTask,
  MemberDashboardEvent,
  MemberDashboardFeed,
  MemberDashboardNotifications,
  MemberDashboardProfile,
  MemberDashboardUser,
  MemberDashboardViewModel,
} from '../../components/member-dashboard-view';
import { TableErrorState, TableSkeleton } from '../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

type Events = { events: MemberDashboardEvent[] };
type AssignedEventTasks = { assignedEventTasks: MemberDashboardAssignedTask[] };

export default function DashboardPage() {
  const { t } = useI18n();
  const [user, setUser] = useState<MemberDashboardUser | null>(null);
  const [profile, setProfile] = useState<MemberDashboardProfile | null>(null);
  const [feed, setFeed] = useState<MemberDashboardFeed | null>(null);
  const [events, setEvents] = useState<Events | null>(null);
  const [notifications, setNotifications] = useState<MemberDashboardNotifications | null>(null);
  const [assignedEventTasks, setAssignedEventTasks] = useState<AssignedEventTasks | null>(null);
  const [referenceTime, setReferenceTime] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeActivityTab, setActiveActivityTab] = useState<MemberDashboardActivityTab>('announcements');

  async function load() {
    setError('');
    try {
      const [userData, profileData, feedData, eventData, notificationData, assignedTaskData] = await Promise.all([
        apiFetch<MemberDashboardUser>('/auth/me'),
        apiFetch<MemberDashboardProfile>('/me'),
        apiFetch<MemberDashboardFeed>(`/communities/${COMMUNITY_ID}/feed`),
        apiFetch<Events>(`/communities/${COMMUNITY_ID}/events`),
        apiFetch<MemberDashboardNotifications>('/me/notifications'),
        apiFetch<AssignedEventTasks>(`/communities/${COMMUNITY_ID}/events/tasks/assigned`),
      ]);
      setUser(userData);
      setProfile(profileData);
      setFeed(feedData);
      setEvents(eventData);
      setNotifications(notificationData);
      setAssignedEventTasks(assignedTaskData);
      setReferenceTime(new Date().toISOString());
    } catch {
      setError(t.dashboard.dashboardLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.dashboard.dashboardLoadFailed]);

  const data: MemberDashboardViewModel | null = user && profile && feed && events && notifications && assignedEventTasks && referenceTime
    ? { referenceTime, user, profile, feed, events, notifications, assignedEventTasks }
    : null;

  return (
    <AppShell>
      {error ? (
        <div className="space-y-6">
          <MemberDashboardHeader email={user?.email} />
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        </div>
      ) : data ? (
        <MemberDashboardView data={data} activeActivityTab={activeActivityTab} onActivityTabChange={setActiveActivityTab} />
      ) : (
        <div className="space-y-6">
          <MemberDashboardHeader email={user?.email} />
          <DashboardSkeleton />
        </div>
      )}
    </AppShell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <TableSkeleton rows={3} columns={3} />
      <div className="grid gap-4 md:grid-cols-3"><TableSkeleton rows={1} columns={1} /><TableSkeleton rows={1} columns={1} /><TableSkeleton rows={1} columns={1} /></div>
      <div className="grid gap-6 lg:grid-cols-2"><TableSkeleton rows={4} columns={1} /><TableSkeleton rows={4} columns={1} /></div>
    </div>
  );
}
