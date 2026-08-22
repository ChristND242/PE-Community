'use client';

import { CalendarDays, MapPin, Search, Video } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MemberEventsCalendar, type MemberCalendarEvent, type MemberEventFilter } from '../../../components/member-events-calendar';
import { AppShell } from '../../../components/shell';
import { Card, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { statusLabel, useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type EventItem = MemberCalendarEvent & { rsvpCounts: { going: number; maybe: number; declined: number } };
type Events = { events: EventItem[] };
type MemberEventsView = 'events' | 'calendar';

export default function EventsPage() {
  return <Suspense fallback={<EventsPageFallback />}><EventsPageContent /></Suspense>;
}

function EventsPageContent() {
  const { lang, t, timezone } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Events | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MemberEventFilter>('upcoming');
  const [pendingRsvp, setPendingRsvp] = useState<{ eventId: string; status: string } | null>(null);
  const selectedView: MemberEventsView = searchParams.get('view') === 'calendar' ? 'calendar' : 'events';

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Events>(`/communities/${COMMUNITY_ID}/events`));
    } catch {
      setError(t.common.error);
    }
  }

  useEffect(() => { load(); }, [t.common.error]);

  async function rsvp(eventId: string, status: string) {
    if (pendingRsvp) return;
    setPendingRsvp({ eventId, status });
    try {
      await apiFetch(`/communities/${COMMUNITY_ID}/events/${eventId}/rsvp`, { method: 'POST', body: JSON.stringify({ status }) });
      toast.success(t.dashboard.rsvpSaved);
      await load();
    } catch {
      toast.error(t.dashboard.rsvpFailed);
    } finally {
      setPendingRsvp(null);
    }
  }

  const events = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = Date.now();
    return (data?.events ?? []).filter((event) => {
      const starts = new Date(event.startsAt).getTime();
      const matchesStatus = filter === 'all' || (filter === 'upcoming' ? starts >= now : starts < now);
      const matchesSearch = `${event.title} ${event.location}`.toLowerCase().includes(normalized);
      return matchesStatus && matchesSearch;
    });
  }, [data, filter, query]);

  function selectView(view: MemberEventsView) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('view', view);
    router.replace(`/dashboard/events?${next.toString()}`, { scroll: false });
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.dashboard.eventsTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.eventDetails}</p>
        </header>
        <MemberEventsTabs selectedView={selectedView} onChange={selectView} />
        {selectedView === 'events' ? <Card className="rounded-2xl p-0">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.dashboard.eventSearch} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/60" />
            </label>
            <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
              {(['upcoming', 'past', 'all'] as const).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${filter === item ? 'bg-accent text-background' : 'text-white/60 hover:text-white'}`}>{filterLabel(t, item)}</button>)}
            </div>
          </div>
          <div className="p-4">
            {error ? <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /> : !data ? <TableSkeleton rows={4} columns={3} /> : events.length === 0 ? <TableEmptyState title={query || filter !== 'all' ? t.dashboard.noMatchingEvents : t.dashboard.noEvents} /> : (
              <div className="grid gap-4 xl:grid-cols-2">
                {events.map((event) => (
                  <Card key={event.id} className="rounded-2xl bg-black/15">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link href={`/dashboard/events/${event.id}`} className="text-lg font-semibold text-white transition hover:text-accent">{event.title}</Link>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{event.description}</p>
                      </div>
                      <StatusBadge tone={event.myRsvp === 'GOING' ? 'good' : event.myRsvp === 'MAYBE' ? 'warn' : event.myRsvp === 'DECLINED' ? 'bad' : 'neutral'}>{event.myRsvp ? statusLabel(t, event.myRsvp) : t.dashboard.rsvp}</StatusBadge>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-white/55 sm:grid-cols-2">
                      <span className="inline-flex items-center gap-2"><CalendarDays size={15} />{formatDate(event.startsAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                      <span className="inline-flex items-center gap-2">{event.onlineUrl ? <Video size={15} /> : <MapPin size={15} />}{event.onlineUrl ? t.dashboard.onlineEvent : event.location}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/45">
                      <span>{t.dashboard.timezone}: {timezone}</span>
                      <span>{event.rsvpCounts.going} {t.dashboard.going}</span>
                      <span>{event.rsvpCounts.maybe} {t.dashboard.maybe}</span>
                      <span>{event.rsvpCounts.declined} {t.dashboard.notGoing}</span>
                      {event.capacity ? <span>{t.dashboard.capacity}: {event.capacity}</span> : null}
                    </div>
                    <RsvpButtons eventId={event.id} pending={pendingRsvp} onRsvp={rsvp} />
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Card> : <MemberEventsCalendar />}
      </div>
    </AppShell>
  );

  function RsvpButtons({ eventId, pending, onRsvp }: { eventId: string; pending: { eventId: string; status: string } | null; onRsvp: (eventId: string, status: string) => void }) {
    return (
      <div className="mt-5 flex flex-wrap gap-2">
        <LoadingButton loading={pending?.eventId === eventId && pending.status === 'GOING'} loadingLabel={t.dashboard.savingRsvp} onClick={() => onRsvp(eventId, 'GOING')} disabled={!!pending}>{t.dashboard.going}</LoadingButton>
        <LoadingButton loading={pending?.eventId === eventId && pending.status === 'MAYBE'} loadingLabel={t.dashboard.savingRsvp} className="bg-cyan-300" onClick={() => onRsvp(eventId, 'MAYBE')} disabled={!!pending}>{t.dashboard.maybe}</LoadingButton>
        <LoadingButton loading={pending?.eventId === eventId && pending.status === 'DECLINED'} loadingLabel={t.dashboard.savingRsvp} className="bg-white/10 text-white hover:bg-white/15" onClick={() => onRsvp(eventId, 'DECLINED')} disabled={!!pending}>{t.dashboard.notGoing}</LoadingButton>
      </div>
    );
  }
}

function EventsPageFallback() {
  return <AppShell><div className="space-y-6"><TableSkeleton rows={6} columns={3} /></div></AppShell>;
}

function MemberEventsTabs({ selectedView, onChange }: { selectedView: MemberEventsView; onChange: (view: MemberEventsView) => void }) {
  const { t } = useI18n();
  const views = [
    { key: 'events' as const, label: t.dashboard.eventsTitle },
    { key: 'calendar' as const, label: t.dashboard.mySchedule },
  ];
  return (
    <nav aria-label={t.dashboard.eventsTitle} className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
      {views.map((view) => {
        const active = selectedView === view.key;
        return <button key={view.key} type="button" onClick={() => onChange(view.key)} aria-pressed={active} className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? 'bg-accent/15 text-accent' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'}`}>{view.label}</button>;
      })}
    </nav>
  );
}

function filterLabel(t: ReturnType<typeof useI18n>['t'], value: MemberEventFilter) {
  if (value === 'upcoming') return t.dashboard.upcomingEvents;
  if (value === 'past') return t.dashboard.pastEvents;
  return t.dashboard.allEvents;
}
