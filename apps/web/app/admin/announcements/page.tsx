'use client';

import { ArrowUpDown, Edit3, Eye, Heart, Megaphone, MessageCircle, Search, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { AppShell } from '../../../components/shell';
import { Card, DataTablePagination, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { statusLabel, useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type AnnouncementAuthorMode = 'USER' | 'COMMUNITY_TEAM';
type Announcement = {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  authorMode: AnnouncementAuthorMode;
  publishedAt?: string | null;
  updatedAt: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  readCount: number;
};

type SortKey = 'title' | 'status' | 'updatedAt';
type FormState = { id?: string; title: string; body: string; authorMode: AnnouncementAuthorMode };
type EmailSettings = { available: boolean };
type CurrentUser = { role: string };

const emptyForm: FormState = { title: '', body: '', authorMode: 'USER' };
const pageSizes = [5, 10, 20, 50];

export default function AdminAnnouncementsPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Announcement[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | AnnouncementStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState('');
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [emailActiveMembers, setEmailActiveMembers] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const canPublishAsCommunityTeam = ['owner', 'admin'].includes(currentUser?.role.toLowerCase() ?? '');

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Announcement[]>(`/admin/${COMMUNITY_ID}/announcements`));
      setEmailSettings(await apiFetch<EmailSettings>(`/admin/${COMMUNITY_ID}/settings/email`));
    } catch {
      setError(t.admin.announcementsLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.admin.announcementsLoadFailed]);

  useEffect(() => {
    void apiFetch<CurrentUser>('/auth/me').then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...(data ?? [])].filter((item) => {
      const matchesText = `${item.title} ${item.body}`.toLowerCase().includes(normalized);
      const matchesStatus = status === 'all' || item.status === status;
      return matchesText && matchesStatus;
    }).sort((a, b) => {
      const values: Record<SortKey, [string | number, string | number]> = {
        title: [a.title, b.title],
        status: [statusLabel(t, a.status), statusLabel(t, b.status)],
        updatedAt: [new Date(a.updatedAt ?? a.createdAt).getTime(), new Date(b.updatedAt ?? b.createdAt).getTime()],
      };
      const [left, right] = values[sortKey];
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, query, sortDirection, sortKey, status, t]);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(nextKey: SortKey) {
    setPage(1);
    if (nextKey === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'updatedAt' ? 'desc' : 'asc');
    }
  }

  function editAnnouncement(item: Announcement) {
    setForm({ id: item.id, title: item.title, body: item.body, authorMode: item.authorMode });
    setValidation('');
  }

  async function saveDraft() {
    if (saving) return;
    setValidation('');
    if (!form.title.trim() || !form.body.trim()) {
      setValidation(t.admin.announcementValidationFailed);
      return;
    }
    setSaving(true);
    try {
      const path = form.id ? `/admin/${COMMUNITY_ID}/announcements/${form.id}` : `/admin/${COMMUNITY_ID}/announcements`;
      const method = form.id ? 'PATCH' : 'POST';
      const saved = await apiFetch<Announcement>(path, { method, body: JSON.stringify({
        title: form.title,
        body: form.body,
        ...(canPublishAsCommunityTeam ? { authorMode: form.authorMode } : {}),
      }) });
      setData((current) => {
        if (!current) return [saved];
        return form.id ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current];
      });
      setForm(emptyForm);
      toast.success(t.admin.announcementSaved);
    } catch {
      toast.error(t.admin.announcementSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function publish(id: string) {
    if (publishingId) return;
    setPublishingId(id);
    try {
      const published = await apiFetch<Announcement>(`/admin/${COMMUNITY_ID}/announcements/${id}/publish`, { method: 'POST', body: JSON.stringify({ emailActiveMembers }) });
      setData((current) => current ? current.map((item) => item.id === published.id ? published : item) : current);
      toast.success(emailActiveMembers ? t.admin.announcementPublishedEmailQueued : t.admin.announcementPublished);
    } catch {
      toast.error(t.admin.announcementPublishFailed);
    } finally {
      setPublishingId('');
    }
  }

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/90">{t.admin.operations}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.announcementsTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.announcementsSubtitle}</p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(6,78,59,0.24))] shadow-2xl shadow-black/20">
          <div className="border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <Megaphone size={19} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white sm:text-xl">{form.id ? t.admin.editAnnouncement : t.admin.createAnnouncement}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/55">{t.admin.announcementFormDescription}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:gap-6">
            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-white/72">{t.admin.announcementTitleLabel}</span>
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
              </label>

              <label className={`flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/70 transition ${emailSettings?.available ? 'cursor-pointer hover:border-accent/25 hover:bg-accent/[0.06]' : 'cursor-not-allowed opacity-65'}`}>
                <input type="checkbox" checked={emailActiveMembers} disabled={!emailSettings?.available} onChange={(event) => setEmailActiveMembers(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#5ed29c]" />
                <span className="min-w-0">
                  <span className="block font-semibold text-white">{t.admin.emailActiveMembers}</span>
                  <span className="mt-1 block leading-6 text-white/50">{emailSettings?.available ? t.admin.emailActiveMembersDescription : t.admin.smtpUnavailable}</span>
                </span>
              </label>

              {canPublishAsCommunityTeam ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/70 transition hover:border-accent/25 hover:bg-accent/[0.06]">
                  <input type="checkbox" checked={form.authorMode === 'COMMUNITY_TEAM'} onChange={(event) => setForm((current) => ({ ...current, authorMode: event.target.checked ? 'COMMUNITY_TEAM' : 'USER' }))} className="mt-1 h-4 w-4 shrink-0 accent-[#5ed29c]" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-white">{t.admin.publishAsCommunityTeam}</span>
                    <span className="mt-1 block leading-6 text-white/50">{t.admin.publishAsCommunityTeamDescription}</span>
                  </span>
                </label>
              ) : null}
            </div>

            <label className="block min-w-0">
              <span className="text-sm font-medium text-white/72">{t.admin.announcementBodyLabel}</span>
              <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} rows={8} className="mt-2 min-h-52 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm leading-6 text-white outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/10" />
            </label>
          </div>

          {validation && <p className="mx-5 mb-5 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100 sm:mx-6">{validation}</p>}

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-black/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {form.id && <button onClick={() => { setForm(emptyForm); setValidation(''); }} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/72 transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-accent/20">{t.common.cancel}</button>}
            <LoadingButton loading={saving} loadingLabel={t.admin.savingDraft} onClick={saveDraft}>
              {t.admin.saveDraft}
            </LoadingButton>
          </div>
        </section>

        <div>
          <Card className="flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0 shadow-2xl shadow-black/25">
            <div className="shrink-0 flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block max-w-md flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
                <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.admin.searchAnnouncements} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/60" />
              </label>
              <AppSelect
                value={status}
                label={t.admin.filterByStatus}
                options={[
                  { value: 'all', label: t.common.all },
                  { value: 'DRAFT', label: statusLabel(t, 'DRAFT') },
                  { value: 'PUBLISHED', label: statusLabel(t, 'PUBLISHED') },
                  { value: 'ARCHIVED', label: statusLabel(t, 'ARCHIVED') },
                ]}
                onChange={(value) => { setStatus(value); setPage(1); }}
              />
            </div>

            {error ? (
              <div className="min-h-0 flex-1 p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /></div>
            ) : !data ? (
              <div className="min-h-0 flex-1 p-4"><TableSkeleton rows={5} columns={5} /></div>
            ) : pageRows.length === 0 ? (
              <div className="min-h-0 flex-1 p-4"><TableEmptyState title={query || status !== 'all' ? t.admin.noMatchingAnnouncements : t.admin.noAnnouncements} /></div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                      <tr>
                        <SortableHeader label={t.admin.tableTitle} active={sortKey === 'title'} onClick={() => toggleSort('title')} />
                        <th className="px-4 py-3 font-medium">{t.admin.tablePreview}</th>
                        <SortableHeader label={t.admin.tableStatus} active={sortKey === 'status'} onClick={() => toggleSort('status')} />
                        <SortableHeader label={t.admin.tableUpdated} active={sortKey === 'updatedAt'} onClick={() => toggleSort('updatedAt')} />
                        <th className="px-4 py-3 font-medium">{t.admin.tableActions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {pageRows.map((item) => (
                        <tr key={item.id} className="transition hover:bg-white/[0.025]">
                          <td className="px-4 py-4 font-medium text-white">{item.title}</td>
                          <td className="max-w-sm px-4 py-4">
                            <div className="space-y-2">
                              <span className="line-clamp-2 text-white/58">{item.body}</span>
                              <div className="flex items-center gap-4 text-xs text-white/42">
                                <span className="inline-flex items-center gap-1.5" title={t.admin.likesCountLabel(item.likeCount)} aria-label={t.admin.likesCountLabel(item.likeCount)}><Heart size={14} /><span className="tabular-nums">{item.likeCount}</span></span>
                                <span className="inline-flex items-center gap-1.5" title={t.admin.commentsCountLabel(item.commentCount)} aria-label={t.admin.commentsCountLabel(item.commentCount)}><MessageCircle size={14} /><span className="tabular-nums">{item.commentCount}</span></span>
                                <span className="inline-flex items-center gap-1.5" title={t.admin.readCountLabel(item.readCount)} aria-label={t.admin.readCountLabel(item.readCount)}><Eye size={14} /><span className="tabular-nums">{item.readCount}</span></span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4"><StatusBadge tone={item.status === 'PUBLISHED' ? 'good' : item.status === 'DRAFT' ? 'warn' : 'neutral'}>{statusLabel(t, item.status)}</StatusBadge></td>
                          <td className="px-4 py-4 text-white/58">{formatDate(item.updatedAt ?? item.createdAt, locale)}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => editAnnouncement(item)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent">
                                <Edit3 size={13} />
                                {t.common.edit}
                              </button>
                              <Link href={`/admin/announcements/${item.id}`} className="inline-flex items-center rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent">{t.admin.viewReport}</Link>
                              {item.status !== 'PUBLISHED' && (
                                <LoadingButton loading={publishingId === item.id} loadingLabel={t.admin.publishingAnnouncement} disabled={Boolean(publishingId)} onClick={() => publish(item.id)} className="gap-1.5 px-3 py-1.5 text-xs">
                                  <Send size={13} />
                                  {t.admin.publishAnnouncement}
                                </LoadingButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="shrink-0">
                  <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function SortableHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={onClick} className={`inline-flex items-center gap-2 transition hover:text-white ${active ? 'text-accent' : ''}`}>
        {label}
        <ArrowUpDown size={13} />
      </button>
    </th>
  );
}
