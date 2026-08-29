'use client';

import { Mail, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../../components/app-select';
import { IdentityVerificationBadge } from '../../../../components/identity-verification-badge';
import { AppShell } from '../../../../components/shell';
import { Card, ConfirmDialog, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { identityVerificationForRole } from '../../../../lib/identity-verification';
import { statusLabel, useI18n } from '../../../../lib/i18n';
import { PERMISSIONS, hasPermission } from '../../../../lib/permissions';
import { formatDate } from '../../../../lib/utils';
import { EventTaskBoard } from './event-task-board';

type EventItem = { id: string; title: string; description: string; startsAt: string; location: string; onlineUrl?: string | null; capacity?: number | null; rsvpCounts: { going: number; maybe: number; declined: number } };
type Rsvp = { id: string; status: string; updatedAt: string; user: { name: string; email: string; role?: string | null } };
type RsvpResponse = { event: EventItem; rsvps: Rsvp[] };
type EmailSettings = { available: boolean };
type CurrentUser = { role: string; permissions?: string[] };

export default function AdminEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang, t } = useI18n();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [form, setForm] = useState({ title: '', description: '', startsAt: '', location: '', onlineUrl: '', capacity: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [emailForm, setEmailForm] = useState({ recipientGroup: 'all', subject: '', message: '' });
  const [emailing, setEmailing] = useState(false);
  async function load() {
    setError('');
    try {
      const user = await apiFetch<CurrentUser>('/auth/me');
      const detail = await apiFetch<EventItem>(`/admin/${COMMUNITY_ID}/events/${id}`);
      const rsvpData = await apiFetch<RsvpResponse>(`/admin/${COMMUNITY_ID}/events/${id}/rsvps`);
      const emailData = hasPermission(user, PERMISSIONS.settingsSmtpManage)
        ? await apiFetch<EmailSettings>(`/admin/${COMMUNITY_ID}/settings/email`)
        : null;
      setCurrentUser(user);
      setEvent(detail);
      setRsvps(rsvpData.rsvps);
      setEmailSettings(emailData);
      setForm({ title: detail.title, description: detail.description, startsAt: toLocalInput(detail.startsAt), location: detail.location, onlineUrl: detail.onlineUrl ?? '', capacity: detail.capacity ? String(detail.capacity) : '' });
    } catch {
      setError(t.admin.eventDetailLoadFailed);
    }
  }

  useEffect(() => { void load(); }, [id, t.admin.eventDetailLoadFailed]);

  async function save() {
    if (!form.title.trim() || !form.description.trim() || !form.location.trim() || !form.startsAt.trim()) {
      toast.error(t.admin.eventValidationFailed);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/events/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      toast.success(t.admin.eventUpdated);
      await load();
    } catch {
      toast.error(t.admin.eventUpdateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/events/${id}`, { method: 'DELETE' });
      router.push('/admin/events');
    } catch {
      toast.error(t.admin.eventDeleteFailed);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function emailAttendees() {
    if (emailing || !canEmailAttendees) return;
    setEmailing(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/events/${id}/email-attendees`, { method: 'POST', body: JSON.stringify(emailForm) });
      toast.success(t.admin.emailCampaignQueued);
      setEmailForm({ recipientGroup: 'all', subject: '', message: '' });
    } catch {
      toast.error(t.admin.emailCampaignFailed);
    } finally {
      setEmailing(false);
    }
  }
  const canEmailAttendees = hasPermission(currentUser, PERMISSIONS.eventsEmailAttendees);
  const canManageEventTasks = hasPermission(currentUser, PERMISSIONS.eventsUpdate);
  const canArchiveEventTasks = hasPermission(currentUser, PERMISSIONS.eventsDelete);

  return (
    <AppShell admin>
      <div className="space-y-6">
        <Link href="/admin/events" className="text-sm font-semibold text-white/55 transition hover:text-accent">{t.common.back}</Link>
        {error ? <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /> : !event ? <TableSkeleton rows={6} columns={2} /> : (
          <>
            <header className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-5 shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{event.title}</h1><p className="mt-2 text-sm text-white/55">{formatDate(event.startsAt, lang === 'fr' ? 'fr-FR' : 'en-US')} · {event.location}</p></div><StatusBadge tone={new Date(event.startsAt).getTime() >= Date.now() ? 'good' : 'neutral'}>{new Date(event.startsAt).getTime() >= Date.now() ? t.dashboard.upcomingEvents : t.dashboard.pastEvents}</StatusBadge></div>
            </header>
            <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
              <Card className="rounded-2xl">
                <h2 className="text-base font-semibold text-white">{t.admin.editEvent}</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Input label={t.admin.eventTitleLabel} value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
                  <Input label={t.admin.eventDateLabel} type="datetime-local" value={form.startsAt} onChange={(value) => setForm({ ...form, startsAt: value })} />
                  <Input label={t.common.location} value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
                  <Input label={t.admin.eventOnlineUrlLabel} value={form.onlineUrl} onChange={(value) => setForm({ ...form, onlineUrl: value })} />
                  <Input label={t.admin.eventCapacityLabel} value={form.capacity} onChange={(value) => setForm({ ...form, capacity: value })} />
                  <label className="md:col-span-2"><span className="text-sm text-white/70">{t.admin.eventDescriptionLabel}</span><textarea value={form.description} onChange={(input) => setForm({ ...form, description: input.target.value })} rows={5} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" /></label>
                </div>
                <div className="mt-5 flex flex-wrap gap-2"><LoadingButton loading={saving} loadingLabel={t.admin.updatingMember} disabled={saving || deleting} onClick={save}>{t.admin.editEvent}</LoadingButton><LoadingButton loading={deleting} loadingLabel={t.admin.deletingEvent} disabled={saving || deleting} onClick={() => setConfirmDelete(true)} className="border border-rose-200/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15"><Trash2 size={16} />{t.admin.deleteEvent}</LoadingButton></div>
              </Card>
              <aside className="space-y-6">
                <Card className="rounded-2xl"><h2 className="text-base font-semibold text-white">{t.dashboard.rsvpSummary}</h2><div className="mt-4 grid gap-2 text-sm text-white/60"><p>{event.rsvpCounts.going} {t.dashboard.going}</p><p>{event.rsvpCounts.maybe} {t.dashboard.maybe}</p><p>{event.rsvpCounts.declined} {t.dashboard.notGoing}</p>{event.capacity ? <p>{t.dashboard.capacity}: {event.capacity}</p> : null}</div></Card>
                <Card className="rounded-2xl">
                  <h2 className="text-base font-semibold text-white">{t.admin.emailAttendees}</h2>
                  <div className="mt-4 space-y-3">
                    <AppSelect value={emailForm.recipientGroup} label={t.admin.recipientGroup} options={[{ value: 'all', label: t.admin.allRsvps }, { value: 'GOING', label: t.dashboard.going }, { value: 'MAYBE', label: t.dashboard.maybe }, { value: 'DECLINED', label: t.dashboard.notGoing }]} onChange={(value) => setEmailForm({ ...emailForm, recipientGroup: value })} />
                    <Input label={t.admin.emailSubject} value={emailForm.subject} onChange={(value) => setEmailForm({ ...emailForm, subject: value })} />
                    <label><span className="text-sm text-white/70">{t.admin.emailMessage}</span><textarea value={emailForm.message} onChange={(input) => setEmailForm({ ...emailForm, message: input.target.value })} rows={4} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" /></label>
                    {emailSettings && !emailSettings.available && <p className="text-sm text-amber-100/80">{t.admin.smtpUnavailable}</p>}
                    <LoadingButton loading={emailing} loadingLabel={t.admin.queueingEmail} disabled={!canEmailAttendees || emailing || (emailSettings ? !emailSettings.available : false)} onClick={emailAttendees} className="w-full">{t.admin.queueEmail}</LoadingButton>
                  </div>
                </Card>
                <Card className="rounded-2xl"><h2 className="text-base font-semibold text-white">{t.dashboard.rsvpList}</h2>{rsvps.length ? <div className="mt-4 space-y-3">{rsvps.map((rsvp) => <div key={rsvp.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="flex items-center gap-1.5 font-medium text-white"><span>{rsvp.user.name}</span><IdentityVerificationBadge kind={identityVerificationForRole(rsvp.user.role)} size="xs" /></p><p className="mt-1 flex items-center gap-2 text-xs text-white/45"><Mail size={13} />{rsvp.user.email}</p><div className="mt-3"><StatusBadge tone={rsvp.status === 'GOING' ? 'good' : rsvp.status === 'MAYBE' ? 'warn' : 'bad'}>{statusLabel(t, rsvp.status)}</StatusBadge></div></div>)}</div> : <div className="mt-4"><TableEmptyState title={t.common.empty} /></div>}</Card>
              </aside>
            </div>
            <EventTaskBoard eventId={id} canManage={canManageEventTasks} canArchive={canArchiveEventTasks} />
          </>
        )}
        <ConfirmDialog open={confirmDelete} title={t.admin.deleteEventConfirmTitle} description={t.admin.deleteEventConfirmDescription} confirmLabel={t.admin.deleteEvent} cancelLabel={t.common.cancel} loading={deleting} onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
      </div>
    </AppShell>
  );
}

function toLocalInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function Input({ label, value, type = 'text', onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) { return <label><span className="text-sm text-white/70">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" /></label>; }
