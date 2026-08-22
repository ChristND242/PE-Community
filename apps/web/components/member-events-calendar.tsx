'use client';

import { CalendarClock, ChevronLeft, ChevronRight, MapPin, PanelLeftClose, PanelLeftOpen, Video, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { statusLabel, useI18n } from '../lib/i18n';
import { formatDate } from '../lib/utils';
import { StatusBadge, TableErrorState, TableSkeleton } from './ui';

export type MemberCalendarEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  onlineUrl?: string | null;
  capacity?: number | null;
  myRsvp: string | null;
};

export type MemberEventFilter = 'all' | 'upcoming' | 'past';

type MemberScheduleEntry = {
  id: string;
  source: 'EVENT' | 'TASK_DEADLINE';
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  colorKey: 'emerald' | 'cyan';
  eventId: string | null;
  taskBoardId: string | null;
  taskId: string | null;
  actionHref: string | null;
  metadata: Array<{ label: string; value: string }>;
  event: { location: string; onlineUrl: string | null; capacity: number | null; myRsvp: string | null } | null;
};

type MemberScheduleResponse = {
  month: string;
  generatedAt: string;
  entries: MemberScheduleEntry[];
  sourceSummary: { all: number; events: number; taskDeadlines: number };
};

type MemberScheduleFilter = 'all' | 'events' | 'taskDeadlines';

type CalendarDay = {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
};

