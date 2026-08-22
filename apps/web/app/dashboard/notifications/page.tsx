'use client';

import { Bell, CheckCircle2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '../../../components/shell';
import { Card, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { memberNotificationHref } from '../../../lib/member-notification-link';
import { formatDate } from '../../../lib/utils';

type NotificationItem = {
  id: string;
  type?: string;
  title: string;
  body: string;
  metadata?: { eventId?: string; boardId?: string; taskBoardId?: string; announcementId?: string; taskId?: string; kind?: string; tab?: string } | null;
  readAt?: string | null;
  createdAt: string;
};

type NotificationResponse = { notifications: NotificationItem[] };

export default function NotificationsPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState('');
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  async function load() {
    setError('');
    try {
      setData(await apiFetch<NotificationResponse>('/me/notifications'));
    } catch {
      setError(t.dashboard.notificationsLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.dashboard.notificationsLoadFailed]);

  const unreadCount = useMemo(() => (data?.notifications ?? []).filter((item) => !item.readAt).length, [data]);

  async function markRead(id: string) {
    if (markingId) return;
    setMarkingId(id);
    try {
      const updated = await apiFetch<NotificationItem>(`/me/notifications/${id}/read`, { method: 'PATCH' });
      setData((current) => current ? { notifications: current.notifications.map((item) => item.id === id ? updated : item) } : current);
      window.dispatchEvent(new Event('pe:sidebar-counts-refresh'));
      toast.success(t.dashboard.notificationRead);
    } catch {
      toast.error(t.dashboard.notificationReadFailed);
    } finally {
      setMarkingId('');
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <Bell size={14} />
              {t.dashboard.notificationsTitle}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.dashboard.notificationsPageTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.notificationsPageSubtitle}</p>
          </div>
          <StatusBadge tone={unreadCount ? 'warn' : 'good'}>{t.dashboard.unreadNotifications(unreadCount)}</StatusBadge>
        </header>

        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !data ? (
          <TableSkeleton rows={6} columns={2} />
        ) : data.notifications.length === 0 ? (
          <TableEmptyState title={t.dashboard.noNotifications} description={t.dashboard.noNotificationsDescription} />
        ) : (
          <div className="grid gap-3">
            {data.notifications.map((item) => {
              const unread = !item.readAt;
              const actionHref = memberNotificationHref(item);
              return (
                <Card key={item.id} className={`rounded-2xl border-white/10 ${unread ? 'bg-[linear-gradient(135deg,rgba(94,210,156,0.095),rgba(255,255,255,0.035))]' : 'bg-white/[0.03]'}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${unread ? 'border-accent/25 bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.035] text-white/45'}`}>
                        {unread ? <Bell size={16} /> : <CheckCircle2 size={16} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-semibold text-white">{t.dashboard.notificationTypeLabel(item.type ?? '')}</h2>
                          <StatusBadge tone={unread ? 'warn' : 'neutral'}>{unread ? t.dashboard.unread : t.dashboard.read}</StatusBadge>
                          {item.type && <StatusBadge>{t.dashboard.notificationTypeLabel(item.type)}</StatusBadge>}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/58">{item.body}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/40">
                          <span>{formatDate(item.createdAt, locale)}</span>
                          {actionHref && (
                            <Link href={actionHref} className="inline-flex items-center gap-1 font-semibold text-accent transition hover:text-[#74e4b1]">
                              {t.dashboard.notificationActionLabel(item.type ?? '')}
                              <ExternalLink size={12} />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                    {unread && (
                      <LoadingButton loading={markingId === item.id} loadingLabel={t.dashboard.markingRead} disabled={Boolean(markingId)} onClick={() => markRead(item.id)} className="shrink-0 bg-white/10 text-white hover:bg-white/15">
                        {t.dashboard.markAsRead}
                      </LoadingButton>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
