'use client';

import { ChevronLeft, ChevronRight, ExternalLink, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { useI18n } from '../lib/i18n';

type CalendarSource = 'EVENT' | 'BIRTHDAY' | 'MEMBERSHIP_ANNIVERSARY' | 'DOCUMENT_EXPIRATION' | 'TASK_DEADLINE' | 'AUTOMATION_REMINDER';
type SourceFilter = 'all' | 'events' | 'birthdays' | 'anniversaries' | 'expirations' | 'taskDeadlines' | 'automation';
type CalendarEntry = {
  id: string;
  source: CalendarSource;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  colorKey: 'emerald' | 'amber' | 'violet' | 'red' | 'cyan' | 'blue';
  description: string | null;
  memberId: string | null;
  eventId: string | null;
  taskBoardId: string | null;
  taskId: string | null;
  automationRuleId: string | null;
  actionHref: string | null;
  metadata: Array<{ label: string; value: string }>;
};
type CalendarResponse = {
  month: string;
  timezone: string;
  generatedAt: string;
  entries: CalendarEntry[];
  sourceSummary: { all: number; events: number; birthdays: number; membershipAnniversaries: number; documentExpirations: number; taskDeadlines: number; automationReminders: number };
};
type CalendarDay = { key: string; date: Date; currentMonth: boolean; today: boolean; selected: boolean };

const WEEKDAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] } as const;
const FILTERS: SourceFilter[] = ['all', 'events', 'birthdays', 'anniversaries', 'expirations', 'taskDeadlines', 'automation'];
const SIDEBAR_KEY = 'pe-admin-operations-calendar-sidebar';
const SOURCE_TONES: Record<CalendarSource, { chip: string; dot: string }> = {
  EVENT: { chip: 'border-emerald-300/20 bg-emerald-300/[0.09] text-emerald-100', dot: 'bg-emerald-300' },
  BIRTHDAY: { chip: 'border-amber-300/20 bg-amber-300/[0.09] text-amber-100', dot: 'bg-amber-300' },
  MEMBERSHIP_ANNIVERSARY: { chip: 'border-violet-300/20 bg-violet-300/[0.09] text-violet-100', dot: 'bg-violet-300' },
  DOCUMENT_EXPIRATION: { chip: 'border-red-300/20 bg-red-300/[0.09] text-red-100', dot: 'bg-red-300' },
  TASK_DEADLINE: { chip: 'border-cyan-300/20 bg-cyan-300/[0.09] text-cyan-100', dot: 'bg-cyan-300' },
  AUTOMATION_REMINDER: { chip: 'border-blue-300/20 bg-blue-300/[0.09] text-blue-100', dot: 'bg-blue-300' },
};

