'use client';

import { Activity, AlertTriangle, Archive, CalendarClock, CheckCircle2, Clock3, FlaskConical, History, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { AppSelect } from './app-select';
import { LoadingButton, TableErrorState, TableSkeleton } from './ui';
import { apiFetch, COMMUNITY_ID } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatDate } from '../lib/utils';
import { automationValidationMessage, type AutomationValidationResult } from '../lib/automation-validation';
import { ProfilePhoto } from './profile-photo';

type RuleType = 'DUE_BEFORE' | 'OVERDUE' | 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE' | 'FLAG_UNASSIGNED' | 'STALE_TASK_FOLLOW_UP' | 'CHECKLIST_INCOMPLETE_BEFORE_DUE' | 'OVERDUE_ESCALATION';
type Rule = { id: string; type: RuleType; enabled: boolean; config: Record<string, unknown>; hasDraft?: boolean; staleDraft?: boolean; currentVersion?: number; archivedAt?: string | null; archivedBy?: { id: string; name: string } | null; archiveReason?: string | null; createdFromPreset?: { id: string; name: string } | null; validation?: AutomationValidationResult; lastRunAt?: string | null; lastRunStatus?: 'SUCCESS' | 'SKIPPED' | 'FAILED' | null; lastRunMode?: 'LIVE' | 'DRY_RUN' | 'TEST_NOTIFICATION' | null; lastRunSummary?: string | null };
type Run = { id: string; status: 'SUCCESS' | 'SKIPPED' | 'FAILED'; mode: 'LIVE' | 'DRY_RUN' | 'TEST_NOTIFICATION'; startedAt: string; finishedAt?: string | null; summary?: string | null; details?: Record<string, unknown> | null; errorCode?: string | null; errorMessage?: string | null; task?: { id: string; title: string } | null };
type RunsResponse = { items: Run[]; page: number; pageSize: number; total: number };
type EmailAvailability = { available: boolean; reason?: 'SMTP_NOT_CONFIGURED' | 'SMTP_DISABLED' | 'MISSING_FROM_ADDRESS' | 'UNKNOWN' };
type RuleVersion = { id: string; version: number; changeType: 'CREATED' | 'UPDATED' | 'ROLLED_BACK'; changeSummary: string | null; type: RuleType; enabled: boolean; name: string | null; config: Record<string, unknown>; createdAt: string; changedBy: { id: string; name: string; avatarUrl?: string | null } | null; isCurrent: boolean };
type VersionsResponse = { items: RuleVersion[] };
type DraftResponse = { hasDraft: boolean; staleDraft: boolean; draft: { name: string | null; enabled: boolean; config: Record<string, unknown>; updatedAt: string; updatedBy: { id: string; name: string; avatarUrl?: string | null } | null } | null; live: { name: string | null; enabled: boolean; config: Record<string, unknown>; currentVersion?: number }; lifecycle: { archivedAt: string | null; archivedBy: { id: string; name: string } | null; archiveReason: string | null; createdFromPreset: { id: string; name: string } | null }; diff: Array<{ field: string; label: string; liveValue: string; draftValue: string }>; validation: AutomationValidationResult };
type ScheduleReason = { code: string; severity: 'INFO' | 'WARNING' | 'ERROR'; count?: number; hours?: number; days?: number };
type ScheduleResponse = {
  ruleId: string;
  ruleType: RuleType;
  enabled: boolean;
  scheduleState: 'DISABLED' | 'WAITING' | 'READY' | 'BLOCKED' | 'UNKNOWN';
  lastEvaluatedAt: string | null;
  lastLiveRunAt: string | null;
  nextCheckCode: 'DISABLED' | 'HOURLY_WORKER_CYCLE' | 'CHECKLIST_CHANGE' | 'BOARD_READ';
  nextEligibleAt: string | null;
  matching: { currentMatches: number; upcomingMatches: number | null; affectedTasks: Array<{ id: string; title: string; dueDate: string | null; status: string; reasonCode: string }> };
  reasons: ScheduleReason[];
  worker: { available: boolean; status: 'ACTIVE' | 'UNKNOWN'; lastHeartbeatAt: string | null; label: string | null };
};

