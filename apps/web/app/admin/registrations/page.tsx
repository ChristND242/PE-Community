'use client';

import { ArrowUpDown, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { AppShell } from '../../../components/shell';
import { Button, Card, ConfirmDialog, DataTablePagination, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { statusLabel, useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type Application = { id: string; name: string; email: string; note: string; status: string; createdAt: string; reviewedAt?: string | null; submissionAttemptCount: number; lastSubmissionAttemptAt: string; lastNotificationSuppressionReason?: string | null };
type SortKey = 'name' | 'createdAt';
type ReviewAction = 'approve' | 'reject';

const pageSizes = [5, 10, 20, 50];

export default function RegistrationsPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Application[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pendingReview, setPendingReview] = useState<{ id: string; action: ReviewAction } | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: ReviewAction } | null>(null);

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Application[]>(`/admin/${COMMUNITY_ID}/registrations`));
    } catch {
      setError(t.common.error);
    }
  }

  useEffect(() => {
    load();
  }, [t.common.error]);

  // Client-side table state for the current admin slice. The data is still fetched
  // from the real API and can be moved server-side later via query parameters.
  const sortedApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = (data ?? []).filter((application) => {
      const matchesSearch = `${application.name} ${application.email}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === 'ALL' || application.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    return [...filtered].sort((a, b) => {
      const result = sortKey === 'name'
        ? a.name.localeCompare(b.name)
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, query, sortDirection, sortKey, statusFilter]);

  const total = sortedApplications.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageRows = sortedApplications.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(nextKey: SortKey) {
    setPage(1);
    if (nextKey === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'createdAt' ? 'desc' : 'asc');
    }
  }

  function requestReview(application: Application, action: ReviewAction) {
    if (application.status !== 'PENDING') {
      toast.error(t.admin.applicationNotPending);
      return;
    }
    setConfirming({ id: application.id, action });
  }

  async function confirmReview() {
    if (!confirming) return;
    const application = data?.find((item) => item.id === confirming.id);
    if (!application || application.status !== 'PENDING') {
      toast.error(t.admin.applicationNotPending);
      setConfirming(null);
      return;
    }
    setPendingReview(confirming);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/registrations/${confirming.id}/${confirming.action}`, {
        method: 'POST',
        body: JSON.stringify({ reason: confirming.action === 'reject' ? t.admin.rejectReason : undefined }),
      });
      toast.success(confirming.action === 'approve' ? t.admin.approvalSuccess : t.admin.rejectionSuccess);
      await load();
    } catch {
      toast.error(confirming.action === 'approve' ? t.admin.approvalFailed : t.admin.rejectionFailed);
    } finally {
      setPendingReview(null);
      setConfirming(null);
    }
  }

  const confirmAction = confirming?.action;

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.registrationsTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.registrationsSubtitle}</p>
        </header>

        <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 xl:flex-row xl:items-center xl:justify-between">
            <label className="relative block max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.admin.searchRegistrations} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/60" />
            </label>
            <div className="flex flex-wrap gap-3">
              <AppSelect
                value={statusFilter}
                label={t.admin.filterByStatus}
                options={[
                  { value: 'ALL', label: t.common.all },
                  { value: 'PENDING', label: statusLabel(t, 'PENDING') },
                  { value: 'APPROVED', label: statusLabel(t, 'APPROVED') },
                  { value: 'REJECTED', label: statusLabel(t, 'REJECTED') },
                  { value: 'SUPERSEDED', label: statusLabel(t, 'SUPERSEDED') },
                ]}
                onChange={(value) => { setStatusFilter(value); setPage(1); }}
              />
              <AppSelect
                value={sortKey}
                label={t.admin.sortBy}
                options={[
                  { value: 'createdAt', label: t.admin.sortSubmitted },
                  { value: 'name', label: t.admin.sortName },
                ]}
                onChange={(value) => { setSortKey(value); setPage(1); }}
              />
            </div>
          </div>

          {error ? (
            <div className="p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /></div>
          ) : !data ? (
            <div className="p-4"><TableSkeleton rows={5} columns={7} /></div>
          ) : pageRows.length === 0 ? (
            <div className="p-4"><TableEmptyState title={query || statusFilter !== 'ALL' ? t.admin.noMatchingRegistrations : t.admin.noRegistrations} description={query ? t.admin.searchRegistrations : undefined} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                    <tr>
                      <SortableHeader label={t.admin.tableApplicant} active={sortKey === 'name'} onClick={() => toggleSort('name')} />
                      <th className="px-4 py-3 font-medium">{t.admin.tableEmail}</th>
                      <th className="px-4 py-3 font-medium">{t.admin.tableRequest}</th>
                      <th className="px-4 py-3 font-medium">{t.admin.tableStatus}</th>
                      <th className="px-4 py-3 font-medium">{t.admin.submissionAttempts}</th>
                      <SortableHeader label={t.admin.tableSubmitted} active={sortKey === 'createdAt'} onClick={() => toggleSort('createdAt')} />
                      <th className="px-4 py-3 font-medium">{t.admin.tableReviewed}</th>
                      <th className="px-4 py-3 font-medium">{t.admin.tableActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {pageRows.map((item) => {
                      const approving = pendingReview?.id === item.id && pendingReview.action === 'approve';
                      const rejecting = pendingReview?.id === item.id && pendingReview.action === 'reject';
                      return (
                        <tr key={item.id} className="align-top transition hover:bg-white/[0.025]">
                          <td className="px-4 py-4 font-medium text-white">{item.name}</td>
                          <td className="px-4 py-4 text-white/58">{item.email}</td>
                          <td className="w-[22rem] max-w-sm px-4 py-4 text-white/58"><RegistrationNote note={item.note} moreLabel={t.admin.requestNoteMore} lessLabel={t.admin.requestNoteLess} /></td>
                          <td className="px-4 py-4"><StatusBadge tone={item.status === 'PENDING' ? 'warn' : item.status === 'APPROVED' ? 'good' : item.status === 'SUPERSEDED' ? 'neutral' : 'bad'}>{statusLabel(t, item.status)}</StatusBadge>{item.status === 'SUPERSEDED' && <p className="mt-2 max-w-48 text-xs leading-5 text-white/40">{t.admin.supersededRegistrationDescription}</p>}</td>
                          <td className="px-4 py-4 text-white/58"><span className="font-semibold text-white/78">{item.submissionAttemptCount}</span><span className="mt-1 block text-xs text-white/40">{formatDate(item.lastSubmissionAttemptAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>{item.lastNotificationSuppressionReason && <span className="app-text-warning mt-1 block text-xs font-medium">{t.admin.notificationSuppressed}</span>}</td>
                          <td className="px-4 py-4 text-white/58">{formatDate(item.createdAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</td>
                          <td className="px-4 py-4 text-white/58">{item.reviewedAt ? formatDate(item.reviewedAt, lang === 'fr' ? 'fr-FR' : 'en-US') : '—'}</td>
                          <td className="px-4 py-4">
                            {item.status === 'PENDING' ? (
                              <div className="flex gap-2">
                                <LoadingButton loading={approving} loadingLabel={t.admin.approving} onClick={() => requestReview(item, 'approve')} disabled={!!pendingReview}>{t.common.approve}</LoadingButton>
                                <LoadingButton loading={rejecting} loadingLabel={t.admin.rejecting} className="bg-rose-300 text-background hover:bg-rose-200" onClick={() => requestReview(item, 'reject')} disabled={!!pendingReview}>{t.common.reject}</LoadingButton>
                              </div>
                            ) : (
                              <span className="text-xs text-white/40">{t.admin.noActionAvailable}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
            </>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={!!confirming}
        title={confirmAction === 'approve' ? t.admin.approveConfirmTitle : t.admin.rejectConfirmTitle}
        description={confirmAction === 'approve' ? t.admin.approveConfirmDescription : t.admin.rejectConfirmDescription}
        confirmLabel={confirmAction === 'approve' ? t.common.approve : t.common.reject}
        cancelLabel={t.common.cancel}
        loading={!!pendingReview}
        onCancel={() => setConfirming(null)}
        onConfirm={confirmReview}
      />
    </AppShell>
  );
}

function RegistrationNote({ note, moreLabel, lessLabel }: { note: string; moreLabel: string; lessLabel: string }) {
  const noteRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    if (expanded) return;
    const element = noteRef.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, note]);

  return (
    <div className="min-w-0">
      <p ref={noteRef} className={`whitespace-pre-wrap break-words leading-5 ${expanded ? '' : 'line-clamp-4'}`}>{note}</p>
      {(truncated || expanded) && (
        <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-1 cursor-pointer text-xs font-semibold text-emerald-300 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/35">
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
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
