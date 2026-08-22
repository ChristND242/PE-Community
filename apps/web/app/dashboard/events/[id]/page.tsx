'use client';

import { CalendarDays, MapPin, Video } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '../../../../components/shell';
import { Card, LoadingButton, StatusBadge, TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { statusLabel, useI18n } from '../../../../lib/i18n';
import { formatDate } from '../../../../lib/utils';
import { MemberEventTasks } from './event-tasks';

type EventItem = { id: string; title: string; description: string; startsAt: string; location: string; onlineUrl?: string | null; capacity?: number | null; rsvpCounts: { going: number; maybe: number; declined: number }; myRsvp: string | null };

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang, t, timezone } = useI18n();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  async function load() {
    setError('');
    try {
      setEvent(await apiFetch<EventItem>(`/communities/${COMMUNITY_ID}/events/${id}`));
    } catch {
      setError(t.dashboard.eventLoadFailed);
    }
  }

  useEffect(() => { load(); }, [id, t.dashboard.eventLoadFailed]);

  async function rsvp(status: string) {
    if (pending) return;
    setPending(status);
    try {
      await apiFetch(`/communities/${COMMUNITY_ID}/events/${id}/rsvp`, { method: 'POST', body: JSON.stringify({ status }) });
      toast.success(t.dashboard.rsvpSaved);
      await load();
    } catch {
      toast.error(t.dashboard.rsvpFailed);
    } finally {
      setPending(null);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Link href="/dashboard/events" className="text-sm font-semibold text-white/55 transition hover:text-accent">{t.common.back}</Link>
        {error ? <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /> : !event ? <TableSkeleton rows={6} columns={2} /> : (
          <>
            <header className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-5 shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{event.title}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">{event.description}</p>
                </div>
                <StatusBadge tone={event.myRsvp === 'GOING' ? 'good' : event.myRsvp === 'MAYBE' ? 'warn' : event.myRsvp === 'DECLINED' ? 'bad' : 'neutral'}>{event.myRsvp ? statusLabel(t, event.myRsvp) : t.dashboard.rsvp}</StatusBadge>
              </div>
            </header>
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <Card className="rounded-2xl">
                <h2 className="text-base font-semibold text-white">{t.dashboard.eventDetails}</h2>
                <div className="mt-5 grid gap-3 text-sm text-white/60">
                  <p className="flex items-center gap-2"><CalendarDays size={16} />{formatDate(event.startsAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</p>
                  <p>{t.dashboard.timezone}: {timezone}</p>
                  <p className="flex items-center gap-2">{event.onlineUrl ? <Video size={16} /> : <MapPin size={16} />}{event.onlineUrl ? t.dashboard.onlineEvent : event.location}</p>
                  {event.onlineUrl && <a href={event.onlineUrl} target="_blank" rel="noreferrer" className="text-accent transition hover:text-accent/80">{event.onlineUrl}</a>}
                  {event.capacity ? <p>{t.dashboard.capacity}: {event.capacity}</p> : null}
                </div>
              </Card>
              <Card className="rounded-2xl">
                <h2 className="text-base font-semibold text-white">{t.dashboard.rsvpSummary}</h2>
                <div className="mt-4 grid gap-2 text-sm text-white/60">
                  <p>{event.rsvpCounts.going} {t.dashboard.going}</p>
                  <p>{event.rsvpCounts.maybe} {t.dashboard.maybe}</p>
                  <p>{event.rsvpCounts.declined} {t.dashboard.notGoing}</p>
                </div>
                <div className="mt-5 grid gap-2">
                  <LoadingButton loading={pending === 'GOING'} loadingLabel={t.dashboard.savingRsvp} disabled={!!pending} onClick={() => rsvp('GOING')}>{t.dashboard.going}</LoadingButton>
                  <LoadingButton loading={pending === 'MAYBE'} loadingLabel={t.dashboard.savingRsvp} disabled={!!pending} className="bg-cyan-300" onClick={() => rsvp('MAYBE')}>{t.dashboard.maybe}</LoadingButton>
                  <LoadingButton loading={pending === 'DECLINED'} loadingLabel={t.dashboard.savingRsvp} disabled={!!pending} className="bg-white/10 text-white hover:bg-white/15" onClick={() => rsvp('DECLINED')}>{t.dashboard.notGoing}</LoadingButton>
                </div>
              </Card>
            </div>
            <MemberEventTasks eventId={id} />
          </>
        )}
      </div>
    </AppShell>
  );
}