export function AutomationRunsDrawer({ boardId, rule, ruleLabel, emailAvailability, onClose, onTested, onRuleChanged }: { boardId: string; rule: Rule; ruleLabel: string; emailAvailability: EmailAvailability; onClose: () => void; onTested: () => void; onRuleChanged: (rule: Rule) => void }) {
  const { lang, t } = useI18n();
  const [tab, setTab] = useState<'runs' | 'test' | 'reliability' | 'history' | 'schedule'>(rule.archivedAt ? 'history' : 'runs');
  const [filter, setFilter] = useState('ALL');
  const [data, setData] = useState<RunsResponse | null>(null);
  const [error, setError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState('');
  const [latestTest, setLatestTest] = useState<Run | null>(null);
  const [versions, setVersions] = useState<VersionsResponse | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [draftError, setDraftError] = useState(false);
  const [draftAction, setDraftAction] = useState<'publish' | 'discard' | ''>('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [rollingBackId, setRollingBackId] = useState('');
  const [confirmingVersionId, setConfirmingVersionId] = useState('');
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [scheduleError, setScheduleError] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [mounted, setMounted] = useState(false);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const latestFailedRun = data?.items.find((run) => run.status === 'FAILED' && run.mode === 'LIVE') ?? null;
  const load = useCallback(async () => {
    setError(false);
    try {
      const query = filter === 'DRY_RUN' || filter === 'TEST_NOTIFICATION' ? `?mode=${filter}` : filter !== 'ALL' ? `?status=${filter}` : '';
      setData(await apiFetch<RunsResponse>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/runs${query}`));
    } catch { setError(true); }
  }, [boardId, filter, rule.id]);
  const loadHistory = useCallback(async () => {
    setHistoryError(false);
    try { setVersions(await apiFetch<VersionsResponse>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/versions`)); }
    catch { setHistoryError(true); }
  }, [boardId, rule.id]);
  const loadDraft = useCallback(async () => {
    setDraftError(false);
    try { setDraft(await apiFetch<DraftResponse>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/draft`)); }
    catch { setDraftError(true); }
  }, [boardId, rule.id]);
  const loadSchedule = useCallback(async () => {
    setScheduleError(false);
    try { setSchedule(await apiFetch<ScheduleResponse>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/schedule`)); }
    catch { setScheduleError(true); }
  }, [boardId, rule.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === 'history') { void loadHistory(); void loadDraft(); } }, [loadDraft, loadHistory, tab]);
  useEffect(() => { if (tab === 'schedule') void loadSchedule(); }, [loadSchedule, tab]);
  useEffect(() => { setMounted(true); const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  async function testRule() {
    if (testing) return;
    setTesting(true);
    try { const response = await apiFetch<{ run: Run }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/test`, { method: 'POST' }); setLatestTest(response.run); toast.success(t.admin.automationRuleTestCompleted); await load(); onTested(); }
    catch { toast.error(t.admin.automationRuleTestFailed); } finally { setTesting(false); }
  }
  async function testNotification() {
    if (testingNotification) return;
    setTestingNotification(true);
    try {
      const response = await apiFetch<{ run: Run }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/test-notification`, { method: 'POST' });
      setLatestTest(response.run);
      if (response.run.status === 'SUCCESS') toast.success(t.admin.automationTestNotificationSent);
      else toast.info(t.admin.automationNoSupportedChannel);
      await load();
    } catch { toast.error(t.admin.automationTestNotificationFailed); } finally { setTestingNotification(false); }
  }
  async function retryRun(run: Run) {
    if (retryingRunId || run.status !== 'FAILED' || run.mode !== 'LIVE') return;
    setRetryingRunId(run.id);
    try {
      const response = await apiFetch<{ run: Run }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-runs/${run.id}/retry`, { method: 'POST' });
      if (response.run.status === 'SUCCESS') toast.success(t.admin.automationRetryCompleted);
      else if (response.run.status === 'SKIPPED') toast.info(t.admin.automationRetrySkipped);
      else toast.error(t.admin.automationRetryFailed);
      await load();
      onTested();
    } catch { toast.error(t.admin.automationRetryFailed); } finally { setRetryingRunId(''); }
  }
  async function rollbackVersion(version: RuleVersion) {
    if (rollingBackId || version.isCurrent) return;
    setRollingBackId(version.id);
    try {
      const response = await apiFetch<{ rule: Rule; validation: AutomationValidationResult }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/versions/${version.id}/rollback`, { method: 'POST' });
      toast.success(t.admin.automationRuleRolledBack);
      if (response.validation.items.some((item) => item.severity === 'WARNING')) toast.warning(t.admin.automationRollbackWarnings);
      setConfirmingVersionId('');
      onRuleChanged(response.rule);
      await loadHistory();
    } catch (caught) {
      const code = automationApiErrorCode(caught);
      toast.error(code === 'AUTOMATION_ROLLBACK_VALIDATION_FAILED' ? t.admin.automationRollbackValidationBlocked : code === 'AUTOMATION_VERSION_CURRENT' ? t.admin.automationVersionCannotRestore : t.admin.automationRollbackFailed);
    } finally { setRollingBackId(''); }
  }
  async function publishDraft() {
    if (!draft?.hasDraft || draftAction) return;
    setDraftAction('publish');
    try {
      const response = await apiFetch<{ rule: Rule; validation: AutomationValidationResult }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/draft/publish`, { method: 'POST' });
      toast.success(t.admin.automationDraftPublished);
      if (response.validation.items.some((item) => item.severity === 'WARNING')) toast.warning(t.admin.automationRollbackWarnings);
      onRuleChanged(response.rule);
      await Promise.all([loadDraft(), loadHistory()]);
    } catch (caught) {
      toast.error(automationApiErrorCode(caught) === 'AUTOMATION_DRAFT_VALIDATION_FAILED' ? t.admin.automationDraftPublishBlocked : t.admin.automationDraftPublishFailed);
      await loadDraft();
    } finally { setDraftAction(''); }
  }
  async function discardDraft() {
    if (!draft?.hasDraft || draftAction) return;
    setDraftAction('discard');
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/draft`, { method: 'DELETE' });
      toast.success(t.admin.automationDraftDiscarded);
      setConfirmDiscard(false);
      onRuleChanged({ ...rule, hasDraft: false });
      await loadDraft();
    } catch { toast.error(t.admin.automationDraftDiscardFailed); } finally { setDraftAction(''); }
  }
  async function restoreRule() {
    if (restoring || !rule.archivedAt) return;
    setRestoring(true);
    try {
      const response = await apiFetch<{ rule: Partial<Rule>; validation: AutomationValidationResult }>(`/admin/${COMMUNITY_ID}/task-boards/${boardId}/automation-rules/${rule.id}/restore`, { method: 'POST' });
      toast.success(t.admin.automationRuleRestored);
      if (!response.validation.valid) toast.warning(t.admin.automationRestoreDisabledByValidation);
      onRuleChanged({ ...rule, ...response.rule, archivedAt: null });
      await Promise.all([loadDraft(), loadHistory()]);
    } catch { toast.error(t.admin.automationRuleRestoreFailed); } finally { setRestoring(false); }
  }
  if (!mounted) return null;
  return createPortal(<div className="fixed inset-0 z-[200]"><button type="button" aria-label={t.common.close} className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-md" onClick={onClose}/><aside className="absolute right-0 top-0 flex h-dvh w-full max-w-[620px] flex-col border-l border-white/10 bg-[#06100c] shadow-2xl shadow-black/60" role="dialog" aria-modal="true"><header className="shrink-0 border-b border-white/[0.08] px-5 py-4"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">{t.admin.automationRuns}</h2><p className="mt-1 text-sm text-white/42">{ruleLabel}</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-white/40 hover:bg-white/[0.07] hover:text-white"><X size={16}/></button></div><nav className="mt-4 flex gap-1 overflow-x-auto border-b border-white/[0.06]">{(['runs','test','reliability','history','schedule'] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${tab === item ? 'border-accent text-accent' : 'border-transparent text-white/42 hover:text-white/70'}`}>{item === 'runs' ? t.admin.automationRunsTab : item === 'test' ? t.admin.automationTestTab : item === 'reliability' ? t.admin.automationReliabilityTab : item === 'history' ? t.admin.automationHistoryTab : t.admin.automationScheduleTab}</button>)}</nav></header><div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
    {tab === 'runs' && <div className="space-y-4"><AppSelect value={filter} ariaLabel={t.common.filter} options={[{value:'ALL',label:t.common.all},{value:'SUCCESS',label:t.admin.automationSuccess},{value:'SKIPPED',label:t.admin.automationSkipped},{value:'FAILED',label:t.admin.automationFailed},{value:'DRY_RUN',label:t.admin.automationDryRun},{value:'TEST_NOTIFICATION',label:t.admin.automationTestNotifications}]} onChange={setFilter}/>{error ? <TableErrorState title={t.admin.automationRulesLoadFailed} retryLabel={t.common.retry} onRetry={load}/> : !data ? <TableSkeleton rows={5} columns={2}/> : data.items.length === 0 ? <EmptyRuns t={t}/> : <div className="space-y-3">{data.items.map((run) => <RunCard key={run.id} run={run} locale={locale} t={t} retrying={retryingRunId === run.id} allowRetry={!rule.archivedAt} onRetry={retryRun}/>)}</div>}</div>}
    {tab === 'test' && (rule.archivedAt ? <ArchivedNotice t={t}/> : <div className="space-y-4"><section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5"><FlaskConical className="text-sky-200/70" size={22}/><h3 className="mt-3 font-semibold text-white">{t.admin.automationRunDryTest}</h3><p className="mt-2 text-sm leading-6 text-white/45">{t.admin.automationDryRunDescription}</p><LoadingButton loading={testing} loadingLabel={t.common.loading} onClick={testRule} className="mt-5">{t.admin.automationRunDryTest}</LoadingButton></section>{isNotificationRule(rule) && <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5"><ShieldCheck className="text-accent/70" size={22}/><h3 className="mt-3 font-semibold text-white">{t.admin.automationTestNotification}</h3><p className="mt-2 text-sm leading-6 text-white/45">{t.admin.automationEnabledTestChannelsDescription}</p>{deliveryConfig(rule.config.delivery).channels.email && <p className={`mt-2 text-xs ${emailAvailability.available ? 'text-accent/65' : 'text-amber-100/65'}`}>{emailAvailability.available ? t.admin.automationTestWillEmail : t.admin.automationEmailSmtpUnavailable}</p>}<LoadingButton loading={testingNotification} loadingLabel={t.common.loading} onClick={testNotification} className="mt-5">{t.admin.automationSendTestNotification}</LoadingButton></section>}{latestTest && <RunCard run={latestTest} locale={locale} t={t} retrying={false} onRetry={retryRun}/>}</div>)}
    {tab === 'reliability' && <Reliability rule={rule} emailAvailability={emailAvailability} latestFailedRun={latestFailedRun} locale={locale} t={t}/>}
    {tab === 'history' && <div className="space-y-4"><LifecycleDetails data={draft} fallbackRule={rule} locale={locale} restoring={restoring} onRestore={restoreRule} t={t}/><DraftReview data={draft} error={draftError} locale={locale} action={draftAction} confirmingDiscard={confirmDiscard} archived={Boolean(rule.archivedAt)} onRetry={loadDraft} onPublish={publishDraft} onDiscard={() => setConfirmDiscard(true)} onCancelDiscard={() => setConfirmDiscard(false)} onConfirmDiscard={discardDraft} t={t}/><HistoryList data={versions} error={historyError} locale={locale} archived={Boolean(rule.archivedAt)} confirmingVersionId={confirmingVersionId} rollingBackId={rollingBackId} onRetry={loadHistory} onConfirm={setConfirmingVersionId} onRollback={rollbackVersion} t={t}/></div>}
    {tab === 'schedule' && <ScheduleView data={schedule} error={scheduleError} locale={locale} onRetry={loadSchedule} t={t}/>}</div></aside></div>, document.body);
}

