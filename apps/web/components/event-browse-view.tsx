'use client';

import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { EventCard, type EventCardSummary, type EventRsvpStatus } from './event-card';
import type { MemberCalendarEvent, MemberEventFilter } from './member-events-calendar';
import { Card, TableEmptyState, TableErrorState, TableSkeleton } from './ui';

type EventItem = MemberCalendarEvent & EventCardSummary;
type Events = { events: EventItem[] };

export function EventBrowseView() {
  const { lang, t, timezone } = useI18n();
  const [data, setData] = useState<Events | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MemberEventFilter>('upcoming');
  const [pendingRsvp, setPendingRsvp] = useState<{ eventId: string; status: EventRsvpStatus } | null>(null);

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Events>(`/communities/${COMMUNITY_ID}/events`));
    } catch {
      setError(t.common.error);
    }
  }

  useEffect(() => { load(); }, [t.common.error]);

  async function rsvp(eventId: string, status: EventRsvpStatus) {
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

  return (
    <Card className="rounded-2xl p-0">
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
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                locale={lang === 'fr' ? 'fr-FR' : 'en-US'}
                timezone={timezone}
                labels={{ online: t.dashboard.onlineEvent, inPerson: t.dashboard.inPersonEvent, capacity: t.dashboard.capacity, going: t.dashboard.going, maybe: t.dashboard.maybe, declined: t.dashboard.notGoing, saving: t.dashboard.savingRsvp, more: t.dashboard.eventDescriptionMore, less: t.dashboard.eventDescriptionLess }}
                pendingStatus={pendingRsvp?.eventId === event.id ? pendingRsvp.status : null}
                onRsvp={(status) => rsvp(event.id, status)}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function filterLabel(t: ReturnType<typeof useI18n>['t'], value: MemberEventFilter) {
  if (value === 'upcoming') return t.dashboard.upcomingEvents;
  if (value === 'past') return t.dashboard.pastEvents;
  return t.dashboard.allEvents;
}