export function AdminOperationsCalendar() {
  const { lang, t } = useI18n();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const initialToday = useMemo(() => dateOnly(new Date()), []);
  const [month, setMonth] = useState(() => monthKey(initialToday));
  const [selectedDate, setSelectedDate] = useState(initialToday);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [expandedDay, setExpandedDay] = useState<CalendarDay | null>(null);
  const monthDate = useMemo(() => parseMonth(month), [month]);
  const today = useMemo(() => calendarDateInTimezone(new Date(), data?.timezone ?? 'UTC'), [data?.timezone]);
  const calendarDays = useMemo(() => buildDays(monthDate, selectedDate, today), [monthDate, selectedDate, today]);
  const entriesByDay = useMemo(() => groupEntries(data?.entries ?? [], data?.timezone ?? 'UTC'), [data]);
  const selectedEntries = entriesByDay[dateKey(selectedDate)] ?? [];

  useEffect(() => {
    try { setSidebarVisible(window.localStorage.getItem(SIDEBAR_KEY) !== 'hidden'); } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    const sources = filter === 'all' ? '' : `&sources=${encodeURIComponent(filter)}`;
    apiFetch<CalendarResponse>(`/admin/${COMMUNITY_ID}/operations/calendar?month=${month}${sources}`)
      .then((response) => { if (active) setData(response); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, month]);

  useEffect(() => {
    if (!selectedEntry && !expandedDay) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSelectedEntry(null); setExpandedDay(null); }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [expandedDay, selectedEntry]);

  function changeMonth(offset: number) {
    const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + offset, 1));
    setMonth(monthKey(next));
    setSelectedDate(next);
  }

  function selectDay(day: CalendarDay) {
    setSelectedDate(day.date);
    if (!day.currentMonth) setMonth(monthKey(day.date));
  }

  function goToday() {
    setMonth(monthKey(today));
    setSelectedDate(today);
  }

  function toggleSidebar() {
    setSidebarVisible((current) => {
      const next = !current;
      try { window.localStorage.setItem(SIDEBAR_KEY, next ? 'visible' : 'hidden'); } catch {}
      return next;
    });
  }

  const filterLabel = (value: SourceFilter) => {
    if (value === 'events') return t.admin.operationsCalendarEvents;
    if (value === 'birthdays') return t.admin.operationsCalendarBirthdays;
    if (value === 'anniversaries') return t.admin.operationsCalendarAnniversaries;
    if (value === 'expirations') return t.admin.operationsCalendarExpirations;
    if (value === 'taskDeadlines') return t.admin.operationsCalendarTaskDeadlines;
    if (value === 'automation') return t.admin.operationsCalendarAutomation;
    return t.admin.operationsCalendarAll;
  };

  const sourceLabel = (source: CalendarSource) => filterLabel(sourceFilter(source));
  const automationRuleLabel = (value: string) => {
    if (value === 'DUE_BEFORE') return t.admin.operationsCalendarNotifyBeforeDue;
    if (value === 'OVERDUE') return t.admin.operationsCalendarOverdueNotification;
    if (value === 'STALE_TASK_FOLLOW_UP') return t.admin.operationsCalendarStaleFollowUp;
    if (value === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return t.admin.operationsCalendarChecklistIncomplete;
    if (value === 'OVERDUE_ESCALATION') return t.admin.operationsCalendarOverdueEscalation;
    return value;
  };
  const entryTitle = (entry: CalendarEntry) => {
    if (entry.source === 'BIRTHDAY') return t.admin.operationsCalendarBirthdayTitle(entry.title);
    if (entry.source === 'MEMBERSHIP_ANNIVERSARY') return t.admin.operationsCalendarAnniversaryTitle(entry.title);
    if (entry.source === 'DOCUMENT_EXPIRATION') return t.admin.operationsCalendarExpirationTitle(entry.title);
    if (entry.source === 'TASK_DEADLINE') return t.admin.operationsCalendarTaskDueTitle(entry.title);
    if (entry.source === 'AUTOMATION_REMINDER') return t.admin.operationsCalendarAutomationTitle(automationRuleLabel(entry.title));
    return entry.title;
  };
  const metadataLabel = (value: string) => ({ MEMBER: t.admin.operationsCalendarMember, YEARS: t.admin.operationsCalendarYears, LOCATION: t.admin.operationsCalendarLocation, DOCUMENT: t.admin.operationsCalendarDocument, STATUS: t.admin.operationsCalendarStatus, PRIORITY: t.admin.operationsCalendarPriority, TASK_BOARD: t.admin.operationsCalendarTaskBoard, BOARD: t.admin.operationsCalendarBoard, TASK: t.admin.operationsCalendarTask, RULE: t.admin.operationsCalendarRule, DELIVERY: t.admin.operationsCalendarDelivery, ASSIGNEES: t.admin.operationsCalendarAssignees, REMINDER_WINDOW: t.admin.operationsCalendarReminderWindow }[value] ?? value);
  const metadataValue = (label: string, value: string) => {
    if (value === 'PASSPORT') return t.admin.operationsCalendarPassport;
    if (label === 'RULE') return automationRuleLabel(value);
    if (label === 'ASSIGNEES') return value === 'UNASSIGNED' ? t.admin.operationsCalendarUnassigned : t.admin.operationsCalendarAssigneeCount(Number(value));
    if (label === 'DELIVERY') return value === 'IN_APP_EMAIL' ? t.admin.operationsCalendarInAppEmail : value === 'EMAIL' ? t.admin.operationsCalendarEmail : t.admin.operationsCalendarInApp;
    if (label === 'REMINDER_WINDOW') {
      if (value === 'AT_DUE_DATE') return t.admin.operationsCalendarAtDueDate;
      const [kind, rawCount] = value.split(':');
      const count = Number(rawCount);
      if (kind === 'HOURS_BEFORE') return t.admin.operationsCalendarHoursBefore(count);
      if (kind === 'DAYS_AFTER') return t.admin.operationsCalendarDaysAfter(count);
      if (kind === 'DAYS_INACTIVE') return t.admin.operationsCalendarDaysInactive(count);
    }
    return label === 'STATUS' || label === 'PRIORITY' ? value.replaceAll('_', ' ').toLocaleLowerCase() : value;
  };
  const severityLabel = (value: CalendarEntry['severity']) => value === 'CRITICAL' ? t.admin.operationsCalendarCritical : value === 'WARNING' ? t.admin.operationsCalendarWarning : t.admin.operationsCalendarInfo;
  const filterCount = (value: SourceFilter) => {
    const summary = data?.sourceSummary;
    if (!summary) return 0;
    if (value === 'all') return summary.all;
    if (value === 'anniversaries') return summary.membershipAnniversaries;
    if (value === 'expirations') return summary.documentExpirations;
    if (value === 'automation') return summary.automationReminders;
    return summary[value];
  };
  const actionLabel = (source: CalendarSource) => source === 'EVENT' ? t.admin.operationsCalendarOpenEvent : source === 'BIRTHDAY' || source === 'MEMBERSHIP_ANNIVERSARY' || source === 'DOCUMENT_EXPIRATION' ? t.admin.operationsCalendarOpenMember : source === 'AUTOMATION_REMINDER' ? t.admin.operationsCalendarOpenAutomation : t.admin.operationsCalendarOpenTaskBoard;

  return (
    <>
      <div className={`grid min-w-0 items-start ${sidebarVisible ? 'gap-5 xl:grid-cols-[300px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
        {sidebarVisible && (
          <aside className="self-start overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <IconButton label={t.dashboard.previousMonth} onClick={() => changeMonth(-1)}><ChevronLeft size={15} /></IconButton>
                <p className="text-sm font-semibold text-white">{formatMonth(monthDate, locale)}</p>
                <IconButton label={t.dashboard.nextMonth} onClick={() => changeMonth(1)}><ChevronRight size={15} /></IconButton>
              </div>
              <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-semibold text-white/35">{WEEKDAYS[lang].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
              <div className="mt-1 grid grid-cols-7 gap-y-1">
                {calendarDays.map((day) => {
                  const entries = entriesByDay[day.key] ?? [];
                  return <button key={day.key} type="button" onClick={() => selectDay(day)} aria-pressed={day.selected} aria-current={day.today ? 'date' : undefined} className={`relative mx-auto grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${day.selected ? 'bg-accent text-background' : day.today ? 'border border-accent/40 bg-accent/[0.06] text-accent' : day.currentMonth ? 'text-white/72 hover:bg-white/[0.06]' : 'text-white/22'}`}>
                    {day.date.getUTCDate()}
                    {entries.length > 0 && <span className="absolute bottom-0.5 flex gap-0.5">{entries.slice(0, 3).map((entry) => <span key={entry.id} className={`h-1 w-1 rounded-full ${day.selected ? 'bg-background/75' : SOURCE_TONES[entry.source].dot}`} />)}</span>}
                  </button>;
                })}
              </div>
            </div>
            <div className="p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">{t.admin.operationsCalendarFilters}</h2>
              <div className="mt-3 space-y-1.5">
                {FILTERS.map((item) => {
                  const count = filterCount(item);
                  return <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 ${filter === item ? 'border-accent/25 bg-accent/10 text-accent' : 'border-white/[0.07] bg-black/10 text-white/55 hover:bg-white/[0.04] hover:text-white'}`}>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item === 'all' ? 'bg-white/50' : SOURCE_TONES[filterSource(item)].dot}`} />
                    <span className="min-w-0 flex-1 truncate font-medium">{filterLabel(item)}</span><span className="text-xs tabular-nums opacity-65">{count}</span>
                  </button>;
                })}
              </div>
            </div>
            <section className="border-t border-white/10 p-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{t.admin.operationsCalendarSelectedDay}</h2>
              <p className="mt-1 text-sm font-semibold text-white/82">{formatDay(selectedDate, locale)}</p>
              <div className="mt-3 space-y-2">
                {selectedEntries.map((entry) => <EntryChip key={entry.id} entry={entry} title={entryTitle(entry)} locale={locale} timezone={data?.timezone ?? 'UTC'} onClick={() => setSelectedEntry(entry)} />)}
                {!selectedEntries.length && <p className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-3 text-sm text-white/42">{t.admin.operationsCalendarNoDayEntries}</p>}
              </div>
            </section>
          </aside>
        )}

        <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]" aria-label={t.admin.operationsCalendarTitle}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleSidebar} aria-label={sidebarVisible ? t.dashboard.hideCalendarSidebar : t.dashboard.showCalendarSidebar} aria-expanded={sidebarVisible} className="inline-flex h-9 w-9 items-center justify-center text-white/50 transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{sidebarVisible ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button>
              <button type="button" onClick={goToday} className="h-9 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-white/65 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">{t.dashboard.today}</button>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => changeMonth(-1)} aria-label={t.dashboard.previousMonth} className="inline-flex h-9 w-9 items-center justify-center text-white/50 transition hover:text-accent"><ChevronLeft size={20} /></button>
              <h2 className="min-w-[10rem] text-center text-base font-semibold text-white sm:text-lg">{formatMonth(monthDate, locale)}</h2>
              <button type="button" onClick={() => changeMonth(1)} aria-label={t.dashboard.nextMonth} className="inline-flex h-9 w-9 items-center justify-center text-white/50 transition hover:text-accent"><ChevronRight size={20} /></button>
            </div>
            <span className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-white/70">{t.dashboard.month}</span>
          </div>
          {error ? <div className="grid min-h-[32rem] place-items-center p-6 text-sm text-red-200">{t.admin.operationsCalendarLoadFailed}</div> : loading && !data ? <CalendarSkeleton /> : (
            <div className="chat-scrollbar min-w-0 overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 border-b border-white/10">{WEEKDAYS[lang].map((day, index) => <div key={day} className={`px-3 py-2 text-xs font-medium text-white/40 ${index < 6 ? 'border-r border-white/10' : ''}`}>{day}</div>)}</div>
                <div className="relative grid grid-cols-7">
                  {calendarDays.map((day, index) => {
                    const entries = entriesByDay[day.key] ?? [];
                    return <div key={day.key} className={`min-h-[132px] p-2 ${index % 7 < 6 ? 'border-r border-white/10' : ''} ${index < 35 ? 'border-b border-white/10' : ''} ${day.selected ? 'bg-accent/[0.035]' : day.currentMonth ? '' : 'bg-black/15'}`}>
                      <button type="button" onClick={() => selectDay(day)} aria-pressed={day.selected} aria-current={day.today ? 'date' : undefined} className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${day.today ? 'bg-accent text-background' : day.selected ? 'border border-accent/40 bg-accent/10 text-accent' : day.currentMonth ? 'text-white/78' : 'text-white/25'}`}>{day.date.getUTCDate()}</button>
                      <div className="mt-2 space-y-1">{entries.slice(0, 3).map((entry) => <EntryChip key={entry.id} entry={entry} title={entryTitle(entry)} compact locale={locale} timezone={data?.timezone ?? 'UTC'} onClick={() => setSelectedEntry(entry)} />)}{entries.length > 3 && <button type="button" onClick={() => setExpandedDay(day)} className="w-full px-1 text-left text-[11px] font-semibold text-white/45 hover:text-accent">{t.admin.operationsCalendarMoreEntries(entries.length - 3)}</button>}</div>
                    </div>;
                  })}
                  {!loading && (data?.entries.length ?? 0) === 0 && <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-4"><div className="max-w-xs rounded-2xl border border-white/10 bg-[#08120e]/90 px-4 py-3 text-center shadow-xl backdrop-blur-md"><p className="text-sm font-semibold text-white">{t.admin.operationsCalendarNoMonthEntries}</p><p className="mt-1 text-xs text-white/42">{t.admin.operationsCalendarEmptyHint}</p></div></div>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {expandedDay && <Dialog title={t.admin.operationsCalendarEntriesForDay} subtitle={formatDay(expandedDay.date, locale)} closeLabel={t.common.close} onClose={() => setExpandedDay(null)}><div className="space-y-2">{(entriesByDay[expandedDay.key] ?? []).map((entry) => <EntryChip key={entry.id} entry={entry} title={entryTitle(entry)} locale={locale} timezone={data?.timezone ?? 'UTC'} onClick={() => { setExpandedDay(null); setSelectedEntry(entry); }} />)}</div></Dialog>}
      {selectedEntry && <Dialog title={t.admin.operationsCalendarEntryDetails} subtitle={entryTitle(selectedEntry)} closeLabel={t.common.close} onClose={() => setSelectedEntry(null)}><div className="space-y-4">{selectedEntry.description && <p className="text-sm leading-6 text-white/58">{selectedEntry.description}</p>}<dl className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-black/15 px-4">{[[t.admin.operationsCalendarDate, selectedEntry.allDay ? formatDay(entryDate(selectedEntry, data?.timezone ?? 'UTC'), locale) : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: data?.timezone ?? 'UTC' }).format(new Date(selectedEntry.startsAt))], [t.admin.operationsCalendarSource, sourceLabel(selectedEntry.source)], [t.admin.operationsCalendarSeverity, severityLabel(selectedEntry.severity)], ...selectedEntry.metadata.map((item) => [metadataLabel(item.label), metadataValue(item.label, item.value)])].map(([label, value]) => <div key={`${label}-${value}`} className="flex items-start justify-between gap-4 py-3"><dt className="text-sm text-white/42">{label}</dt><dd className="text-right text-sm font-medium text-white/78">{value}</dd></div>)}</dl>{selectedEntry.actionHref && <Link href={selectedEntry.actionHref} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-background transition hover:bg-accent/90">{actionLabel(selectedEntry.source)}<ExternalLink size={15} /></Link>}</div></Dialog>}
    </>
  );
}

