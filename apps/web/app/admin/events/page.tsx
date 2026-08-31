'use client';

import { ArrowUpDown, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { EventBrowseView } from '../../../components/event-browse-view';
import { EventImageField, eventImageValidation, eventRequestBody, initialEventImageSelection } from '../../../components/event-image-field';
import { AppShell } from '../../../components/shell';
import { Card, DataTablePagination, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { eventSubmissionError, type EventFormErrors, validateEventForm } from '../../../lib/event-form-errors';
import { useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type EventItem = { id: string; title: string; description: string; startsAt: string; location: string; onlineUrl?: string | null; capacity?: number | null; rsvpCounts: { going: number; maybe: number; declined: number } };
type Events = { events: EventItem[] };
type SortKey = 'title' | 'startsAt' | 'status';
type AdminEventsMode = 'create' | 'view';

const pageSizes = [5, 10, 20, 50];
const emptyForm = { title: '', description: '', startsAt: '', location: '', onlineUrl: '', capacity: '' };

export default function AdminEventsPage() {
  return <Suspense fallback={<AdminEventsPageFallback />}><AdminEventsPageContent /></Suspense>;
}

function AdminEventsPageContent() {
  const { lang, t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Events | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('startsAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [form, setForm] = useState(emptyForm);
  const [eventImage, setEventImage] = useState(() => initialEventImageSelection());
  const [fieldErrors, setFieldErrors] = useState<EventFormErrors>({});
  const [saving, setSaving] = useState(false);
  const selectedMode: AdminEventsMode = searchParams.get('mode') === 'view' ? 'view' : 'create';

  const errorLabels = {
    createSummary: t.admin.eventCreateFailed, updateSummary: t.admin.eventUpdateFailed, reviewFields: t.admin.eventReviewFields,
    titleRequired: t.admin.eventTitleRequired, descriptionRequired: t.admin.eventDescriptionRequired,
    dateRequired: t.admin.eventDateRequired, dateInvalid: t.admin.eventDateInvalid, locationRequired: t.admin.eventLocationRequired,
    capacityInvalid: t.admin.eventCapacityInvalid, imageInvalid: t.admin.eventImageServerInvalid,
    imageUrlInvalid: t.admin.eventImageInvalidUrl, imageTooLarge: t.admin.eventImageTooLarge,
    unauthorized: t.admin.eventUnauthorized, forbidden: t.admin.eventForbidden, conflict: t.admin.eventConflict,
    network: t.admin.eventNetworkError, server: t.admin.eventServerError,
  };

  function clearFieldError(field: keyof EventFormErrors) {
    setFieldErrors((current) => current[field] ? { ...current, [field]: undefined, form: field === 'form' ? undefined : current.form } : current);
  }

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Events>(`/admin/${COMMUNITY_ID}/events`));
    } catch {
      setError(t.common.error);
    }
  }

  useEffect(() => { load(); }, [t.common.error]);

  async function createEvent() {
    const clientErrors = validateEventForm(form, errorLabels);
    if (Object.keys(clientErrors).length) {
      setFieldErrors(clientErrors);
      toast.error(t.admin.eventCreateFailed, { description: t.admin.eventReviewFields });
      return;
    }
    const imageError = eventImageValidation(eventImage, { fileRequired: t.admin.eventImageRequired, invalidUrl: t.admin.eventImageInvalidUrl });
    if (imageError) {
      setFieldErrors({ image: imageError });
      toast.error(t.admin.eventCreateFailed, { description: imageError });
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/events`, { method: 'POST', body: eventRequestBody(form, eventImage) });
      setForm(emptyForm);
      setEventImage(initialEventImageSelection());
      setFieldErrors({});
      toast.success(t.admin.eventCreated);
      await load();
    } catch (error) {
      const failure = eventSubmissionError(error, 'create', errorLabels);
      setFieldErrors((current) => ({ ...current, [failure.field]: failure.detail }));
      toast.error(failure.summary, { description: failure.detail });
    } finally {
      setSaving(false);
    }
  }

  function selectMode(mode: AdminEventsMode) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('mode', mode);
    router.replace(`/admin/events?${next.toString()}`, { scroll: false });
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const now = Date.now();
    return (data?.events ?? []).filter((event) => {
      const status = new Date(event.startsAt).getTime() >= now ? 'upcoming' : 'past';
      return (filter === 'all' || status === filter) && `${event.title} ${event.location}`.toLowerCase().includes(normalized);
    }).sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      if (sortKey === 'status') return eventStatus(a).localeCompare(eventStatus(b));
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [data, filter, query, sortKey]);

  const total = filtered.length;
  const safePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.eventsTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.eventsSubtitle}</p>
          </div>
          <AdminEventsModeTabs selectedMode={selectedMode} onChange={selectMode} />
        </header>
        <div id="admin-events-create-panel" role="tabpanel" aria-labelledby="admin-events-create-tab" hidden={selectedMode !== 'create'} className="space-y-6">
        <Card className="rounded-2xl">
          <h2 className="text-base font-semibold text-white">{t.admin.createEvent}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Input label={t.admin.eventTitleLabel} value={form.title} error={fieldErrors.title} onChange={(value) => { setForm({ ...form, title: value }); clearFieldError('title'); }} />
            <Input label={t.admin.eventDateLabel} value={form.startsAt} error={fieldErrors.startsAt} type="datetime-local" onChange={(value) => { setForm({ ...form, startsAt: value }); clearFieldError('startsAt'); }} />
            <Input label={t.common.location} value={form.location} error={fieldErrors.location} onChange={(value) => { setForm({ ...form, location: value }); clearFieldError('location'); }} />
            <Input label={t.admin.eventOnlineUrlLabel} value={form.onlineUrl} error={fieldErrors.onlineUrl} onChange={(value) => { setForm({ ...form, onlineUrl: value }); clearFieldError('onlineUrl'); }} />
            <Input label={t.admin.eventCapacityLabel} value={form.capacity} error={fieldErrors.capacity} onChange={(value) => { setForm({ ...form, capacity: value }); clearFieldError('capacity'); }} />
            <label className="xl:col-span-3"><span className="text-sm text-[var(--app-muted-foreground)]">{t.admin.eventDescriptionLabel}</span><textarea value={form.description} aria-invalid={Boolean(fieldErrors.description)} onChange={(event) => { setForm({ ...form, description: event.target.value }); clearFieldError('description'); }} rows={3} className="mt-2 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2.5 text-sm text-[var(--app-foreground)] outline-none focus:border-[var(--app-accent)]" />{fieldErrors.description && <p role="alert" className="app-text-danger mt-1.5 text-xs">{fieldErrors.description}</p>}</label>
            <EventImageField className="xl:col-span-3" value={eventImage} onChange={(next) => { setEventImage(next); clearFieldError('image'); }} errorMessage={fieldErrors.image} disabled={saving} loading={saving && eventImage.mode === 'UPLOAD'} labels={{ title: t.admin.eventImageLabel, optional: t.admin.eventImageOptional, description: t.admin.eventImageDescription, noImage: t.admin.eventImageNone, emptyDescription: t.admin.eventImageEmptyDescription, upload: t.admin.eventImageUpload, useUrl: t.admin.eventImageUseUrl, url: t.admin.eventImageUrl, chooseFile: t.admin.eventImageChooseFile, replace: t.admin.eventImageReplace, remove: t.admin.eventImageRemove, preview: t.admin.eventImagePreview, apply: t.admin.eventImageApply, cancel: t.common.cancel, supportedFiles: t.admin.eventImageSupportedFiles, loadFailed: t.admin.eventImageLoadFailed, saving: t.admin.eventImageSaving, invalidType: t.admin.eventImageInvalidType, tooLarge: t.admin.eventImageTooLarge, invalidUrl: t.admin.eventImageInvalidUrl }} />
          </div>
          {fieldErrors.form && <p role="alert" className="app-text-danger mt-3 text-sm">{fieldErrors.form}</p>}
          <LoadingButton loading={saving} loadingLabel={t.admin.updatingMember} onClick={createEvent} className="mt-4">{t.admin.createEvent}</LoadingButton>
        </Card>
        <Card className="rounded-2xl p-0">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block max-w-md flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.dashboard.eventSearch} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/60" /></label>
            <div className="flex flex-wrap gap-2">
              <AppSelect
                value={filter}
                options={[
                  { value: 'all', label: t.dashboard.allEvents },
                  { value: 'upcoming', label: t.dashboard.upcomingEvents },
                  { value: 'past', label: t.dashboard.pastEvents },
                ]}
                onChange={(value) => { setFilter(value); setPage(1); }}
              />
              <AppSelect
                value={sortKey}
                options={[
                  { value: 'startsAt', label: t.admin.sortDate },
                  { value: 'title', label: t.admin.sortTitle },
                  { value: 'status', label: t.admin.sortEventStatus },
                ]}
                onChange={setSortKey}
              />
            </div>
          </div>
          {error ? <div className="p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /></div> : !data ? <div className="p-4"><TableSkeleton rows={5} columns={6} /></div> : rows.length === 0 ? <div className="p-4"><TableEmptyState title={query || filter !== 'all' ? t.dashboard.noMatchingEvents : t.dashboard.noEvents} /></div> : (
            <>
              <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42"><tr><Header label={t.admin.eventTitleLabel} /><Header label={t.admin.eventDateLabel} /><Header label={t.common.location} /><Header label={t.common.status} /><Header label={t.dashboard.rsvp} /><Header label={t.common.actions} /></tr></thead><tbody className="divide-y divide-white/10">{rows.map((event) => <tr key={event.id} className="hover:bg-white/[0.025]"><td className="px-4 py-4 font-medium text-white">{event.title}</td><td className="px-4 py-4 text-white/58">{formatDate(event.startsAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</td><td className="px-4 py-4 text-white/58">{event.location}</td><td className="px-4 py-4"><StatusBadge tone={eventStatus(event) === 'upcoming' ? 'good' : 'neutral'}>{eventStatus(event) === 'upcoming' ? t.dashboard.upcomingEvents : t.dashboard.pastEvents}</StatusBadge></td><td className="px-4 py-4 text-white/58">{event.rsvpCounts.going} / {event.rsvpCounts.maybe} / {event.rsvpCounts.declined}</td><td className="px-4 py-4"><Link href={`/admin/events/${event.id}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent">{t.admin.viewDetails}</Link></td></tr>)}</tbody></table></div>
              <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
            </>
          )}
        </Card>
        </div>
        <div id="admin-events-view-panel" role="tabpanel" aria-labelledby="admin-events-view-tab" hidden={selectedMode !== 'view'}><EventBrowseView /></div>
      </div>
    </AppShell>
  );
}

function AdminEventsModeTabs({ selectedMode, onChange }: { selectedMode: AdminEventsMode; onChange: (mode: AdminEventsMode) => void }) {
  const { t } = useI18n();
  const modes = [
    { key: 'create' as const, label: t.admin.eventsCreateMode },
    { key: 'view' as const, label: t.admin.eventsViewMode },
  ];

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % modes.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + modes.length) % modes.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = modes.length - 1;
    else return;
    event.preventDefault();
    const nextMode = modes[nextIndex].key;
    onChange(nextMode);
    document.getElementById(`admin-events-${nextMode}-tab`)?.focus();
  }

  return (
    <nav role="tablist" aria-label={t.admin.eventsTitle} className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
      {modes.map((mode, index) => {
        const active = selectedMode === mode.key;
        return <button key={mode.key} id={`admin-events-${mode.key}-tab`} type="button" role="tab" aria-selected={active} aria-controls={`admin-events-${mode.key}-panel`} tabIndex={active ? 0 : -1} onClick={() => onChange(mode.key)} onKeyDown={(event) => selectFromKeyboard(event, index)} className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? 'bg-accent/15 text-accent' : 'text-white/60 hover:bg-white/[0.05] hover:text-white'}`}>{mode.label}</button>;
      })}
    </nav>
  );
}

function AdminEventsPageFallback() {
  return <AppShell admin><div className="space-y-6"><TableSkeleton rows={6} columns={6} /></div></AppShell>;
}

function eventStatus(event: EventItem) { return new Date(event.startsAt).getTime() >= Date.now() ? 'upcoming' : 'past'; }
function Header({ label }: { label: string }) { return <th className="px-4 py-3 font-medium"><span className="inline-flex items-center gap-2">{label}<ArrowUpDown size={13} /></span></th>; }
function Input({ label, value, error, type = 'text', onChange }: { label: string; value: string; error?: string; type?: string; onChange: (value: string) => void }) { return <label><span className="text-sm text-[var(--app-muted-foreground)]">{label}</span><input type={type} value={value} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2.5 text-sm text-[var(--app-foreground)] outline-none focus:border-[var(--app-accent)]" />{error && <p role="alert" className="app-text-danger mt-1.5 text-xs">{error}</p>}</label>; }