const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const FR_WEEKDAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const;
const CALENDAR_SIDEBAR_STORAGE_KEY = 'pe-member-events-calendar-sidebar';
const MEMBER_SCHEDULE_SOURCE_STYLES = {
  EVENT: { chip: 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20', dot: 'bg-emerald-300' },
  TASK_DEADLINE: { chip: 'border-cyan-300/25 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20', dot: 'bg-cyan-300' },
} as const;

type CalendarSidebarState = 'visible' | 'hidden';

export function MemberEventsCalendar() {
  const { lang, t, timezone } = useI18n();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const today = useMemo(() => calendarDateInTimezone(new Date(), timezone), [timezone]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [data, setData] = useState<MemberScheduleResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<MemberScheduleFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<MemberScheduleEntry | null>(null);
  const [expandedDay, setExpandedDay] = useState<CalendarDay | null>(null);
  const [calendarSidebarState, setCalendarSidebarState] = useState<CalendarSidebarState>('visible');
  const isCalendarSidebarVisible = calendarSidebarState === 'visible';

  const filteredEvents = useMemo(() => (data?.entries ?? []).filter((event) => filter === 'all' || (filter === 'events' ? event.source === 'EVENT' : event.source === 'TASK_DEADLINE')), [data, filter]);
  const eventsByDate = useMemo(() => groupEventsByDate(filteredEvents, timezone), [filteredEvents, timezone]);
  const calendarDays = useMemo(() => buildMonthCalendarDays(monthDate, selectedDate, today), [monthDate, selectedDate, today]);
  const weekdays = lang === 'fr' ? FR_WEEKDAYS : EN_WEEKDAYS;
  const selectedDayEvents = eventsByDate[calendarDateKey(selectedDate)] ?? [];
  const selectedDateLabel = formatSelectedDate(selectedDate, locale);
  useEffect(() => {
    setMonthDate(startOfMonth(today));
    setSelectedDate(today);
  }, [today]);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError('');
    const month = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
    apiFetch<MemberScheduleResponse>(`/communities/${COMMUNITY_ID}/schedule?month=${month}`)
      .then((response) => { if (active) setData(response); })
      .catch(() => { if (active) setLoadError(t.dashboard.scheduleLoadFailed); });
    return () => { active = false; };
  }, [monthDate, t.dashboard.scheduleLoadFailed]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CALENDAR_SIDEBAR_STORAGE_KEY);
      if (stored === 'visible' || stored === 'hidden') setCalendarSidebarState(stored);
    } catch {}
  }, []);

  useEffect(() => {
    if (!selectedEvent && !expandedDay) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setSelectedEvent(null);
      setExpandedDay(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedDay, selectedEvent]);

  function changeMonth(offset: number) {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + offset, 1));
    setMonthDate(next);
    setSelectedDate(next);
  }

  function selectDay(day: CalendarDay) {
    setSelectedDate(day.date);
    if (!day.isCurrentMonth) setMonthDate(startOfMonth(day.date));
  }

  function returnToToday() {
    setMonthDate(startOfMonth(today));
    setSelectedDate(today);
  }

  function openEvent(event: MemberScheduleEntry) {
    setExpandedDay(null);
    setSelectedEvent(event);
  }

  function toggleCalendarSidebar() {
    setCalendarSidebarState((current) => {
      const next = current === 'visible' ? 'hidden' : 'visible';
      try {
        window.localStorage.setItem(CALENDAR_SIDEBAR_STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }

  return (
    <>
      <div className={`grid min-w-0 items-start ${isCalendarSidebarVisible ? 'gap-5 xl:grid-cols-[300px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {isCalendarSidebarVisible && <aside className="self-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => changeMonth(-1)} aria-label={t.dashboard.previousMonth} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><ChevronLeft size={15} /></button>
              <p className="text-sm font-semibold text-white">{formatMonthLabel(monthDate, locale)}</p>
              <button type="button" onClick={() => changeMonth(1)} aria-label={t.dashboard.nextMonth} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><ChevronRight size={15} /></button>
            </div>
            <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-semibold text-white/35">
              {weekdays.map((weekday) => <span key={weekday} className="py-1">{weekday}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-y-1">
              {calendarDays.map((day) => {
                const dayEvents = eventsByDate[day.key] ?? [];
                return (
                  <button key={day.key} type="button" onClick={() => selectDay(day)} aria-label={formatCalendarDay(day.date, locale)} aria-pressed={day.isSelected} aria-current={day.isToday ? 'date' : undefined} className={`relative mx-auto grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${day.isSelected ? 'bg-accent text-background' : day.isToday ? 'border border-accent/40 bg-accent/[0.06] text-accent' : day.isCurrentMonth ? 'text-white/72 hover:bg-white/[0.06] hover:text-white' : 'text-white/22 hover:bg-white/[0.04]'}`}>
                    {day.date.getUTCDate()}
                    {dayEvents.length > 0 && <span className="absolute bottom-0.5 flex gap-0.5">{dayEvents.slice(0, 3).map((event) => <span key={event.id} className={`h-1 w-1 rounded-full ${day.isSelected ? 'bg-background/75' : eventDotTone(event)}`} />)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">{t.dashboard.scheduleFilters}</h2>
            <div className="mt-3 space-y-1.5">
              {(['all', 'events', 'taskDeadlines'] as const).map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${filter === item ? 'border-accent/25 bg-accent/10 text-accent' : 'border-white/[0.07] bg-black/10 text-white/55 hover:border-white/12 hover:bg-white/[0.04] hover:text-white'}`}>
                  <span className={`grid h-4 w-4 place-items-center rounded border ${filter === item ? 'border-accent bg-accent text-background' : 'border-white/20 bg-black/20'}`}>{filter === item && <span className="h-1.5 w-1.5 rounded-sm bg-background" />}</span>
                  <span className="min-w-0 flex-1 font-medium">{scheduleFilterLabel(item, t)}</span>
                  <span className="text-xs tabular-nums text-white/38">{scheduleFilterCount(item, data?.sourceSummary)}</span>
                </button>
              ))}
            </div>
          </div>
          <section className="border-t border-white/10 p-4" aria-labelledby="member-selected-day-title">
            <div className="mb-3">
              <h2 id="member-selected-day-title" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{t.dashboard.selectedDay}</h2>
              <p className="mt-1 text-sm font-semibold text-white/82">{selectedDateLabel}</p>
            </div>
            {selectedDayEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedDayEvents.map((event) => (
                  <button key={event.id} type="button" onClick={() => openEvent(event)} className="w-full rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2.5 text-left transition hover:border-accent/25 hover:bg-accent/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25">
                    <span className={`block text-[11px] font-medium ${event.source === 'TASK_DEADLINE' ? 'text-cyan-200/55' : 'text-emerald-200/55'}`}>{formatEventTime(event.startsAt, locale, timezone)}</span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-white/82">{scheduleEntryTitle(event, t)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-3 text-sm text-white/42">{t.dashboard.noScheduleEntriesOnThisDay}</p>
            )}
          </section>
        </aside>}

        <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]" aria-label={t.dashboard.mySchedule}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleCalendarSidebar} aria-label={isCalendarSidebarVisible ? t.dashboard.hideCalendarSidebar : t.dashboard.showCalendarSidebar} aria-expanded={isCalendarSidebarVisible} className="inline-flex h-9 w-9 items-center justify-center text-white/50 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">
                {isCalendarSidebarVisible ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
              </button>
              <button type="button" onClick={returnToToday} className="h-9 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-white/65 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{t.dashboard.today}</button>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => changeMonth(-1)} aria-label={t.dashboard.previousMonth} className="inline-flex h-9 w-9 items-center justify-center text-white/50 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><ChevronLeft size={20} /></button>
              <h2 className="min-w-[10rem] text-center text-base font-semibold text-white sm:text-lg">{formatMonthLabel(monthDate, locale)}</h2>
              <button type="button" onClick={() => changeMonth(1)} aria-label={t.dashboard.nextMonth} className="inline-flex h-9 w-9 items-center justify-center text-white/50 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><ChevronRight size={20} /></button>
            </div>
            <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/70">{t.dashboard.month}</span>
          </div>
          <div className="chat-scrollbar min-w-0 overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 border-b border-white/10">
                {weekdays.map((weekday, index) => <div key={weekday} className={`px-3 py-2 text-xs font-medium text-white/40 ${index < 6 ? 'border-r border-white/10' : ''}`}>{weekday}</div>)}
              </div>
              <div className="relative grid grid-cols-7">
                {calendarDays.map((day, index) => {
                  const dayEvents = eventsByDate[day.key] ?? [];
                  const visibleEvents = dayEvents.slice(0, 3);
                  const hiddenCount = dayEvents.length - visibleEvents.length;
                  return (
                    <div key={day.key} className={`min-h-[132px] p-2 transition-colors ${index % 7 < 6 ? 'border-r border-white/10' : ''} ${index < 35 ? 'border-b border-white/10' : ''} ${day.isSelected ? 'bg-accent/[0.035]' : day.isCurrentMonth ? 'bg-transparent' : 'bg-black/15'}`}>
                      <button type="button" onClick={() => selectDay(day)} aria-label={formatCalendarDay(day.date, locale)} aria-pressed={day.isSelected} aria-current={day.isToday ? 'date' : undefined} className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${day.isToday ? 'bg-accent text-background' : day.isSelected ? 'border border-accent/40 bg-accent/10 text-accent' : day.isCurrentMonth ? 'text-white/78 hover:bg-white/[0.06]' : 'text-white/25 hover:bg-white/[0.04]'}`}>{day.date.getUTCDate()}</button>
                      <div className="mt-2 space-y-1">
                        {visibleEvents.map((event) => <EventChip key={event.id} event={event} locale={locale} timezone={timezone} onClick={() => openEvent(event)} />)}
                        {hiddenCount > 0 && <button type="button" onClick={() => setExpandedDay(day)} className="w-full truncate px-1 text-left text-[11px] font-semibold text-white/45 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25">{t.dashboard.moreEvents(hiddenCount)}</button>}
                      </div>
                    </div>
                  );
                })}
                {data && data.sourceSummary.all === 0 && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-4">
                    <div className="max-w-xs rounded-2xl border border-white/10 bg-[#08120e]/90 px-4 py-3 text-center shadow-xl shadow-black/25 backdrop-blur-md">
                      <p className="text-sm font-semibold text-white">{t.dashboard.noScheduleEntriesThisMonth}</p>
                      <p className="mt-1 text-xs leading-5 text-white/42">{t.dashboard.scheduleEntriesHint}</p>
                    </div>
                  </div>
                )}
                {!data && !loadError && <div className="absolute inset-0 z-20 bg-[#08120e]/75 p-6 backdrop-blur-sm"><TableSkeleton rows={5} columns={4} /></div>}
                {loadError && <div className="absolute inset-0 z-20 grid place-items-center bg-[#08120e]/85 p-6 backdrop-blur-sm"><TableErrorState title={loadError} retryLabel={t.common.retry} onRetry={() => setMonthDate(new Date(monthDate))} /></div>}
              </div>
            </div>
          </div>
        </section>
      </div>

      {expandedDay && <DayEventsDialog day={expandedDay} events={eventsByDate[expandedDay.key] ?? []} locale={locale} t={t} timezone={timezone} onClose={() => setExpandedDay(null)} onOpenEvent={openEvent} />}
      {selectedEvent && <EventDetailDialog event={selectedEvent} locale={locale} timezone={timezone} t={t} onClose={() => setSelectedEvent(null)} />}
    </>
  );
}

function EventChip({ event, locale, timezone, onClick }: { event: MemberScheduleEntry; locale: string; timezone: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} title={scheduleEntryTitle(event, t)} className={`group flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${eventChipTone(event)}`}>
      <span className="shrink-0 text-white/45">{formatEventTime(event.startsAt, locale, timezone)}</span>
      <span className="truncate font-semibold">{scheduleEntryTitle(event, t)}</span>
    </button>
  );
}

function DayEventsDialog({ day, events, locale, timezone, t, onClose, onOpenEvent }: { day: CalendarDay; events: MemberScheduleEntry[]; locale: string; timezone: string; t: ReturnType<typeof useI18n>['t']; onClose: () => void; onOpenEvent: (event: MemberScheduleEntry) => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="member-day-events-title">
      <button type="button" aria-label={t.common.close} onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <section className="relative max-h-[min(36rem,calc(100dvh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#08120e] p-5 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent/70">{t.dashboard.scheduleEntries}</p><h2 id="member-day-events-title" className="mt-1 text-lg font-semibold text-white">{formatCalendarDay(day.date, locale)}</h2></div>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="grid h-8 w-8 place-items-center rounded-full text-white/45 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><X size={15} /></button>
        </div>
        <div className="mt-5 space-y-2">
          {events.map((event) => <EventChip key={event.id} event={event} locale={locale} timezone={timezone} onClick={() => onOpenEvent(event)} />)}
        </div>
      </section>
    </div>
  );
}

function EventDetailDialog({ event, locale, timezone, t, onClose }: { event: MemberScheduleEntry; locale: string; timezone: string; t: ReturnType<typeof useI18n>['t']; onClose: () => void }) {
  const board = metadataValue(event, 'BOARD');
  const status = metadataValue(event, 'STATUS');
  const dueDate = metadataValue(event, 'DUE_DATE');
  const checklistProgress = metadataValue(event, 'CHECKLIST_PROGRESS');
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="member-event-detail-title">
      <button type="button" aria-label={t.common.close} onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <section className="relative max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#08120e] p-5 shadow-2xl shadow-black/60 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${event.source === 'TASK_DEADLINE' ? 'text-cyan-200/70' : 'text-accent/70'}`}>{event.source === 'TASK_DEADLINE' ? t.dashboard.taskDeadline : t.dashboard.eventDetails}</p><h2 id="member-event-detail-title" className="mt-2 text-xl font-semibold text-white">{scheduleEntryTitle(event, t)}</h2><p className="mt-1.5 text-sm text-white/48">{formatDate(event.startsAt, locale, timezone)}</p></div>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><X size={15} /></button>
        </div>
        {event.source === 'EVENT' && event.event ? <div className="mt-5 space-y-2.5 text-sm text-white/60">
          <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-3">{event.event.onlineUrl ? <Video size={16} className="mt-0.5 shrink-0 text-accent/75" /> : <MapPin size={16} className="mt-0.5 shrink-0 text-accent/75" />}<div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/32">{t.common.location}</p><p className="mt-1 text-white/68">{event.event.onlineUrl ? t.dashboard.onlineEvent : event.event.location}</p>{event.event.onlineUrl && <a href={event.event.onlineUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-accent transition hover:text-emerald-200">{event.event.onlineUrl}</a>}</div></div>
          {(event.event.capacity || event.event.myRsvp) ? <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-3">{event.event.capacity ? <span>{t.dashboard.capacity}: <strong className="font-semibold text-white/78">{event.event.capacity}</strong></span> : null}{event.event.myRsvp && <StatusBadge tone={event.event.myRsvp === 'GOING' ? 'good' : event.event.myRsvp === 'MAYBE' ? 'warn' : 'bad'}>{statusLabel(t, event.event.myRsvp)}</StatusBadge>}</div> : null}
        </div> : <div className="mt-5 space-y-2.5 text-sm text-white/60">
          <div className="flex items-start gap-3 rounded-xl border border-cyan-300/10 bg-cyan-400/[0.04] px-3 py-3"><CalendarClock size={16} className="mt-0.5 shrink-0 text-cyan-200/75" /><div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">{board && <DetailValue label={t.dashboard.board} value={board} />}{status && <DetailValue label={t.common.status} value={statusLabel(t, status)} />}{dueDate && <DetailValue label={t.dashboard.dueDateLabel} value={formatDate(dueDate, locale, timezone)} />}{checklistProgress && <DetailValue label={t.dashboard.checklistProgressLabel} value={checklistProgress} />}</div></div>
        </div>}
        {event.description && <div className="mt-5 border-t border-white/10 pt-4"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/38">{t.dashboard.eventDescription}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/58">{event.description}</p></div>}
        {event.actionHref && <div className="mt-5 flex justify-end"><Link href={event.actionHref} className="inline-flex h-9 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white/70 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">{event.source === 'TASK_DEADLINE' ? t.dashboard.openScheduleTask : t.dashboard.openEvent}</Link></div>}
      </section>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/32">{label}</p><p className="mt-1 text-white/72">{value}</p></div>;
}

function scheduleFilterLabel(filter: MemberScheduleFilter, t: ReturnType<typeof useI18n>['t']) {
  if (filter === 'events') return t.dashboard.eventsTitle;
  if (filter === 'taskDeadlines') return t.dashboard.myTaskDeadlines;
  return t.common.all;
}

function scheduleFilterCount(filter: MemberScheduleFilter, summary: MemberScheduleResponse['sourceSummary'] | undefined) {
  if (!summary) return 0;
  return summary[filter];
}

function scheduleEntryTitle(event: MemberScheduleEntry, t: ReturnType<typeof useI18n>['t']) {
  return event.source === 'TASK_DEADLINE' ? t.dashboard.taskDueLabel(event.title) : event.title;
}

function metadataValue(event: MemberScheduleEntry, label: string) {
  return event.metadata.find((item) => item.label === label)?.value ?? null;
}

function eventChipTone(event: MemberScheduleEntry) {
  return MEMBER_SCHEDULE_SOURCE_STYLES[event.source].chip;
}

function eventDotTone(event: MemberScheduleEntry) {
  return MEMBER_SCHEDULE_SOURCE_STYLES[event.source].dot;
}

function buildMonthCalendarDays(monthDate: Date, selectedDate: Date, today: Date): CalendarDay[] {
  const monthStart = startOfMonth(monthDate);
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - monthStart.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    return {
      key: calendarDateKey(date),
      date,
      isCurrentMonth: date.getUTCMonth() === monthDate.getUTCMonth() && date.getUTCFullYear() === monthDate.getUTCFullYear(),
      isToday: isSameCalendarDay(date, today),
      isSelected: isSameCalendarDay(date, selectedDate),
    };
  });
}

function groupEventsByDate(events: MemberScheduleEntry[], timezone: string) {
  return events.reduce<Record<string, MemberScheduleEntry[]>>((grouped, event) => {
    const key = calendarDateKey(calendarDateInTimezone(new Date(event.startsAt), timezone));
    (grouped[key] ??= []).push(event);
    grouped[key].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime() || left.title.localeCompare(right.title));
    return grouped;
  }, {});
}

function calendarDateInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function isSameCalendarDay(left: Date, right: Date) {
  return left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() === right.getUTCDate();
}

function calendarDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatMonthLabel(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatCalendarDay(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(date);
}

function formatSelectedDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatEventTime(value: string, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(value));
}
