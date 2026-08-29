'use client';

import { ArrowLeft, Clock3, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppSelect } from '../../../../components/app-select';
import { IdentityVerificationBadge } from '../../../../components/identity-verification-badge';
import { ProfilePhoto } from '../../../../components/profile-photo';
import { AppShell } from '../../../../components/shell';
import { DataTablePagination, TableEmptyState, TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { identityVerificationForRole } from '../../../../lib/identity-verification';
import { useI18n } from '../../../../lib/i18n';
import { formatDate } from '../../../../lib/utils';

type AuditActor = { id: string | null; name: string; email: string | null; type?: string; recordedRole?: string | null; currentRole?: string | null; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null };
type AuditTarget = { type: string; id: string; label: string; recordedLabel?: string | null };
type AuditSummary = {
  id: string;
  action: string;
  category: string;
  outcome: string;
  severity: string;
  actor: AuditActor;
  target: AuditTarget;
  createdAt: string;
};
type AuditDetail = AuditSummary & {
  communityId: string;
  reason: string | null;
  changes: Array<{ field: string; from: string | null; to: string | null }>;
  requestContext: Array<{ key: string; value: string }>;
  metadata: Array<{ key: string; value: string }>;
};
type AuditList = {
  items: AuditSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: {
    categories: string[];
    actions: Array<{ value: string; count: number }>;
    targetTypes: Array<{ value: string; count: number }>;
    actors: Array<{ id: string; name: string; email: string }>;
  };
  timezone: string;
};
type FilterState = { search: string; category: string; action: string; outcome: string; actorId: string; targetType: string; range: string; from: string; to: string; page: number; pageSize: number };

const initialFilters: FilterState = { search: '', category: '', action: '', outcome: '', actorId: '', targetType: '', range: '30d', from: '', to: '', page: 1, pageSize: 20 };

export default function AdminAuditLogsPage() {
  const { lang, t } = useI18n();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [searchDraft, setSearchDraft] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<AuditList | null>(null);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  const readUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const page = Number(params.get('page'));
    const pageSize = Number(params.get('pageSize'));
    const next = {
      search: params.get('search') ?? '', category: params.get('category') ?? '', action: params.get('action') ?? '',
      outcome: params.get('outcome') ?? '', actorId: params.get('actorId') ?? '', targetType: params.get('targetType') ?? '',
      range: params.get('range') ?? '30d', from: params.get('from') ?? '', to: params.get('to') ?? '', page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize: [10, 20, 50].includes(pageSize) ? pageSize : 20,
    };
    setFilters(next);
    setSearchDraft(next.search);
    setSelectedId(params.get('logId'));
  }, []);

  useEffect(() => {
    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, [readUrl]);

  const writeUrl = useCallback((nextFilters: FilterState, logId: string | null, mode: 'push' | 'replace') => {
    const params = new URLSearchParams();
    Object.entries(nextFilters).forEach(([key, value]) => {
      if (value !== '' && value !== 1 && !(key === 'pageSize' && value === 20) && !(key === 'range' && value === '30d')) params.set(key, String(value));
    });
    if (logId) params.set('logId', logId);
    const nextUrl = `${window.location.pathname}${params.size ? `?${params}` : ''}`;
    window.history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', nextUrl);
  }, []);

  const updateFilters = useCallback((patch: Partial<FilterState>) => {
    setFilters((current) => {
      const next = { ...current, ...patch, page: patch.page ?? 1 };
      writeUrl(next, selectedId, 'replace');
      return next;
    });
  }, [selectedId, writeUrl]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchDraft !== filters.search) updateFilters({ search: searchDraft });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters.search, searchDraft, updateFilters]);

  const load = useCallback(async () => {
    const requestId = ++listRequest.current;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === '' || (key === 'range' && value === 'custom' && !filters.from && !filters.to)) return;
      params.set(key, String(value));
    });
    try {
      const response = await apiFetch<AuditList>(`/admin/${COMMUNITY_ID}/audit-logs?${params}`);
      if (requestId === listRequest.current) setData(response);
    } catch {
      if (requestId === listRequest.current) setError(true);
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(false); return; }
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError(false);
    apiFetch<AuditDetail>(`/admin/${COMMUNITY_ID}/audit-logs/${encodeURIComponent(selectedId)}`)
      .then((response) => { if (requestId === detailRequest.current) setDetail(response); })
      .catch(() => { if (requestId === detailRequest.current) { setDetail(null); setDetailError(true); } })
      .finally(() => { if (requestId === detailRequest.current) setDetailLoading(false); });
  }, [selectedId]);

  const selectLog = (id: string | null) => {
    setSelectedId(id);
    writeUrl(filters, id, 'push');
  };
  const showing = data && data.pagination.total
    ? t.admin.auditLogsShowing
        .replace('{from}', String((data.pagination.page - 1) * data.pagination.pageSize + 1))
        .replace('{to}', String(Math.min(data.pagination.total, data.pagination.page * data.pagination.pageSize)))
        .replace('{total}', String(data.pagination.total))
    : t.admin.auditLogsShowingEmpty;

  return (
    <AppShell admin>
      <div className="space-y-5">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">{t.admin.auditLogsTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.auditLogsSubtitle}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{t.common.refresh}
          </button>
        </header>

        <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] shadow-2xl shadow-black/20 lg:grid-cols-[minmax(24rem,0.95fr)_minmax(0,1.05fr)]">
          <section className={`${selectedId ? 'hidden lg:flex' : 'flex'} min-w-0 flex-col border-white/10 lg:border-r`} aria-label={t.admin.auditLogsListLabel}>
            <div className="space-y-3 border-b border-white/10 p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
                <span className="sr-only">{t.admin.auditLogsSearch}</span>
                <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder={t.admin.auditLogsSearch} className="h-10 w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                <AuditSelect value={filters.category} label={t.admin.auditLogsCategory} allLabel={t.admin.auditLogsAllCategories} values={data?.filters.categories ?? []} onChange={(category) => updateFilters({ category })} />
                <AuditSelect value={filters.outcome} label={t.admin.auditLogsOutcome} allLabel={t.admin.auditLogsAllOutcomes} values={['SUCCESS', 'FAILURE', 'DENIED', 'DEFERRED', 'PARTIAL']} onChange={(outcome) => updateFilters({ outcome })} />
                <AppSelect value={filters.range} ariaLabel={t.admin.auditLogsDateRange} options={[{ value: '24h', label: t.admin.auditLogsLast24Hours }, { value: '7d', label: t.admin.auditLogsLast7Days }, { value: '30d', label: t.admin.auditLogsLast30Days }, { value: '90d', label: t.admin.auditLogsLast90Days }, { value: 'all', label: t.admin.auditLogsAllTime }, { value: 'custom', label: t.admin.auditLogsCustomRange }]} onChange={(range) => updateFilters({ range })} className="min-w-0" />
                <AuditSelect value={filters.action} label={t.admin.auditLogsAction} allLabel={t.admin.auditLogsAllActions} values={(data?.filters.actions ?? []).map((item) => item.value)} onChange={(action) => updateFilters({ action })} displayLabel={(action) => actionLabel(action, t)} menuWidth={360} wrapOptions />
                <AuditSelect value={filters.targetType} label={t.admin.auditLogsTarget} allLabel={t.admin.auditLogsAllTargets} values={(data?.filters.targetTypes ?? []).map((item) => item.value)} onChange={(targetType) => updateFilters({ targetType })} />
                <AppSelect value={filters.actorId} ariaLabel={t.admin.auditLogsActor} options={[{ value: '', label: t.admin.auditLogsAllActors }, ...(data?.filters.actors ?? []).map((actor) => ({ value: actor.id, label: actor.name }))]} onChange={(actorId) => updateFilters({ actorId })} className="min-w-0" />
              </div>
              {filters.range === 'custom' && <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-white/48">{t.admin.auditLogsFrom}<input type="date" value={filters.from} onChange={(event) => updateFilters({ from: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-emerald-300/35" /></label>
                <label className="text-xs font-semibold text-white/48">{t.admin.auditLogsTo}<input type="date" value={filters.to} onChange={(event) => updateFilters({ to: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-emerald-300/35" /></label>
              </div>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {error ? <div className="p-4"><TableErrorState title={t.admin.auditLogsLoadFailed} retryLabel={t.common.retry} onRetry={() => void load()} /></div>
                : loading && !data ? <TableSkeleton rows={8} columns={3} />
                : !data?.items.length ? <TableEmptyState title={t.admin.auditLogsEmpty} />
                : <div role="listbox" aria-label={t.admin.auditLogsListLabel}>{data.items.map((item) => <AuditRow key={item.id} item={item} selected={selectedId === item.id} locale={locale} timezone={data.timezone} onSelect={() => selectLog(item.id)} t={t} />)}</div>}
            </div>
            {data && <DataTablePagination page={data.pagination.page} pageSize={data.pagination.pageSize} pageSizeOptions={[10, 20, 50]} total={data.pagination.total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={showing} onPageChange={(page) => updateFilters({ page })} onPageSizeChange={(pageSize) => updateFilters({ pageSize })} />}
          </section>

          <section className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-col`} aria-label={t.admin.auditLogsDetailLabel}>
            {selectedId && <div className="border-b border-white/10 p-3 lg:hidden"><button type="button" onClick={() => selectLog(null)} className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30"><ArrowLeft size={16} />{t.common.back}</button></div>}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {!selectedId ? <DetailPlaceholder icon={<ShieldCheck size={28} />} title={t.admin.auditLogsSelectTitle} text={t.admin.auditLogsSelectDescription} />
                : detailLoading ? <TableSkeleton rows={7} columns={2} />
                : detailError ? <TableErrorState title={t.admin.auditLogsDetailLoadFailed} retryLabel={t.common.retry} onRetry={() => { setSelectedId(null); window.setTimeout(() => setSelectedId(selectedId), 0); }} />
                : detail ? <AuditDetailPane detail={detail} locale={locale} timezone={data?.timezone ?? 'UTC'} t={t} /> : null}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function AuditSelect({ value, values, label, allLabel, onChange, displayLabel = readableIdentifier, menuWidth, wrapOptions }: { value: string; values: string[]; label: string; allLabel: string; onChange: (value: string) => void; displayLabel?: (value: string) => string; menuWidth?: number; wrapOptions?: boolean }) {
  return <AppSelect value={value} ariaLabel={label} options={[{ value: '', label: allLabel }, ...values.map((item) => ({ value: item, label: displayLabel(item) }))]} onChange={onChange} menuWidth={menuWidth} wrapOptions={wrapOptions} className="min-w-0" />;
}

function AuditRow({ item, selected, locale, timezone, onSelect, t }: { item: AuditSummary; selected: boolean; locale: string; timezone: string; onSelect: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onSelect} className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/[0.07] px-4 py-3 text-left outline-none transition ${selected ? 'bg-emerald-300/[0.10] shadow-[inset_3px_0_0_rgba(110,231,183,0.9)]' : 'hover:bg-white/[0.04]'} focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/35`}>
      <span className="min-w-0">
        <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-white/88">{actionLabel(item.action, t)}</span><OutcomeBadge outcome={item.outcome} t={t} /></span>
        <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-white/48"><ProfilePhoto name={auditActorAvatarName(item.actor)} avatarUrl={auditUserAvatarValue(item.actor, 'avatarUrl')} dicebearStyle={auditUserAvatarValue(item.actor, 'dicebearStyle')} dicebearSeed={auditUserAvatarValue(item.actor, 'dicebearSeed')} size="sm" className="h-6 w-6 rounded-full text-[8px] shadow-none" /><span className="flex min-w-0 items-center gap-1"><span className="truncate">{item.actor.name}</span><IdentityVerificationBadge kind={identityVerificationForRole(item.actor.currentRole)} size="xs" /></span><span aria-hidden="true">·</span><span className="truncate">{item.target.label}</span></span>
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap text-xs text-white/40"><Clock3 size={12} />{formatDate(item.createdAt, locale, timezone)}</span>
    </button>
  );
}

function AuditDetailPane({ detail, locale, timezone, t }: { detail: AuditDetail; locale: string; timezone: string; t: ReturnType<typeof useI18n>['t'] }) {
  return <div className="space-y-6">
    <div><div className="flex flex-wrap items-center gap-2"><OutcomeBadge outcome={detail.outcome} t={t} /><span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/55">{readableIdentifier(detail.category)}</span></div><h2 className="mt-3 text-xl font-semibold text-white">{actionLabel(detail.action, t)}</h2><p className="mt-1 font-mono text-xs text-white/38">{detail.action}</p><p className="mt-3 text-sm text-white/55">{formatDate(detail.createdAt, locale, timezone)}</p></div>
    <DetailSection title={t.admin.auditLogsActor}><DetailGrid rows={[[t.admin.auditLogsName, <span key="actor-name" className="inline-flex items-center gap-1.5">{detail.actor.name}<IdentityVerificationBadge kind={identityVerificationForRole(detail.actor.currentRole)} size="xs" /></span>], [t.admin.auditLogsEmail, detail.actor.email], [t.admin.auditLogsActorType, detail.actor.type], [t.admin.auditLogsRecordedRole, detail.actor.recordedRole], [t.admin.auditLogsCurrentRole, detail.actor.currentRole]]} /></DetailSection>
    <DetailSection title={t.admin.auditLogsTarget}><DetailGrid rows={[[t.admin.auditLogsType, detail.target.type], [t.admin.auditLogsIdentifier, detail.target.id], [t.admin.auditLogsLabel, detail.target.recordedLabel ?? detail.target.label]]} /></DetailSection>
    {detail.reason && <DetailSection title={t.admin.auditLogsReason}><p className="text-sm leading-6 text-white/68">{detail.reason}</p></DetailSection>}
    {detail.changes.length > 0 && <DetailSection title={t.admin.auditLogsChanges}><div className="space-y-2">{detail.changes.map((change) => <div key={change.field} className="grid gap-2 rounded-lg border border-white/[0.07] bg-black/15 p-3 text-sm sm:grid-cols-[8rem_1fr_1fr]"><span className="font-semibold text-white/68">{readableIdentifier(change.field)}</span><span className="text-rose-200/65">{change.from ?? t.admin.auditLogsNotAvailable}</span><span className="text-emerald-200/75">{change.to ?? t.admin.auditLogsNotAvailable}</span></div>)}</div></DetailSection>}
    {detail.requestContext.length > 0 && <DetailSection title={t.admin.auditLogsRequestContext}><DetailGrid rows={detail.requestContext.map((item) => [readableIdentifier(item.key), item.value])} mono /></DetailSection>}
    {detail.metadata.length > 0 && <DetailSection title={t.admin.auditLogsApprovedMetadata}><DetailGrid rows={detail.metadata.map((item) => [readableIdentifier(item.key), item.value])} /></DetailSection>}
  </div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section><h3 className="mb-3 border-b border-white/10 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-white/42">{title}</h3>{children}</section>; }
function DetailGrid({ rows, mono = false }: { rows: Array<[string, React.ReactNode]>; mono?: boolean }) { return <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-[9rem_minmax(0,1fr)]">{rows.filter(([, value]) => value).map(([label, value]) => <div key={label} className="contents"><dt className="text-sm text-white/42">{label}</dt><dd className={`break-words text-sm text-white/72 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd></div>)}</dl>; }
function DetailPlaceholder({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="grid min-h-[420px] place-items-center text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200/65">{icon}</span><h2 className="mt-4 text-lg font-semibold text-white/78">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/45">{text}</p></div></div>; }
function OutcomeBadge({ outcome, t }: { outcome: string; t: ReturnType<typeof useI18n>['t'] }) { const style = outcome === 'SUCCESS' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : outcome === 'DENIED' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'; return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${style}`}>{outcomeLabel(outcome, t)}</span>; }
function outcomeLabel(value: string, t: ReturnType<typeof useI18n>['t']) { const labels: Record<string, string> = { SUCCESS: t.admin.auditLogsSuccess, FAILURE: t.admin.auditLogsFailure, DENIED: t.admin.auditLogsDenied, DEFERRED: t.admin.auditLogsDeferred, PARTIAL: t.admin.auditLogsPartial }; return labels[value] ?? readableIdentifier(value); }
function actionLabel(action: string, t: ReturnType<typeof useI18n>['t']) { const labels = t.audit as Record<string, string>; return labels[action] ?? readableIdentifier(action); }
function auditActorAvatarName(actor: AuditActor) { return actor.type?.toUpperCase() === 'SYSTEM' ? 'S' : actor.name || 'User'; }
function auditUserAvatarValue(actor: AuditActor, field: 'avatarUrl' | 'dicebearStyle' | 'dicebearSeed') { return actor.type?.toUpperCase() === 'USER' ? actor[field] ?? null : null; }
function readableIdentifier(value: string) { return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