function ArchivedNotice({ t }: { t: ReturnType<typeof useI18n>['t'] }) { return <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-5"><Archive className="text-white/30" size={21}/><h3 className="mt-3 font-semibold text-white/70">{t.admin.automationArchived}</h3><p className="mt-2 text-sm leading-6 text-white/42">{t.admin.automationArchivedRuleNotice} {t.admin.automationRunsHistoryPreserved}</p></section>; }

function LifecycleDetails({ data, fallbackRule, locale, restoring, onRestore, t }: { data: DraftResponse | null; fallbackRule: Rule; locale: string; restoring: boolean; onRestore: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  const lifecycle = data?.lifecycle ?? { archivedAt: fallbackRule.archivedAt ?? null, archivedBy: fallbackRule.archivedBy ?? null, archiveReason: fallbackRule.archiveReason ?? null, createdFromPreset: fallbackRule.createdFromPreset ?? null };
  if (!lifecycle.archivedAt && !lifecycle.createdFromPreset) return <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-accent/70"><CheckCircle2 size={15}/><span className="text-sm font-semibold text-white/68">{t.admin.automationActive}</span></div></section>;
  return <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex flex-wrap items-center gap-2">{lifecycle.archivedAt ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/50">{t.admin.automationArchived}</span> : <span className="rounded-full border border-accent/20 bg-accent/[0.07] px-2 py-0.5 text-[10px] font-semibold text-accent/75">{t.admin.automationActive}</span>}{lifecycle.createdFromPreset && <span className="text-xs text-white/42">{t.admin.automationCreatedFromPreset}: <span className="text-white/62">{lifecycle.createdFromPreset.name}</span></span>}</div>{lifecycle.archivedAt && <><p className="mt-3 text-sm font-semibold text-white/68">{t.admin.automationArchivedRuleNotice}</p><p className="mt-1 text-sm leading-6 text-white/40">{t.admin.automationRunsHistoryPreserved}</p><div className="mt-3 space-y-1 text-xs text-white/38"><p>{t.admin.automationArchivedAt}: {formatDate(lifecycle.archivedAt, locale)}</p>{lifecycle.archivedBy && <p>{t.admin.automationArchivedBy}: {lifecycle.archivedBy.name}</p>}{lifecycle.archiveReason && <p>{t.admin.automationArchiveReason}: {lifecycle.archiveReason}</p>}</div><LoadingButton loading={restoring} loadingLabel={t.common.loading} onClick={onRestore} className="mt-4 h-9 px-3 text-xs"><RotateCcw size={13}/>{t.admin.automationRestoreRule}</LoadingButton></>}</section>;
}

function DraftReview({ data, error, locale, action, confirmingDiscard, archived, onRetry, onPublish, onDiscard, onCancelDiscard, onConfirmDiscard, t }: { data: DraftResponse | null; error: boolean; locale: string; action: 'publish' | 'discard' | ''; confirmingDiscard: boolean; archived: boolean; onRetry: () => void; onPublish: () => void; onDiscard: () => void; onCancelDiscard: () => void; onConfirmDiscard: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  if (error) return <TableErrorState title={t.admin.automationDraftLoadFailed} retryLabel={t.common.retry} onRetry={onRetry}/>;
  if (!data) return <TableSkeleton rows={2} columns={2}/>;
  if (!data.hasDraft || !data.draft) return <section className="rounded-xl border border-dashed border-white/10 p-5"><p className="text-sm font-semibold text-white/55">{t.admin.automationNoDraftChanges}</p></section>;
  const blocked = !data.validation.valid || archived;
  return <section className="rounded-xl border border-amber-200/15 bg-amber-300/[0.035] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-full border border-amber-200/15 bg-amber-300/[0.06] px-2 py-0.5 text-[10px] font-semibold text-amber-100/75">{data.staleDraft ? t.admin.automationDraftStale : t.admin.automationDraft}</span><h3 className="text-sm font-semibold text-white/75">{t.admin.automationDraftChangesAvailable}</h3></div>{data.draft.updatedBy && <div className="mt-2 flex items-center gap-2"><ProfilePhoto name={data.draft.updatedBy.name} avatarUrl={data.draft.updatedBy.avatarUrl} size="sm" className="h-6 w-6 rounded-full text-[8px]"/><p className="text-xs text-white/38">{data.draft.updatedBy.name} · {formatDate(data.draft.updatedAt, locale)}</p></div>}{data.staleDraft && <div className="mt-3 rounded-lg border border-amber-200/10 bg-amber-300/[0.04] p-3"><p className="text-xs font-semibold text-amber-100/72">{t.admin.automationDraftStaleDescription}</p><p className="mt-1 text-xs leading-5 text-amber-100/48">{t.admin.automationDraftStaleAction}</p></div>}</div></div>
    <div className="mt-4 space-y-2">{data.diff.length ? data.diff.map((row) => <div key={row.field} className="rounded-lg border border-white/[0.07] bg-black/15 p-3"><p className="text-xs font-semibold text-white/55">{draftFieldLabel(row.field, t)}</p><div className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><p className="text-white/35"><span className="font-semibold text-white/48">{t.admin.automationLiveValue}:</span> {draftValueLabel(row.field, row.liveValue, t)}</p><p className="text-amber-100/65"><span className="font-semibold">{t.admin.automationDraftValue}:</span> {draftValueLabel(row.field, row.draftValue, t)}</p></div></div>) : <p className="text-sm text-white/38">{t.admin.automationNoDraftChanges}</p>}</div>
    <ValidationInfo validation={data.validation} t={t}/>
    {blocked && <p className="mt-3 text-xs font-semibold text-rose-100/75">{t.admin.automationDraftPublishBlocked}</p>}
    {confirmingDiscard ? <div className="mt-4 rounded-lg border border-rose-200/10 bg-rose-300/[0.04] p-3"><p className="text-xs leading-5 text-rose-100/65">{t.admin.automationDiscardDraftConfirmation}</p><div className="mt-3 flex gap-2"><LoadingButton loading={action === 'discard'} loadingLabel={t.common.loading} onClick={onConfirmDiscard} className="h-8 bg-rose-200 px-3 text-xs text-rose-950 hover:bg-rose-100">{t.admin.automationDiscardDraft}</LoadingButton><button type="button" disabled={Boolean(action)} onClick={onCancelDiscard} className="h-8 rounded-full border border-white/10 px-3 text-xs font-semibold text-white/50 hover:bg-white/[0.05] disabled:opacity-40">{t.common.cancel}</button></div></div> : <div className="mt-4 flex flex-wrap gap-2"><LoadingButton loading={action === 'publish'} loadingLabel={t.common.loading} disabled={blocked || Boolean(action)} onClick={onPublish}>{t.admin.automationPublishDraft}</LoadingButton><button type="button" disabled={Boolean(action)} onClick={onDiscard} className="h-10 rounded-full border border-rose-200/15 px-4 text-sm font-semibold text-rose-100/65 hover:bg-rose-300/[0.06] disabled:opacity-40">{t.admin.automationDiscardDraft}</button></div>}
  </section>;
}

function HistoryList({ data, error, locale, archived, confirmingVersionId, rollingBackId, onRetry, onConfirm, onRollback, t }: { data: VersionsResponse | null; error: boolean; locale: string; archived: boolean; confirmingVersionId: string; rollingBackId: string; onRetry: () => void; onConfirm: (id: string) => void; onRollback: (version: RuleVersion) => void; t: ReturnType<typeof useI18n>['t'] }) {
  if (error) return <TableErrorState title={t.admin.automationHistoryLoadFailed} retryLabel={t.common.retry} onRetry={onRetry}/>;
  if (!data) return <TableSkeleton rows={5} columns={2}/>;
  if (!data.items.length) return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center"><History className="mx-auto text-white/20" size={24}/><p className="mt-3 font-semibold text-white/60">{t.admin.automationNoVersionHistory}</p></div>;
  return <div className="space-y-3">{data.items.map((version) => {
    const confirming = confirmingVersionId === version.id;
    return <article key={version.id} className={`rounded-xl border p-4 ${version.isCurrent ? 'border-accent/20 bg-accent/[0.045]' : 'border-white/[0.08] bg-black/15'}`}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-white/75">{t.admin.automationVersion} {version.version}</span>{version.isCurrent && <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">{t.admin.automationCurrentVersion}</span>}<span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-0.5 text-[10px] font-semibold text-white/45">{automationChangeTypeLabel(version.changeType, t)}</span><span className="ml-auto text-[10px] text-white/30">{formatDate(version.createdAt, locale)}</span></div><p className="mt-3 text-sm leading-6 text-white/58">{automationChangeSummary(version.changeSummary, version.changeType, t)}</p><p className="mt-2 text-xs text-white/38">{automationVersionConfigSummary(version, t)}</p>{version.changedBy && <div className="mt-3 flex items-center gap-2"><ProfilePhoto name={version.changedBy.name} avatarUrl={version.changedBy.avatarUrl} size="sm" className="h-6 w-6 rounded-full text-[8px]"/><span className="text-xs text-white/38">{t.admin.automationChangedBy} {version.changedBy.name}</span></div>}{!archived && !version.isCurrent && (confirming ? <div className="mt-4 rounded-lg border border-amber-200/10 bg-amber-300/[0.035] p-3"><p className="text-xs leading-5 text-amber-100/65">{t.admin.automationRollbackConfirmation(version.version)}</p><div className="mt-3 flex gap-2"><LoadingButton loading={rollingBackId === version.id} loadingLabel={t.common.loading} onClick={() => onRollback(version)} className="h-8 px-3 text-xs">{t.admin.automationRollback}</LoadingButton><button type="button" disabled={Boolean(rollingBackId)} onClick={() => onConfirm('')} className="h-8 rounded-full border border-white/10 px-3 text-xs font-semibold text-white/50 hover:bg-white/[0.05] disabled:opacity-50">{t.common.cancel}</button></div></div> : <button type="button" onClick={() => onConfirm(version.id)} className="mt-4 inline-flex h-8 items-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-white/55 hover:border-accent/20 hover:bg-accent/[0.05] hover:text-accent"><RotateCcw size={13}/>{t.admin.automationRollbackToVersion}</button>)}</article>;
  })}</div>;
}

function ScheduleView({ data, error, locale, onRetry, t }: { data: ScheduleResponse | null; error: boolean; locale: string; onRetry: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  if (error) return <TableErrorState title={t.admin.automationScheduleLoadFailed} retryLabel={t.common.retry} onRetry={onRetry}/>;
  if (!data) return <TableSkeleton rows={6} columns={2}/>;
  const state = scheduleStatePresentation(data.scheduleState, t);
  return <div className="space-y-3">
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-accent/70"><CalendarClock size={17}/><h3 className="text-sm font-semibold text-white/72">{t.admin.automationScheduleState}</h3></div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${state.tone}`}>{state.label}</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <ScheduleMetric label={t.admin.automationLastEvaluated} value={data.lastEvaluatedAt ? formatDate(data.lastEvaluatedAt, locale) : t.admin.automationNotRecorded}/>
        <ScheduleMetric label={t.admin.automationLastLiveRun} value={data.lastLiveRunAt ? formatDate(data.lastLiveRunAt, locale) : t.admin.automationNotRecorded}/>
        <ScheduleMetric label={t.admin.automationNextCheck} value={scheduleCheckLabel(data.nextCheckCode, t)}/>
        <ScheduleMetric label={t.admin.automationNextEligibleAction} value={data.nextEligibleAt ? formatDate(data.nextEligibleAt, locale) : t.admin.automationNoEligibleAction}/>
      </div>
    </section>
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-accent/70"><Activity size={16}/><h3 className="text-sm font-semibold text-white/72">{t.admin.automationCurrentMatchingState}</h3></div>
      <p className="mt-2 text-sm text-white/52">{currentMatchLabel(data.matching.currentMatches, t)}</p>
      {data.matching.upcomingMatches !== null && data.matching.upcomingMatches > 0 && <p className="mt-1 text-xs text-white/35">{t.admin.automationTasksMayMatchLater(data.matching.upcomingMatches)}</p>}
      {data.matching.affectedTasks.length > 0 && <div className="mt-3 space-y-2">{data.matching.affectedTasks.map((task) => <div key={task.id} className="rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2.5"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-white/68">{task.title}</p>{task.dueDate && <span className="shrink-0 text-[10px] text-white/30">{formatDate(task.dueDate, locale)}</span>}</div><p className="mt-1 text-xs text-white/35">{scheduleTaskReason(task.reasonCode, t)}</p></div>)}</div>}
    </section>
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <h3 className="text-sm font-semibold text-white/72">{data.scheduleState === 'READY' ? t.admin.automationScheduleDetails : t.admin.automationWhyNotRunning}</h3>
      <div className="mt-3 space-y-2">{data.reasons.length ? data.reasons.map((reason, index) => <div key={`${reason.code}-${index}`} className={`flex items-start gap-2 text-sm leading-5 ${reason.severity === 'ERROR' ? 'text-rose-100/75' : reason.severity === 'WARNING' ? 'text-amber-100/70' : 'text-white/44'}`}>{reason.severity === 'ERROR' || reason.severity === 'WARNING' ? <AlertTriangle className="mt-0.5 shrink-0" size={13}/> : <CheckCircle2 className="mt-0.5 shrink-0 text-accent/55" size={13}/>}<span>{scheduleReasonLabel(reason, t)}</span></div>) : <p className="text-sm text-white/38">{t.admin.automationNoScheduleReasons}</p>}</div>
    </section>
    <Info icon={<Activity size={16}/>} title={t.admin.automationWorker} body={data.worker.available && data.worker.status === 'ACTIVE' ? data.worker.label ?? t.admin.automationWorkerActive : t.admin.automationWorkerHeartbeatNotTracked}/>
  </div>;
}

function ScheduleMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-white/[0.07] bg-black/15 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">{label}</p><p className="mt-1.5 text-sm font-semibold leading-5 text-white/62">{value}</p></div>; }

function RunCard({ run, locale, t, retrying, allowRetry = true, onRetry }: { run: Run; locale: string; t: ReturnType<typeof useI18n>['t']; retrying: boolean; allowRetry?: boolean; onRetry: (run: Run) => void }) { const tone = run.status === 'SUCCESS' ? 'border-accent/20 bg-accent/[0.06] text-accent' : run.status === 'FAILED' ? 'border-rose-200/20 bg-rose-300/[0.06] text-rose-100' : 'border-amber-200/15 bg-amber-300/[0.05] text-amber-100/75'; const mode = run.mode === 'DRY_RUN' ? t.admin.automationDryRun : run.mode === 'TEST_NOTIFICATION' ? t.admin.automationTestNotification : t.admin.automationLive; const chips = deliveryResultChips(run, t); const retryable = allowRetry && run.status === 'FAILED' && run.mode === 'LIVE'; const failure = run.status === 'FAILED' ? failureCopy(run, t) : null; return <article className="rounded-xl border border-white/[0.08] bg-black/15 p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{run.status === 'SUCCESS' ? t.admin.automationSuccess : run.status === 'FAILED' ? t.admin.automationFailed : t.admin.automationSkipped}</span><span className="rounded-full border border-sky-200/15 bg-sky-300/[0.05] px-2 py-0.5 text-[10px] font-semibold text-sky-100/65">{mode}</span><span className="ml-auto text-[10px] text-white/30">{formatDate(run.startedAt, locale)}</span></div>{run.task?.title && <p className="mt-3 text-sm font-semibold text-white/72">{run.task.title}</p>}<p className="mt-2 text-sm leading-6 text-white/46">{runSummary(run, t)}</p>{failure && <div className="mt-3 rounded-lg border border-rose-200/10 bg-rose-300/[0.04] p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100/55">{t.admin.automationFailureCategory}: {failure.category}</p><p className="mt-1 text-xs leading-5 text-rose-100/68">{failure.reason}</p></div>}{chips.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((chip) => <span key={chip} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[10px] font-semibold text-white/48">{chip}</span>)}</div>}{retryable && <button type="button" onClick={() => onRetry(run)} disabled={retrying} className="mt-3 h-8 rounded-full border border-accent/20 bg-accent/[0.08] px-3 text-xs font-semibold text-accent transition hover:bg-accent/[0.13] disabled:cursor-wait disabled:opacity-60">{retrying ? t.admin.automationRetrying : t.admin.automationRetryRun}</button>}</article>; }
function EmptyRuns({ t }: { t: ReturnType<typeof useI18n>['t'] }) { return <div className="rounded-xl border border-dashed border-white/10 p-8 text-center"><Clock3 className="mx-auto text-white/20" size={24}/><p className="mt-3 font-semibold text-white/60">{t.admin.automationNoRuns}</p><p className="mt-1 text-sm text-white/35">{t.admin.automationNoRunsDescription}</p></div>; }
function Reliability({ rule, emailAvailability, latestFailedRun, locale, t }: { rule: Rule; emailAvailability: EmailAvailability; latestFailedRun: Run | null; locale: string; t: ReturnType<typeof useI18n>['t'] }) { return <div className="space-y-3"><ValidationInfo validation={rule.validation} t={t}/><Info icon={rule.enabled ? <CheckCircle2 size={16}/> : <AlertTriangle size={16}/>} title={rule.enabled ? t.admin.automationEnabled : t.admin.automationRuleDisabled} body={rule.lastRunAt ? `${t.admin.automationLastRun}: ${formatDate(rule.lastRunAt, locale)}` : t.admin.automationRuleNeverRun}/><DeliveryInfo rule={rule} emailAvailability={emailAvailability} t={t}/><Info icon={<ShieldCheck size={16}/>} title={t.admin.automationDedupeProtection} body={dedupeCopy(rule, t)}/><Info icon={<CheckCircle2 size={16}/>} title={t.admin.automationRecipientTargets} body={recipientCopy(rule, t)}/><Info icon={latestFailedRun ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} title={t.admin.automationRetryAvailability} body={latestFailedRun ? t.admin.automationRetryAvailable : t.admin.automationNoRetryAvailable}/></div>; }
function ValidationInfo({ validation, t }: { validation?: AutomationValidationResult; t: ReturnType<typeof useI18n>['t'] }) { const items = validation?.items ?? []; return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-accent/70">{validation?.valid === false ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>}<h3 className="text-sm font-semibold text-white/72">{t.admin.automationValidation}</h3></div>{items.length ? <div className="mt-3 space-y-2">{items.map((item) => <p key={`${item.code}-${item.field ?? ''}`} className={`flex items-start gap-2 text-sm leading-5 ${item.severity === 'ERROR' ? 'text-rose-100/75' : item.severity === 'WARNING' ? 'text-amber-100/70' : 'text-sky-100/60'}`}>{item.severity === 'INFO' ? <CheckCircle2 className="mt-0.5 shrink-0" size={13}/> : <AlertTriangle className="mt-0.5 shrink-0" size={13}/>}<span>{automationValidationMessage(item.code, t)}</span></p>)}</div> : <p className="mt-2 text-sm leading-6 text-white/42">{validation ? t.admin.automationRuleConfigurationValid : t.admin.automationRuleCheckUnavailable}</p>}</div>; }
function DeliveryInfo({ rule, emailAvailability, t }: { rule: Rule; emailAvailability: EmailAvailability; t: ReturnType<typeof useI18n>['t'] }) { if (!isNotificationRule(rule)) return <Info icon={<ShieldCheck size={16}/>} title={t.admin.automationDelivery} body={t.admin.automationNoNotificationDelivery}/>; const delivery = deliveryConfig(rule.config.delivery); const recipients = recipientCopy(rule, t); const emailState = delivery.channels.email ? (emailAvailability.available ? t.admin.automationEnabled : t.admin.automationSmtpUnavailable) : t.admin.automationDisabled; const body = [
  `${t.admin.automationInApp}: ${delivery.channels.inApp ? t.admin.automationEnabled : t.admin.automationDisabled}`,
  `${t.admin.automationEmail}: ${emailState}`,
  `SMTP: ${emailAvailability.available ? t.admin.automationSmtpAvailable : t.admin.automationSmtpNotConfigured}`,
  `${t.admin.automationRecipients}: ${recipients}`,
  `${t.admin.automationDeepLink}: ${delivery.includeDeepLink ? t.admin.automationIncluded : t.admin.automationNotIncluded}`,
  `${t.admin.automationDedupeProtection}: ${t.admin.automationEnabled}`,
].join(' · '); return <Info icon={<ShieldCheck size={16}/>} title={t.admin.automationDelivery} body={body}/>; }
function Info({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) { return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-accent/70">{icon}<h3 className="text-sm font-semibold text-white/72">{title}</h3></div><p className="mt-2 text-sm leading-6 text-white/42">{body}</p></div>; }
function runSummary(run: Run, t: ReturnType<typeof useI18n>['t']) {
  if (run.summary === 'lifecycle_suppressed') return automationSkipReason(run.details?.skipReason, t);
  if (run.summary === 'dry_run_no_matches') return t.admin.automationNoMatchingTasks;
  if (run.summary === 'dry_run_matches') {
    const channelValues = Array.isArray(run.details?.deliveryChannels) ? run.details.deliveryChannels : [];
    const channels = channelValues.map((channel) => channel === 'EMAIL' ? t.admin.automationEmail : t.admin.automationInApp).join(' + ');
    const summary = channels ? t.admin.automationDryRunChannelMatches(Number(run.details?.matchingTaskCount ?? 0), Number(run.details?.eligibleRecipientCount ?? 0), channels) : t.admin.automationDryRunMatches(Number(run.details?.matchingTaskCount ?? 0), Number(run.details?.eligibleRecipientCount ?? 0));
    return channelValues.includes('EMAIL') && run.details?.emailAvailable === false ? `${summary} ${t.admin.automationEmailSmtpUnavailable}` : summary;
  }
  if (run.summary === 'no_supported_delivery_channel') return t.admin.automationNoSupportedChannel;
  if (run.summary === 'email_queue_failed') return t.admin.automationEmailFailed;
  if (run.summary === 'test_notification_sent') return t.admin.automationTestNotificationSent;
  if (run.summary === 'already_notified') return t.admin.automationAlreadyNotified;
  if (run.summary === 'task_auto_completed') return t.admin.automationMovedTask;
  if (run.summary === 'checklist_incomplete') return t.admin.automationChecklistIncomplete;
  if (run.summary === 'notifications_created') return t.admin.automationNotificationsCreated(Number(run.details?.createdNotificationCount ?? 0));
  if (run.summary === 'retry_state_no_longer_matches') return t.admin.automationRetryStateNoLongerMatches;
  if (run.summary === 'retry_failed') return t.admin.automationRetryFailed;
  if (run.summary === 'unassigned_tasks_found') return t.admin.automationUnassignedTasksFound(Number(run.details?.unassignedTaskCount ?? 0));
  return run.summary ?? t.common.empty;
}
function automationSkipReason(reason: unknown, t: ReturnType<typeof useI18n>['t']) { if (reason === 'BOARD_PAUSED') return t.admin.automationSkippedBoardPaused; if (reason === 'BOARD_COMPLETED') return t.admin.automationSkippedBoardCompleted; if (reason === 'BOARD_ARCHIVED') return t.admin.automationSkippedBoardArchived; if (reason === 'EVENT_ENDED') return t.admin.automationSkippedEventEnded; if (reason === 'AUTOMATION_PAUSED') return t.admin.automationSkippedRuleDisabled; if (reason === 'AUTOMATION_ARCHIVED') return t.admin.automationSkippedRuleArchived; if (reason === 'TASK_COMPLETED') return t.admin.automationSkippedTaskCompleted; if (reason === 'TASK_ARCHIVED') return t.admin.automationSkippedTaskArchived; return t.admin.automationSkippedNoLongerApplicable; }
function failureCopy(run: Run, t: ReturnType<typeof useI18n>['t']) { const categoryKey = typeof run.details?.failureCategory === 'string' ? run.details.failureCategory : run.errorCode ?? 'EXECUTION_ERROR'; const reason = typeof run.details?.safeReason === 'string' ? run.details.safeReason : run.errorMessage ?? t.admin.automationFailureExecution; return { category: failureCategoryLabel(categoryKey, t), reason }; }
function failureCategoryLabel(category: string, t: ReturnType<typeof useI18n>['t']) { if (category === 'CONFIGURATION_ERROR') return t.admin.automationFailureConfiguration; if (category === 'SMTP_UNAVAILABLE') return t.admin.automationFailureSmtp; if (category === 'TEMPLATE_ERROR') return t.admin.automationFailureTemplate; if (category === 'RECIPIENT_ERROR') return t.admin.automationFailureRecipient; return t.admin.automationFailureExecution; }
function dedupeCopy(rule: Rule, t: ReturnType<typeof useI18n>['t']) { if (rule.type === 'DUE_BEFORE') return t.admin.automationDedupeDue; if (rule.type === 'OVERDUE') return rule.config.repeatDaily === true ? t.admin.automationDedupeOverdueDaily : t.admin.automationDedupeOverdueOnce; if (rule.type === 'STALE_TASK_FOLLOW_UP') return t.admin.automationDedupeStale; if (rule.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return t.admin.automationDedupeChecklistDue; if (rule.type === 'OVERDUE_ESCALATION') return rule.config.repeatDaily === true ? t.admin.automationDedupeOverdueDaily : t.admin.automationDedupeEscalation; return t.admin.automationDedupeMutation; }
function recipientCopy(rule: Rule, t: ReturnType<typeof useI18n>['t']) { const values = [rule.config.notifyAssignees === true ? t.admin.automationAssignees : '', rule.config.notifyAdmins === true ? t.admin.automationAdmins : ''].filter(Boolean); return values.length ? values.join(', ') : t.admin.automationNoRecipients; }
function automationChangeTypeLabel(type: RuleVersion['changeType'], t: ReturnType<typeof useI18n>['t']) { if (type === 'CREATED') return t.admin.automationVersionCreated; if (type === 'ROLLED_BACK') return t.admin.automationVersionRolledBack; return t.admin.automationVersionUpdated; }
function automationChangeSummary(summary: string | null, changeType: RuleVersion['changeType'], t: ReturnType<typeof useI18n>['t']) {
  if (!summary) return changeType === 'CREATED' ? t.admin.automationRuleCreatedSummary : changeType === 'ROLLED_BACK' ? t.admin.automationRuleRolledBackSummary : t.admin.automationRuleUpdatedSummary;
  if (summary === 'RULE_CREATED') return t.admin.automationRuleCreatedSummary;
  if (summary === 'RULE_ENABLED') return t.admin.automationRuleEnabledSummary;
  if (summary === 'RULE_DISABLED') return t.admin.automationRuleDisabledSummary;
  if (summary === 'RULE_ARCHIVED') return t.admin.automationRuleArchivedSummary;
  if (summary === 'RULE_RESTORED') return t.admin.automationRuleRestoredSummary;
  if (summary === 'RECIPIENTS_CHANGED') return t.admin.automationRecipientsChangedSummary;
  if (summary === 'EMAIL_ENABLED') return t.admin.automationEmailEnabledSummary;
  if (summary === 'EMAIL_DISABLED') return t.admin.automationEmailDisabledSummary;
  if (summary === 'REPEAT_DAILY_ENABLED') return t.admin.automationRepeatDailyEnabledSummary;
  if (summary === 'REPEAT_DAILY_DISABLED') return t.admin.automationRepeatDailyDisabledSummary;
  if (summary === 'DELIVERY_SETTINGS_CHANGED') return t.admin.automationDeliveryChangedSummary;
  if (summary.startsWith('HOURS_BEFORE_DUE:')) { const [, before, after] = summary.split(':'); return t.admin.automationReminderChangedSummary(before, after); }
  if (summary.startsWith('INACTIVE_DAYS:')) { const [, before, after] = summary.split(':'); return t.admin.automationInactiveChangedSummary(before, after); }
  if (summary.startsWith('GRACE_DAYS:')) { const [, before, after] = summary.split(':'); return t.admin.automationGraceChangedSummary(before, after); }
  if (summary.startsWith('ROLLED_BACK:')) return t.admin.automationRolledBackToVersionSummary(Number(summary.split(':')[1]));
  return t.admin.automationRuleUpdatedSummary;
}
function automationVersionConfigSummary(version: RuleVersion, t: ReturnType<typeof useI18n>['t']) {
  const status = version.enabled ? t.admin.automationEnabled : t.admin.automationDisabled;
  const type = version.type === 'DUE_BEFORE' ? t.admin.automationDueBefore : version.type === 'OVERDUE' ? t.admin.automationOverdue : version.type === 'STALE_TASK_FOLLOW_UP' ? t.admin.automationStaleTaskFollowUp : version.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE' ? t.admin.automationChecklistIncompleteBeforeDue : version.type === 'OVERDUE_ESCALATION' ? t.admin.automationOverdueEscalation : version.type === 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE' ? t.admin.automationAutoComplete : t.admin.automationFlagUnassigned;
  if (version.type === 'DUE_BEFORE' || version.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return `${type} · ${Number(version.config.hoursBeforeDue ?? 24)}h · ${status}`;
  if (version.type === 'STALE_TASK_FOLLOW_UP') return `${type} · ${Number(version.config.inactiveDays ?? 3)}d · ${status}`;
  if (version.type === 'OVERDUE_ESCALATION') return `${type} · ${Number(version.config.graceDays ?? 2)}d · ${status}`;
  return `${type} · ${status}`;
}
function draftFieldLabel(field: string, t: ReturnType<typeof useI18n>['t']) { if (field === 'name') return t.common.name; if (field === 'enabled') return t.common.status; if (field === 'hoursBeforeDue') return t.admin.automationReminderTiming; if (field === 'inactiveDays') return t.admin.automationInactiveFor; if (field === 'graceDays') return t.admin.automationEscalateAfter; if (field === 'recipients') return t.admin.automationRecipients; if (field === 'delivery') return t.admin.automationDelivery; if (field === 'repeatDaily') return t.admin.automationRepeatDaily; if (field === 'requireChecklist') return t.admin.automationRequireChecklist; return t.admin.automationShowUnassigned; }
function draftValueLabel(field: string, value: string, t: ReturnType<typeof useI18n>['t']) { if (field === 'name') return value || t.admin.automationDefaultRuleName; if (field === 'hoursBeforeDue') return `${value}h`; if (field === 'inactiveDays' || field === 'graceDays') return `${value}d`; if (value === 'ENABLED') return t.admin.automationEnabled; if (value === 'DISABLED') return t.admin.automationDisabled; if (value === 'DAILY') return t.admin.automationOverdueDaily; if (value === 'ONCE') return t.admin.automationOverdueOnce; if (value === 'YES') return t.admin.automationYes; if (value === 'NO' || value === 'NONE') return t.admin.automationNo; return value.split('+').map((part) => part === 'ASSIGNEES' ? t.admin.automationAssignees : part === 'ADMINS' ? t.admin.automationAdmins : part === 'IN_APP' ? t.admin.automationInApp : part === 'EMAIL' ? t.admin.automationEmail : part).join(' + '); }
function automationApiErrorCode(error: unknown) { if (!(error instanceof Error)) return ''; try { const parsed = JSON.parse(error.message) as { code?: unknown; message?: { code?: unknown } }; return typeof parsed.code === 'string' ? parsed.code : typeof parsed.message?.code === 'string' ? parsed.message.code : ''; } catch { return ''; } }
function scheduleStatePresentation(state: ScheduleResponse['scheduleState'], t: ReturnType<typeof useI18n>['t']) {
  if (state === 'READY') return { label: t.admin.automationScheduleReady, tone: 'border-accent/20 bg-accent/10 text-accent' };
  if (state === 'BLOCKED') return { label: t.admin.automationScheduleBlocked, tone: 'border-rose-200/20 bg-rose-300/[0.06] text-rose-100' };
  if (state === 'DISABLED') return { label: t.admin.automationScheduleDisabled, tone: 'border-white/10 bg-white/[0.04] text-white/42' };
  if (state === 'WAITING') return { label: t.admin.automationScheduleWaiting, tone: 'border-amber-200/15 bg-amber-300/[0.05] text-amber-100/75' };
  return { label: t.admin.automationScheduleUnknown, tone: 'border-white/10 bg-white/[0.04] text-white/42' };
}
function scheduleCheckLabel(code: ScheduleResponse['nextCheckCode'], t: ReturnType<typeof useI18n>['t']) { if (code === 'DISABLED') return t.admin.automationNotScheduledWhileDisabled; if (code === 'HOURLY_WORKER_CYCLE') return t.admin.automationHourlyWorkerCycle; if (code === 'CHECKLIST_CHANGE') return t.admin.automationChecklistChangeCheck; return t.admin.automationBoardReadCheck; }
function currentMatchLabel(count: number, t: ReturnType<typeof useI18n>['t']) { return count === 0 ? t.admin.automationNoCurrentMatchesForRule : count === 1 ? t.admin.automationOneTaskCurrentlyMatches : t.admin.automationTasksCurrentlyMatch(count); }
function scheduleTaskReason(code: string, t: ReturnType<typeof useI18n>['t']) { if (code === 'DUE_WITHIN_WINDOW') return t.admin.automationTaskInsideReminderWindow; if (code === 'TASK_OVERDUE') return t.admin.automationTaskIsOverdue; if (code === 'TASK_INACTIVE') return t.admin.automationTaskIsInactive; if (code === 'CHECKLIST_INCOMPLETE_NEAR_DUE') return t.admin.automationTaskChecklistIncompleteNearDue; if (code === 'TASK_OVERDUE_BEYOND_GRACE') return t.admin.automationTaskBeyondGrace; if (code === 'CHECKLIST_COMPLETE') return t.admin.automationTaskChecklistComplete; return t.admin.automationTaskIsUnassigned; }
function scheduleReasonLabel(reason: ScheduleReason, t: ReturnType<typeof useI18n>['t']) {
  if (['BOARD_PAUSED', 'BOARD_COMPLETED', 'BOARD_ARCHIVED', 'EVENT_ENDED', 'AUTOMATION_PAUSED', 'AUTOMATION_ARCHIVED', 'TASK_COMPLETED', 'TASK_ARCHIVED', 'RULE_NO_LONGER_APPLICABLE'].includes(reason.code)) return automationSkipReason(reason.code, t);
  if (reason.code === 'RULE_ARCHIVED') return t.admin.automationArchivedRuleNotice;
  if (reason.code === 'RULE_DISABLED') return t.admin.automationRuleDisabled;
  if (reason.code === 'CURRENT_MATCHES') return currentMatchLabel(reason.count ?? 0, t);
  if (reason.code === 'STALE_TASKS_MATCH') return t.admin.automationStaleTasksMatch(reason.count ?? 0, reason.days ?? 0);
  if (reason.code === 'INCOMPLETE_CHECKLISTS_MATCH') return t.admin.automationIncompleteChecklistsMatch(reason.count ?? 0, reason.hours ?? 0);
  if (reason.code === 'ESCALATION_TASKS_MATCH') return t.admin.automationEscalationTasksMatch(reason.count ?? 0, reason.days ?? 0);
  if (reason.code === 'NO_TASKS_IN_REMINDER_WINDOW') return t.admin.automationNoTasksInReminderWindow;
  if (reason.code === 'TASKS_MAY_MATCH_LATER') return t.admin.automationTasksMayMatchLater(reason.count ?? 0);
  if (reason.code === 'NO_OVERDUE_MATCHES') return t.admin.automationNoOverdueMatches;
  if (reason.code === 'NO_STALE_TASK_MATCHES') return t.admin.automationNoStaleTaskMatches;
  if (reason.code === 'NO_INCOMPLETE_CHECKLIST_MATCHES') return t.admin.automationNoIncompleteChecklistMatches;
  if (reason.code === 'NO_ESCALATION_MATCHES') return t.admin.automationNoEscalationMatches;
  if (reason.code === 'REPEAT_DAILY_ENABLED') return t.admin.automationRepeatDailyScheduleEnabled;
  if (reason.code === 'REPEAT_DAILY_DISABLED') return t.admin.automationRepeatDailyScheduleDisabled;
  if (reason.code === 'TASKS_READY_TO_COMPLETE') return t.admin.automationTasksReadyToComplete(reason.count ?? 0);
  if (reason.code === 'NO_COMPLETED_CHECKLIST') return t.admin.automationNoCompletedChecklist;
  if (reason.code === 'WAITS_FOR_CHECKLIST_CHANGES') return t.admin.automationWaitsForChecklistChanges;
  if (reason.code === 'UNASSIGNED_TASKS_MATCH') return t.admin.automationUnassignedTasksMatch(reason.count ?? 0);
  if (reason.code === 'NO_UNASSIGNED_MATCHES') return t.admin.automationNoUnassignedMatches;
  if (reason.code === 'NO_ELIGIBLE_RECIPIENTS') return t.admin.automationNoEligibleScheduleRecipients;
  return automationValidationMessage(reason.code, t);
}
function isNotificationRule(rule: Rule) { return rule.type === 'DUE_BEFORE' || rule.type === 'OVERDUE' || rule.type === 'STALE_TASK_FOLLOW_UP' || rule.type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE' || rule.type === 'OVERDUE_ESCALATION'; }
function deliveryConfig(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value)) return { channels: { inApp: true, email: false }, includeDeepLink: true, dedupeEnabled: true }; const delivery = value as Record<string, unknown>; const channels = delivery.channels && typeof delivery.channels === 'object' && !Array.isArray(delivery.channels) ? delivery.channels as Record<string, unknown> : {}; return { channels: { inApp: channels.inApp !== false, email: channels.email === true }, includeDeepLink: delivery.includeDeepLink !== false, dedupeEnabled: true }; }
function deliveryResultChips(run: Run, t: ReturnType<typeof useI18n>['t']) { const results = run.details?.results; if (!results || typeof results !== 'object' || Array.isArray(results)) return []; const values = results as Record<string, unknown>; const inApp = values.inApp && typeof values.inApp === 'object' && !Array.isArray(values.inApp) ? values.inApp as Record<string, unknown> : null; const email = values.email && typeof values.email === 'object' && !Array.isArray(values.email) ? values.email as Record<string, unknown> : null; const chips: string[] = []; if (Number(inApp?.created ?? 0) > 0) chips.push(`${t.admin.automationInApp}: ${Number(inApp?.created)} ${t.admin.automationCreated}`); if (Number(email?.queued ?? 0) > 0) chips.push(`${t.admin.automationEmail}: ${Number(email?.queued)} ${t.admin.automationQueued}`); if (Number(email?.skipped ?? 0) > 0) chips.push(`${t.admin.automationEmail}: ${Number(email?.skipped)} ${t.admin.automationSkipped.toLocaleLowerCase()}`); if (Number(email?.failed ?? 0) > 0) chips.push(`${t.admin.automationEmail}: ${Number(email?.failed)} ${t.admin.automationFailed.toLocaleLowerCase()}`); return chips; }