function EntryChip({ entry, title, locale, timezone, compact = false, onClick }: { entry: CalendarEntry; title: string; locale: string; timezone: string; compact?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} title={title} className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${SOURCE_TONES[entry.source].chip}`}><span className="shrink-0 text-white/45">{entry.allDay ? '' : formatTime(entry.startsAt, locale, timezone)}</span><span className={compact ? 'truncate font-semibold' : 'min-w-0 flex-1 truncate font-semibold'}>{title}</span></button>;
}

function Dialog({ title, subtitle, closeLabel, onClose, children }: { title: string; subtitle: string; closeLabel: string; onClose: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-calendar-dialog-root className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true">
      <button data-calendar-dialog-overlay type="button" aria-label={closeLabel} onClick={onClose} className="fixed inset-0 z-0 bg-black/70 backdrop-blur-sm" />
      <section data-calendar-dialog-content className="chat-scrollbar relative z-10 max-h-[min(38rem,calc(100dvh-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#08120e] p-5 shadow-2xl shadow-black/60"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent/70">{title}</p><h2 className="mt-1 text-lg font-semibold text-white">{subtitle}</h2></div><button type="button" onClick={onClose} aria-label={closeLabel} className="grid h-8 w-8 place-items-center rounded-full text-white/45 hover:bg-white/[0.07] hover:text-white"><X size={15} /></button></div><div className="mt-5">{children}</div></section>
    </div>,
    document.body,
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/50 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">{children}</button>;
}

function CalendarSkeleton() { return <div className="grid min-h-[32rem] grid-cols-7 animate-pulse">{Array.from({ length: 35 }, (_, index) => <div key={index} className="min-h-[132px] border-b border-r border-white/[0.06] p-3"><span className="block h-6 w-6 rounded-full bg-white/[0.06]" /></div>)}</div>; }
function parseMonth(value: string) { const [year, month] = value.split('-').map(Number); return new Date(Date.UTC(year, month - 1, 1)); }
function monthKey(value: Date) { return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`; }
function dateOnly(value: Date) { return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())); }
function dateKey(value: Date) { return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`; }
function calendarDateInTimezone(value: Date, timezone: string) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''; return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`); }
function entryDate(entry: CalendarEntry, timezone: string) { return entry.allDay ? new Date(entry.startsAt.slice(0, 10) + 'T00:00:00.000Z') : calendarDateInTimezone(new Date(entry.startsAt), timezone); }
function groupEntries(entries: CalendarEntry[], timezone: string) { return entries.reduce<Record<string, CalendarEntry[]>>((groups, entry) => { const key = dateKey(entryDate(entry, timezone)); (groups[key] ??= []).push(entry); return groups; }, {}); }
function buildDays(month: Date, selected: Date, today: Date): CalendarDay[] { const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)); const start = new Date(first); start.setUTCDate(1 - first.getUTCDay()); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return { key: dateKey(date), date, currentMonth: date.getUTCMonth() === month.getUTCMonth(), today: dateKey(date) === dateKey(today), selected: dateKey(date) === dateKey(selected) }; }); }
function formatMonth(value: Date, locale: string) { return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(value); }
function formatDay(value: Date, locale: string) { return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value); }
function formatTime(value: string, locale: string, timezone: string) { return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(value)); }
function sourceFilter(source: CalendarSource): Exclude<SourceFilter, 'all'> { if (source === 'EVENT') return 'events'; if (source === 'BIRTHDAY') return 'birthdays'; if (source === 'MEMBERSHIP_ANNIVERSARY') return 'anniversaries'; if (source === 'DOCUMENT_EXPIRATION') return 'expirations'; if (source === 'TASK_DEADLINE') return 'taskDeadlines'; return 'automation'; }
function filterSource(filter: Exclude<SourceFilter, 'all'>): CalendarSource { if (filter === 'events') return 'EVENT'; if (filter === 'birthdays') return 'BIRTHDAY'; if (filter === 'anniversaries') return 'MEMBERSHIP_ANNIVERSARY'; if (filter === 'expirations') return 'DOCUMENT_EXPIRATION'; if (filter === 'taskDeadlines') return 'TASK_DEADLINE'; return 'AUTOMATION_REMINDER'; }
