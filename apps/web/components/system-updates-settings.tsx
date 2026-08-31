'use client';

import { CheckCircle2, Clipboard, Download, ExternalLink, Pause, Play, RefreshCw, RotateCcw, ServerCog, TriangleAlert, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { PERMISSIONS, hasPermission, type PermissionUser } from '../lib/permissions';
import { isStepUpCancellation, useStepUpAuthentication } from './step-up-authentication-dialog';
import { ConfirmDialog, LoadingButton, Spinner } from './ui';
import { useSystemUpdateSocket } from '../hooks/use-system-update-socket';

type ReleaseStatus = 'DEVELOPMENT' | 'NO_RELEASE_AVAILABLE' | 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'CHECK_FAILED' | 'MANUAL_REQUIRED';
type ReleaseCheck = { installedVersion: string; latestVersion: string | null; status: ReleaseStatus; checkedAt: string; lastSuccessfulCheckedAt: string | null; releaseUrl: string | null; releasePublishedAt: string | null; releaseNotes: string | null; errorCategory: string | null };
type UpdateRun = { id: string; installedVersion: string; targetVersion: string; status: string; phase: string; createdAt: string; startedAt: string | null; completedAt: string | null; failureCode: string | null; failureSummary: string | null; rollbackStatus: string; provenanceResults: Array<{ service: 'manifest' | 'api' | 'web' | 'worker'; result: 'VERIFIED' }>; lastSequence: number; initiatedBy?: { id: string; name: string } | null };
type UpdateEvent = { sequence: number; timestamp: string; level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'; phase: string; eventCode: string; message: string };
type Overview = { release: ReleaseCheck; activeRun: UpdateRun | null; history: { items: UpdateRun[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }; canViewHistory: boolean; updaterConfigured: boolean };

const terminalStatuses = new Set(['COMPLETED', 'FAILED', 'MANUAL_INTERVENTION_REQUIRED', 'CANCELLED']);

export function SystemUpdatesSettings({ user }: { user: PermissionUser }) {
  const { t, lang } = useI18n();
  const copy = t.systemUpdates;
  const stepUp = useStepUpAuthentication();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [events, setEvents] = useState<UpdateEvent[]>([]);
  const [busy, setBusy] = useState<'load' | 'check' | 'authorize' | 'install' | 'cancel' | ''>('load');
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<{ run: UpdateRun; events: UpdateEvent[] } | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const lastSequenceRef = useRef(0);
  const terminalNotifiedRef = useRef<string | null>(null);
  const canCheck = hasPermission(user, PERMISSIONS.systemUpdateCheck);
  const canExecute = hasPermission(user, PERMISSIONS.systemUpdateExecute);
  const activeRun = overview?.activeRun ?? null;

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Overview>(`/admin/${COMMUNITY_ID}/system-updates`);
      setOverview(data);
      setError('');
    } catch {
      setError(copy.loadFailed);
    } finally {
      setBusy((current) => current === 'load' ? '' : current);
    }
  }, [copy.loadFailed]);

  const acceptRunState = useCallback((state: { run: UpdateRun; events: UpdateEvent[] }) => {
    setEvents((current) => mergeEvents(current, state.events));
    lastSequenceRef.current = Math.max(lastSequenceRef.current, state.run.lastSequence, ...state.events.map((event) => event.sequence));
    setOverview((current) => current ? { ...current, activeRun: terminalStatuses.has(state.run.status) ? null : state.run, history: terminalStatuses.has(state.run.status) ? { ...current.history, items: [state.run, ...current.history.items.filter((item) => item.id !== state.run.id)] } : current.history } : current);
    setError('');
    if (terminalStatuses.has(state.run.status) && terminalNotifiedRef.current !== state.run.id) {
      terminalNotifiedRef.current = state.run.id;
      toast[state.run.status === 'COMPLETED' ? 'success' : 'error'](state.run.status === 'COMPLETED' ? copy.completed : copy.failed);
      void load();
    }
  }, [copy.completed, copy.failed, load]);
  useSystemUpdateSocket({ runId: overview?.canViewHistory ? activeRun?.id ?? null : null, after: lastSequenceRef.current, onState: acceptRunState, onReconnect: () => setError(copy.reconnecting) });

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!overview?.canViewHistory || !activeRun || terminalStatuses.has(activeRun.status)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      try {
        const after = lastSequenceRef.current;
        const state = await apiFetch<{ run: UpdateRun; events: UpdateEvent[] }>(`/admin/${COMMUNITY_ID}/system-updates/runs/${activeRun!.id}?after=${after}`);
        if (disposed) return;
        acceptRunState(state);
        if (terminalStatuses.has(state.run.status)) return;
      } catch {
        if (!disposed) setError(copy.reconnecting);
      }
      if (!disposed) timer = setTimeout(poll, 2_000);
    }
    void poll();
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [acceptRunState, activeRun?.id, activeRun?.status, copy.reconnecting, overview?.canViewHistory]);

  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [autoScroll, events]);

  async function check() {
    if (!canCheck || busy) return;
    setBusy('check');
    try {
      const release = await apiFetch<ReleaseCheck>(`/admin/${COMMUNITY_ID}/system-updates/check`, { method: 'POST' });
      setOverview((current) => current ? { ...current, release } : current);
      toast.success(copy.checkCompleted);
    } catch { toast.error(copy.checkFailed); }
    finally { setBusy(''); }
  }

  async function prepareInstall() {
    if (!canExecute || busy || !overview?.release.latestVersion) return;
    setBusy('authorize');
    try {
      await stepUp.run(() => apiFetch(`/admin/${COMMUNITY_ID}/system-updates/authorize`, { method: 'POST' }));
      setConfirmOpen(true);
    } catch (caught) {
      if (!isStepUpCancellation(caught)) toast.error(copy.authorizationFailed);
    } finally { setBusy(''); }
  }

  async function install() {
    const version = overview?.release.latestVersion;
    if (!version || busy) return;
    setBusy('install');
    try {
      const run = await stepUp.run(() => apiFetch<UpdateRun>(`/admin/${COMMUNITY_ID}/system-updates/install`, { method: 'POST', body: JSON.stringify({ version, idempotencyKey: crypto.randomUUID().replaceAll('-', '') }) }));
      setEvents([]);
      lastSequenceRef.current = 0;
      terminalNotifiedRef.current = null;
      setOverview((current) => current ? { ...current, activeRun: run } : current);
      setConfirmOpen(false);
      toast.success(copy.started);
    } catch (caught) {
      if (!isStepUpCancellation(caught)) toast.error(copy.startFailed);
    } finally { setBusy(''); }
  }

  async function cancel() {
    if (!activeRun || busy) return;
    setBusy('cancel');
    try { await stepUp.run(() => apiFetch(`/admin/${COMMUNITY_ID}/system-updates/runs/${activeRun.id}/cancel`, { method: 'POST' })); }
    catch (caught) { if (!isStepUpCancellation(caught)) toast.error(copy.cancelFailed); }
    finally { setBusy(''); }
  }

  async function loadHistoryPage(page: number) {
    if (!overview?.canViewHistory || busy) return;
    setBusy('load');
    try {
      const history = await apiFetch<Overview['history']>(`/admin/${COMMUNITY_ID}/system-updates/history?page=${page}&pageSize=${overview.history.pagination.pageSize}`);
      setOverview((current) => current ? { ...current, history } : current);
    } catch { toast.error(copy.historyLoadFailed); }
    finally { setBusy(''); }
  }

  async function openHistoryDetail(runId: string) {
    if (!overview?.canViewHistory || busy) return;
    setBusy('load');
    try { setHistoryDetail(await apiFetch<{ run: UpdateRun; events: UpdateEvent[] }>(`/admin/${COMMUNITY_ID}/system-updates/runs/${runId}?after=0`)); }
    catch { toast.error(copy.historyLoadFailed); }
    finally { setBusy(''); }
  }

  const logText = useMemo(() => events.map((event) => `${event.timestamp} ${event.level.padEnd(7)} ${event.message}`).join('\n'), [events]);
  async function copyLogs() {
    try { await navigator.clipboard.writeText(logText); toast.success(copy.logsCopied); }
    catch { toast.error(copy.logsCopyFailed); }
  }
  function downloadLogs() {
    const url = URL.createObjectURL(new Blob([logText], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `pe-community-update-${activeRun?.id ?? 'history'}.log`; anchor.click(); URL.revokeObjectURL(url);
  }

  if (busy === 'load' && !overview) return <div className="grid min-h-64 place-items-center"><Spinner /></div>;
  if (!overview) return <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/10 p-5 text-rose-100">{error || copy.loadFailed}</div>;
  const { release } = overview;
  const noPublishedRelease = release.status === 'NO_RELEASE_AVAILABLE';
  const developmentBuild = release.status === 'DEVELOPMENT';
  const cancellable = activeRun && ['PENDING', 'PREFLIGHT', 'PULLING'].includes(activeRun.phase);

  return (
    <div className="space-y-5">
      {error && <div role="status" className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{error}</div>}
      <section className="grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
        <VersionCell label={copy.currentVersion} value={release.installedVersion} />
        <VersionCell label={copy.latestStable} value={noPublishedRelease || developmentBuild ? copy.notAvailable : release.latestVersion ?? copy.unknown} />
        <VersionCell label={copy.status} value={statusLabel(release.status, copy)} tone={release.status} />
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">{release.status === 'UP_TO_DATE' ? copy.upToDate : release.status === 'UPDATE_AVAILABLE' ? copy.updateAvailable : release.status === 'MANUAL_REQUIRED' ? copy.manualRequired : noPublishedRelease ? copy.noPublishedUpdates : developmentBuild ? copy.developmentBuild : copy.unableToCheck}</h2>
            {(noPublishedRelease || developmentBuild) && <p className="mt-2 text-sm leading-6 text-white/52">{noPublishedRelease ? copy.noPublishedUpdatesDescription : copy.developmentBuildDescription}</p>}
            <p className={`${noPublishedRelease || developmentBuild ? 'mt-1' : 'mt-2'} text-sm leading-6 text-white/52`}>{release.status === 'CHECK_FAILED' ? copy.lastSuccessful(formatDate(release.lastSuccessfulCheckedAt, lang)) : copy.lastChecked(formatDate(release.checkedAt, lang))}</p>
            {release.releasePublishedAt && <p className="text-sm leading-6 text-white/42">{copy.releaseDate}: {formatDate(release.releasePublishedAt, lang)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <LoadingButton type="button" loading={busy === 'check'} disabled={!canCheck || Boolean(busy) || Boolean(activeRun)} onClick={check} className="gap-2 bg-white/[0.06] text-white"><RefreshCw size={15} />{copy.check}</LoadingButton>
            {release.status === 'UPDATE_AVAILABLE' && <LoadingButton type="button" loading={busy === 'authorize'} disabled={!canExecute || Boolean(busy) || Boolean(activeRun) || !overview.updaterConfigured} onClick={prepareInstall} className="gap-2"><ServerCog size={16} />{copy.updateNow}</LoadingButton>}
          </div>
        </div>
        {!overview.updaterConfigured && release.status === 'UPDATE_AVAILABLE' && <p className="mt-4 rounded-lg border border-amber-300/15 bg-amber-300/[0.07] px-3 py-2 text-sm text-amber-100/75">{copy.bootstrapRequired}</p>}
        {release.releaseNotes && <div className="mt-5 border-t border-white/[0.07] pt-4"><h3 className="text-sm font-semibold text-white">{copy.releaseNotes}</h3><p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-white/55">{release.releaseNotes}</p>{release.releaseUrl && <a href={release.releaseUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">{copy.viewRelease}<ExternalLink size={14} /></a>}</div>}
      </section>

      {activeRun && <section className="rounded-xl border border-emerald-300/15 bg-black/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/75">{copy.currentRun}</p><h2 className="mt-1 text-lg font-semibold text-white">{activeRun.installedVersion} → {activeRun.targetVersion}</h2><p className="mt-1 text-sm text-white/50">{phaseLabel(activeRun.phase, copy)}</p></div>{cancellable ? <LoadingButton loading={busy === 'cancel'} onClick={cancel} className="bg-white/[0.06] text-white">{copy.cancelUpdate}</LoadingButton> : <span className="text-xs text-white/38">{copy.cancelUnavailable}</span>}</div>
        <ProvenanceStatus run={activeRun} copy={copy} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-4"><h3 className="text-sm font-semibold text-white">{copy.executionLog}</h3><div className="flex gap-2"><button type="button" onClick={() => setAutoScroll((value) => !value)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white" title={autoScroll ? copy.pauseAutoscroll : copy.resumeAutoscroll}>{autoScroll ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" onClick={copyLogs} disabled={!events.length} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-35" title={copy.copyLogs}><Clipboard size={15} /></button><button type="button" onClick={downloadLogs} disabled={!events.length} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-35" title={copy.downloadLogs}><Download size={15} /></button></div></div>
        <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-white/[0.07] bg-black/35 p-3 font-mono text-xs leading-6"><div className="space-y-1">{events.length ? events.map((event) => <div key={event.sequence} className="grid grid-cols-[5.5rem_4.5rem_minmax(0,1fr)] gap-2"><span className="text-white/35">{new Date(event.timestamp).toLocaleTimeString(lang)}</span><span className={event.level === 'ERROR' ? 'text-rose-300' : event.level === 'WARNING' ? 'text-amber-300' : event.level === 'SUCCESS' ? 'text-emerald-300' : 'text-sky-300'}>{event.level}</span><span className="break-words text-white/70">{event.message}</span></div>) : <p className="text-white/35">{copy.waitingForLogs}</p>}</div></div>
      </section>}

      {overview.canViewHistory && <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5"><h2 className="text-base font-semibold text-white">{copy.history}</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/[0.08] text-xs uppercase tracking-[0.12em] text-white/35"><tr><th className="pb-3">{copy.version}</th><th className="pb-3">{copy.initiatedBy}</th><th className="pb-3">{copy.startedAt}</th><th className="pb-3">{copy.duration}</th><th className="pb-3">{copy.result}</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{overview.history.items.map((run) => <tr key={run.id}><td className="py-3"><button type="button" onClick={() => void openHistoryDetail(run.id)} className="cursor-pointer font-mono text-emerald-300 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40">{run.targetVersion}</button></td><td className="py-3 text-white/55">{run.initiatedBy?.name ?? copy.system}</td><td className="py-3 text-white/55">{formatDate(run.startedAt ?? run.createdAt, lang)}</td><td className="py-3 text-white/55">{duration(run.startedAt, run.completedAt)}</td><td className="py-3"><RunStatus status={run.status} rollback={run.rollbackStatus} copy={copy} /></td></tr>)}</tbody></table>{!overview.history.items.length && <p className="py-8 text-center text-sm text-white/40">{copy.noHistory}</p>}</div>{overview.history.pagination.totalPages > 1 && <div className="mt-4 flex justify-end gap-2 border-t border-white/[0.07] pt-4"><button type="button" disabled={overview.history.pagination.page <= 1 || Boolean(busy)} onClick={() => void loadHistoryPage(overview.history.pagination.page - 1)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-35">{t.common.previous}</button><button type="button" disabled={overview.history.pagination.page >= overview.history.pagination.totalPages || Boolean(busy)} onClick={() => void loadHistoryPage(overview.history.pagination.page + 1)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-35">{t.common.next}</button></div>}{historyDetail && <div className="mt-5 border-t border-white/[0.08] pt-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{copy.runDetails}</h3><p className="mt-1 font-mono text-sm text-white/55">{historyDetail.run.installedVersion} → {historyDetail.run.targetVersion}</p></div><button type="button" onClick={() => setHistoryDetail(null)} className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white">{t.common.close}</button></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Detail label={copy.result} value={historyDetail.run.status.replaceAll('_', ' ')} /><Detail label={copy.phase} value={phaseLabel(historyDetail.run.phase, copy)} /><Detail label={copy.rollback} value={historyDetail.run.rollbackStatus.replaceAll('_', ' ')} /></dl>{historyDetail.run.failureSummary && <p className="mt-4 rounded-lg border border-rose-300/15 bg-rose-300/[0.06] px-3 py-2 text-sm text-rose-100/80">{historyDetail.run.failureSummary}</p>}<div className="chat-scrollbar mt-4 max-h-72 overflow-y-auto rounded-lg border border-white/[0.07] bg-black/35 p-3 font-mono text-xs leading-6">{historyDetail.events.map((event) => <p key={event.sequence} className="text-white/65">{new Date(event.timestamp).toLocaleTimeString(lang)} {event.level} {event.message}</p>)}</div></div>}</section>}

      <ConfirmDialog open={confirmOpen} title={copy.confirmTitle} description={copy.confirmDescription(release.installedVersion, release.latestVersion ?? '')} confirmLabel={copy.confirmAction(release.latestVersion ?? '')} cancelLabel={t.common.cancel} loading={busy === 'install'} loadingLabel={copy.starting} onCancel={() => setConfirmOpen(false)} onConfirm={install} />
      {stepUp.dialog}
    </div>
  );
}

function VersionCell({ label, value, tone }: { label: string; value: string; tone?: ReleaseStatus }) { return <div className="bg-[#06100c] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/35">{label}</p><p className={`mt-2 text-lg font-semibold ${tone === 'UPDATE_AVAILABLE' ? 'text-emerald-300' : tone === 'CHECK_FAILED' ? 'text-rose-300' : tone === 'MANUAL_REQUIRED' ? 'text-amber-300' : 'text-white'}`}>{value}</p></div>; }
function ProvenanceStatus({ run, copy }: { run: UpdateRun; copy: ReturnType<typeof useI18n>['t']['systemUpdates'] }) { const blocked = run.failureCode?.startsWith('PROVENANCE_') || run.failureCode?.startsWith('MANIFEST_'); if (!run.provenanceResults.length && !blocked) return null; const labels = { manifest: copy.releaseArtifact, api: copy.apiService, web: copy.webService, worker: copy.workerService }; return <div className="mt-4 border-t border-white/[0.07] pt-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/40">{copy.supplyChainVerification}</p>{blocked && <p className="mt-2 text-sm text-rose-200/80">{copy.authenticityBlocked}</p>}<div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{run.provenanceResults.map((item) => <span key={item.service} className="inline-flex items-center gap-1.5 text-sm text-emerald-200"><CheckCircle2 size={14} />{labels[item.service]} {copy.verified}</span>)}</div></div>; }
function RunStatus({ status, rollback, copy }: { status: string; rollback: string; copy: ReturnType<typeof useI18n>['t']['systemUpdates'] }) { const failed = status !== 'COMPLETED'; const Icon = status === 'COMPLETED' ? CheckCircle2 : rollback === 'COMPLETED' ? RotateCcw : failed ? XCircle : TriangleAlert; return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status === 'COMPLETED' ? 'text-emerald-300' : failed ? 'text-rose-300' : 'text-amber-300'}`}><Icon size={14} />{status === 'COMPLETED' ? copy.completed : rollback === 'COMPLETED' ? copy.failedRolledBack : status.replaceAll('_', ' ')}</span>; }
function mergeEvents(current: UpdateEvent[], incoming: UpdateEvent[]) { const map = new Map(current.map((event) => [event.sequence, event])); for (const event of incoming) map.set(event.sequence, event); return [...map.values()].sort((a, b) => a.sequence - b.sequence); }
function formatDate(value: string | null, locale: string) { return value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function duration(start: string | null, end: string | null) { if (!start || !end) return '—'; const seconds = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)); return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function statusLabel(status: ReleaseStatus, copy: ReturnType<typeof useI18n>['t']['systemUpdates']) { return status === 'UP_TO_DATE' ? copy.upToDate : status === 'UPDATE_AVAILABLE' ? copy.updateAvailable : status === 'MANUAL_REQUIRED' ? copy.manualRequired : status === 'NO_RELEASE_AVAILABLE' ? copy.noPublishedUpdates : status === 'DEVELOPMENT' ? copy.developmentBuild : copy.checkFailed; }
function phaseLabel(phase: string, copy: ReturnType<typeof useI18n>['t']['systemUpdates']) { return copy.phases[phase as keyof typeof copy.phases] ?? phase.replaceAll('_', ' '); }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs uppercase tracking-[0.1em] text-white/35">{label}</dt><dd className="mt-1 text-white/70">{value}</dd></div>; }
