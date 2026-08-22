'use client';

import { AlertTriangle, FileText, LayoutList, Plus, Search, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { ProfilePhoto } from '../../../components/profile-photo';
import { AppShell } from '../../../components/shell';
import { TaskTemplateManager } from '../../../components/task-template-manager';
import { AutomationPresetManager } from '../../../components/automation-preset-manager';
import {
  Card,
  ConfirmDialog,
  DataTablePagination,
  LoadingButton,
  StatusBadge,
  TableEmptyState,
  TableErrorState,
  TableSkeleton,
} from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type EventOption = { id: string; title: string };
type TaskBoardItem = {
  id: string;
  name: string;
  description?: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  eventEnded: boolean;
  linkedEvent?: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
  taskCounts: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
  };
  checklistProgress: { completed: number; total: number };
  assignees: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
  }>;
};
type TaskBoardResponse = {
  items: TaskBoardItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  metrics: {
    totalBoards: number;
    activeBoards: number;
    atRiskBoards: number;
    standaloneBoards: number;
    eventLinkedBoards: number;
  };
};
type AutomationRange = '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'all';
type AutomationMetricComparison = {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | 'new' | 'unavailable';
  sentiment: 'positive' | 'negative' | 'neutral';
  sparkline: Array<{ date: string; value: number }>;
};
type AutomationIssue = {
  id: string;
  boardId: string;
  boardName: string;
  ruleId: string;
  ruleName: string;
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  mode: string;
  summary?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  lastRunAt: string;
  taskTitle?: string | null;
};
type AutomationOverview = {
  range: { preset: AutomationRange; timezone: string; from: string | null; to: string; previousFrom: string | null; previousTo: string | null };
  metrics: {
    activeRules: { value: number };
    runs: AutomationMetricComparison;
    failedRuns: AutomationMetricComparison;
    emailNotificationsSent: AutomationMetricComparison;
  };
  recentIssues: AutomationIssue[];
};
type TaskBoardsTab = 'boards' | 'automations-templates';
type AutomationTemplateTab = 'automation-presets' | 'task-templates';
const automationRanges: AutomationRange[] = ['7d', '30d', '90d', 'this_month', 'last_month', 'all'];

function isAutomationRange(value: string | null): value is AutomationRange {
  return Boolean(value && automationRanges.includes(value as AutomationRange));
}

const initialForm = {
  eventId: '',
  name: '',
  description: '',
  visibility: 'PRIVATE' as 'PRIVATE' | 'PUBLIC',
};

export default function AdminTaskBoardsPage() {
  const { lang, t } = useI18n();
  const [activeTab, setActiveTab] = useState<TaskBoardsTab>('boards');
  const [selectedTemplateTab, setSelectedTemplateTab] = useState<AutomationTemplateTab>('automation-presets');
  const [templateWorkspaceDirty, setTemplateWorkspaceDirty] = useState(false);
  const [pendingTemplateTab, setPendingTemplateTab] = useState<AutomationTemplateTab | null>(null);
  const [data, setData] = useState<TaskBoardResponse | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [automationOverview, setAutomationOverview] = useState<AutomationOverview | null>(null);
  const [automationRange, setAutomationRange] = useState<AutomationRange>('30d');
  const [automationRouteReady, setAutomationRouteReady] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationReload, setAutomationReload] = useState(0);
  const [automationError, setAutomationError] = useState(false);
  const automationRequestRef = useRef(0);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('ALL');
  const [linked, setLinked] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('updatedAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const params = new URLSearchParams({
        q: query,
        visibility,
        linked,
        status,
        sort,
        direction: sort === 'name' ? 'asc' : 'desc',
        page: String(page),
        pageSize: String(pageSize),
      });
      setData(
        await apiFetch<TaskBoardResponse>(
          `/admin/${COMMUNITY_ID}/task-boards?${params}`,
        ),
      );
    } catch {
      setError(true);
    }
  }, [linked, page, pageSize, query, sort, status, visibility]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const applyRouteState = () => {
      const params = new URLSearchParams(window.location.search);
      setActiveTab(params.get('tab') === 'automations-templates' ? 'automations-templates' : 'boards');
      setSelectedTemplateTab(params.get('templateTab') === 'task-templates' ? 'task-templates' : 'automation-presets');
      const requestedRange = params.get('range');
      const range = isAutomationRange(requestedRange) ? requestedRange : '30d';
      setAutomationRange(range);
      setAutomationRouteReady(true);
      if (requestedRange && requestedRange !== range) {
        params.set('range', range);
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      }
    };
    applyRouteState();
    window.addEventListener('popstate', applyRouteState);
    return () => window.removeEventListener('popstate', applyRouteState);
  }, []);
  useEffect(() => {
    apiFetch<{ events: EventOption[] }>(`/admin/${COMMUNITY_ID}/events`)
      .then((response) => setEvents(response.events))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (activeTab !== 'automations-templates' || !automationRouteReady) return;
    const requestId = automationRequestRef.current + 1;
    automationRequestRef.current = requestId;
    const controller = new AbortController();
    setAutomationError(false);
    setAutomationLoading(true);
    apiFetch<AutomationOverview>(`/admin/${COMMUNITY_ID}/task-boards/automation-summary?range=${automationRange}`, { signal: controller.signal })
      .then((overview) => {
        if (automationRequestRef.current === requestId) setAutomationOverview(overview);
      })
      .catch((requestError) => {
        if (automationRequestRef.current === requestId && requestError instanceof Error && requestError.name !== 'AbortError') setAutomationError(true);
      })
      .finally(() => {
        if (automationRequestRef.current === requestId) setAutomationLoading(false);
      });
    return () => controller.abort();
  }, [activeTab, automationRange, automationReload, automationRouteReady]);

  async function createBoard() {
    if (saving || (!form.eventId && !form.name.trim())) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards`, {
        method: 'POST',
        body: JSON.stringify({ ...form, eventId: form.eventId || null }),
      });
      setForm(initialForm);
      toast.success(t.admin.taskBoardCreated);
      await load();
    } catch {
      toast.error(t.admin.taskBoardSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  function selectTab(tab: TaskBoardsTab) {
    setActiveTab(tab);
    const url = tab === 'boards'
      ? '/admin/task-boards'
      : `/admin/task-boards?tab=automations-templates&templateTab=${selectedTemplateTab}&range=${automationRange}`;
    window.history.replaceState(null, '', url);
  }

  function selectAutomationRange(range: AutomationRange) {
    if (range === automationRange) return;
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'automations-templates');
    params.set('templateTab', selectedTemplateTab);
    params.set('range', range);
    window.history.pushState(null, '', `/admin/task-boards?${params.toString()}`);
    setAutomationRange(range);
  }

  function selectTemplateTab(tab: AutomationTemplateTab) {
    if (tab !== selectedTemplateTab && templateWorkspaceDirty) {
      setPendingTemplateTab(tab);
      return;
    }
    commitTemplateTab(tab);
  }

  function commitTemplateTab(tab: AutomationTemplateTab) {
    setSelectedTemplateTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'automations-templates');
    params.set('templateTab', tab);
    window.history.replaceState(null, '', `/admin/task-boards?${params.toString()}`);
  }

  const selectedEvent = events.find((event) => event.id === form.eventId);
  return (
    <AppShell admin>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              {t.admin.taskBoards}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              {t.admin.taskBoardsDescription}
            </p>
          </div>
        </header>
        <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
          <TabButton active={activeTab === 'boards'} onClick={() => selectTab('boards')}>
            {t.admin.taskBoards}
          </TabButton>
          <TabButton active={activeTab === 'automations-templates'} onClick={() => selectTab('automations-templates')}>
            {t.admin.automationsAndTemplates}
          </TabButton>
        </div>
        {activeTab === 'boards' ? (
          <>
        <Card className="rounded-xl">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-accent" />
            <h2 className="text-base font-semibold text-white">
              {t.admin.newTaskBoard}
            </h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AppSelect
              label={t.admin.linkToEvent}
              value={form.eventId}
              options={[
                { value: '', label: t.admin.noLinkedEvent },
                ...events.map((event) => ({
                  value: event.id,
                  label: event.title,
                })),
              ]}
              onChange={(eventId) =>
                setForm({
                  ...form,
                  eventId,
                  visibility: eventId ? 'PUBLIC' : form.visibility,
                })
              }
            />
            <Field
              label={t.admin.boardName}
              value={selectedEvent?.title ?? form.name}
              disabled={Boolean(selectedEvent)}
              onChange={(name) => setForm({ ...form, name })}
            />
            <Field
              label={t.admin.boardDescription}
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
            />
            <AppSelect
              label={t.admin.visibility}
              value={form.visibility}
              options={[
                { value: 'PRIVATE', label: t.admin.privateVisibility },
                { value: 'PUBLIC', label: t.admin.publicVisibility },
              ]}
              onChange={(next) => setForm({ ...form, visibility: next })}
            />
          </div>
          {selectedEvent && (
            <p className="mt-3 text-xs text-white/40">
              {t.admin.eventLinkedBoardNameHelp}
            </p>
          )}
          <LoadingButton
            loading={saving}
          loadingLabel={t.common.loading}
            disabled={saving || (!form.eventId && !form.name.trim())}
            onClick={createBoard}
            className="mt-4"
          >
            {t.admin.createTaskBoard}
          </LoadingButton>
        </Card>
        {data && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label={t.admin.totalBoards}
              value={data.metrics.totalBoards}
            />
            <Metric
              label={t.admin.activeBoards}
              value={data.metrics.activeBoards}
            />
            <Metric
              label={t.admin.atRiskBoards}
              value={data.metrics.atRiskBoards}
              tone="warn"
            />
            <Metric
              label={t.admin.standaloneBoards}
              value={data.metrics.standaloneBoards}
            />
            <Metric
              label={t.admin.eventLinkedBoards}
              value={data.metrics.eventLinkedBoards}
            />
          </div>
        )}
        <Card className="rounded-xl p-0">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 xl:flex-row xl:items-center">
            <label className="relative min-w-0 flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={t.common.search}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/50"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <AppSelect
                value={linked}
                options={[
                  { value: 'ALL', label: t.common.all },
                  { value: 'EVENT', label: t.admin.eventLinked },
                  { value: 'STANDALONE', label: t.admin.standalone },
                ]}
                onChange={(next) => {
                  setLinked(next);
                  setPage(1);
                }}
              />
              <AppSelect
                value={visibility}
                options={[
                  { value: 'ALL', label: t.common.all },
                  { value: 'PRIVATE', label: t.admin.privateVisibility },
                  { value: 'PUBLIC', label: t.admin.publicVisibility },
                ]}
                onChange={(next) => {
                  setVisibility(next);
                  setPage(1);
                }}
              />
              <AppSelect
                value={status}
                options={[
                  { value: 'ALL', label: t.common.all },
                  { value: 'TODO', label: t.dashboard.eventTaskTodo },
                  {
                    value: 'IN_PROGRESS',
                    label: t.dashboard.eventTaskInProgress,
                  },
                  { value: 'DONE', label: t.dashboard.eventTaskDone },
                  { value: 'AT_RISK', label: t.admin.planningAtRisk },
                ]}
                onChange={(next) => {
                  setStatus(next);
                  setPage(1);
                }}
              />
              <AppSelect
                value={sort}
                options={[
                  { value: 'updatedAt', label: t.admin.sortUpdated },
                  { value: 'name', label: t.admin.boardName },
                  { value: 'progress', label: t.admin.boardProgress },
                  { value: 'dueDate', label: t.admin.eventTaskDueDate },
                ]}
                onChange={(next) => setSort(next)}
              />
            </div>
          </div>
          {error ? (
            <div className="p-4">
              <TableErrorState
                title={t.admin.taskBoardsLoadFailed}
                retryLabel={t.common.retry}
                onRetry={load}
              />
            </div>
          ) : !data ? (
            <div className="p-4">
              <TableSkeleton rows={5} columns={7} />
            </div>
          ) : data.items.length === 0 ? (
            <div className="p-6">
              <TableEmptyState
                title={t.admin.noTaskBoards}
                description={t.admin.noTaskBoardsDescription}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-[0.1em] text-white/38">
                    <tr>
                      <th className="px-4 py-3">{t.admin.taskBoard}</th>
                      <th className="px-4 py-3">{t.admin.linkedEvent}</th>
                      <th className="px-4 py-3">{t.admin.created}</th>
                      <th className="px-4 py-3">{t.admin.boardProgress}</th>
                      <th className="px-4 py-3">{t.admin.visibility}</th>
                      <th className="px-4 py-3">{t.admin.eventTaskAssignee}</th>
                      <th className="px-4 py-3">{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {data.items.map((board) => (
                      <tr key={board.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white/82">
                            {board.name}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <StatusBadge tone={board.status === 'ACTIVE' && !board.eventEnded ? 'good' : board.status === 'PAUSED' ? 'warn' : 'neutral'}>{board.status === 'PAUSED' ? t.admin.taskBoardPaused : board.status === 'COMPLETED' ? t.admin.taskBoardCompleted : t.admin.taskBoardActive}</StatusBadge>
                            {board.eventEnded && <StatusBadge tone="neutral">{t.admin.taskBoardEventEnded}</StatusBadge>}
                          </div>
                          <p className="mt-1 max-w-xs truncate text-xs text-white/35">
                            {board.description || t.admin.taskBoard}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-white/50">
                          {board.linkedEvent?.title ?? t.admin.standalone}
                        </td>
                        <td className="px-4 py-4 text-white/45">
                          {formatDate(
                            board.createdAt,
                            lang === 'fr' ? 'fr-FR' : 'en-US',
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-xs text-white/55">
                            {board.taskCounts.done}/{board.taskCounts.total}{' '}
                            {t.admin.tasksDone}
                          </p>
                          <div className="mt-2 h-1 w-28 overflow-hidden rounded-full bg-white/[0.07]">
                            <span
                              className="block h-full rounded-full bg-accent/70"
                              style={{
                                width: `${board.taskCounts.total ? Math.round((board.taskCounts.done / board.taskCounts.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          {board.taskCounts.overdue > 0 && (
                            <p className="mt-1 text-[10px] text-rose-200">
                              {board.taskCounts.overdue} {t.common.overdue}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge
                            tone={
                              board.visibility === 'PUBLIC' ? 'good' : 'neutral'
                            }
                          >
                            {board.visibility === 'PUBLIC'
                              ? t.admin.publicVisibility
                              : t.admin.privateVisibility}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex -space-x-2">
                            {board.assignees.slice(0, 2).map((assignee) => (
                              <span key={assignee.id} title={assignee.name}>
                                <ProfilePhoto
                                  name={assignee.name}
                                  avatarUrl={assignee.avatarUrl}
                                  dicebearStyle={assignee.dicebearStyle}
                                  dicebearSeed={assignee.dicebearSeed}
                                  size="sm"
                                  className="h-8 w-8 rounded-full border-2 border-[#07100c] text-[10px]"
                                />
                              </span>
                            ))}
                            {board.assignees.length > 2 && (
                              <span
                                title={board.assignees
                                  .slice(2)
                                  .map((item) => item.name)
                                  .join(', ')}
                                className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#07100c] bg-white/[0.08] text-[10px] text-white/65"
                              >
                                +{board.assignees.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/admin/task-boards/${board.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-emerald-200"
                          >
                            <LayoutList size={13} />
                            {t.admin.viewBoard}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTablePagination
                page={data.pagination.page}
                pageSize={data.pagination.pageSize}
                pageSizeOptions={[5, 10, 20, 50]}
                total={data.pagination.total}
                previousLabel={t.common.previous}
                nextLabel={t.common.next}
                rowsPerPageLabel={t.common.rowsPerPage}
                showingLabel={t.admin.showingRange(
                  (data.pagination.page - 1) * data.pagination.pageSize + 1,
                  Math.min(
                    data.pagination.total,
                    data.pagination.page * data.pagination.pageSize,
                  ),
                  data.pagination.total,
                )}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
          </>
        ) : (
          <AutomationTemplatesPanel
            overview={automationOverview}
            range={automationRange}
            loading={automationLoading}
            error={automationError}
            onRetry={() => setAutomationReload((value) => value + 1)}
            onRangeChange={selectAutomationRange}
            lang={lang}
            selectedTemplateTab={selectedTemplateTab}
            onTemplateTabChange={selectTemplateTab}
            onWorkspaceDirtyChange={setTemplateWorkspaceDirty}
          />
        )}
        <ConfirmDialog
          open={Boolean(pendingTemplateTab)}
          title={t.admin.discardUnsavedChanges}
          description={t.admin.discardUnsavedChangesDescription}
          confirmLabel={t.admin.discardChanges}
          cancelLabel={t.common.cancel}
          onConfirm={() => {
            const nextTab = pendingTemplateTab;
            setPendingTemplateTab(null);
            setTemplateWorkspaceDirty(false);
            if (nextTab) commitTemplateTab(nextTab);
          }}
          onCancel={() => setPendingTemplateTab(null)}
        />
      </div>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? 'bg-accent text-background shadow-lg shadow-emerald-950/25' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function AutomationTemplatesPanel({
  overview,
  range,
  loading,
  error,
  onRetry,
  onRangeChange,
  lang,
  selectedTemplateTab,
  onTemplateTabChange,
  onWorkspaceDirtyChange,
}: {
  overview: AutomationOverview | null;
  range: AutomationRange;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onRangeChange: (range: AutomationRange) => void;
  lang: string;
  selectedTemplateTab: AutomationTemplateTab;
  onTemplateTabChange: (tab: AutomationTemplateTab) => void;
  onWorkspaceDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const tabs: Array<{ key: AutomationTemplateTab; label: string }> = [
    { key: 'automation-presets', label: t.admin.automationPresets },
    { key: 'task-templates', label: t.admin.taskTemplates },
  ];
  const rangeOptions: Array<{ value: AutomationRange; label: string }> = [
    { value: '7d', label: t.admin.automationRangeLast7Days },
    { value: '30d', label: t.admin.automationRangeLast30Days },
    { value: '90d', label: t.admin.automationRangeLast90Days },
    { value: 'this_month', label: t.admin.automationRangeThisMonth },
    { value: 'last_month', label: t.admin.automationRangeLastMonth },
    { value: 'all', label: t.admin.automationRangeAllTime },
  ];
  return (
    <div className="space-y-6">
      <Card className="rounded-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Workflow size={20} className="text-accent/75" />
            <h2 className="text-lg font-semibold text-white">{t.admin.automationOverview}</h2>
          </div>
          <AppSelect value={range} options={rangeOptions} onChange={onRangeChange} dense ariaLabel={t.admin.automationRangeLabel} className="w-full sm:w-48" />
        </div>
        {error && !overview ? (
          <div className="mt-5">
            <TableErrorState title={t.admin.automationOverviewLoadFailed} retryLabel={t.common.retry} onRetry={onRetry} />
          </div>
        ) : !overview ? (
          <div className="mt-5">
            <TableSkeleton rows={1} columns={4} />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
            <Metric label={t.admin.activeAutomationRules} value={overview.metrics.activeRules.value} detail={t.admin.automationCurrentConfiguration} />
            <Metric label={t.admin.automationRuns} value={overview.metrics.runs.value} comparison={overview.metrics.runs} comparisonLabel={t.admin.automationVsPreviousPeriod} />
            <Metric label={t.admin.failedRunsLast30Days} value={overview.metrics.failedRuns.value} comparison={overview.metrics.failedRuns} comparisonLabel={t.admin.automationVsPreviousPeriod} />
            <Metric label={t.admin.emailNotificationsSent} value={overview.metrics.emailNotificationsSent.value} comparison={overview.metrics.emailNotificationsSent} comparisonLabel={t.admin.automationVsPreviousPeriod} />
          </div>
        )}
        {error && overview && <p className="mt-3 text-xs text-rose-200">{t.admin.automationOverviewLoadFailed}</p>}
      </Card>

      <Card className="rounded-xl">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-200/80" />
          <h2 className="text-lg font-semibold text-white">{t.admin.recentAutomationIssues}</h2>
        </div>
        {error && !overview ? (
          <div className="mt-5">
            <TableErrorState title={t.admin.automationIssuesLoadFailed} retryLabel={t.common.retry} onRetry={onRetry} />
          </div>
        ) : !overview ? (
          <div className="mt-5">
            <TableSkeleton rows={3} columns={3} />
          </div>
        ) : overview.recentIssues.length === 0 ? (
          <div className="mt-5">
            <TableEmptyState title={t.admin.noAutomationIssuesFound} description={t.admin.noAutomationIssuesPeriodDescription} />
          </div>
        ) : (
          <div className="mt-5 divide-y divide-white/[0.07] rounded-xl border border-white/[0.08] bg-black/15">
            {overview.recentIssues.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{issue.ruleName}</p>
                    <StatusBadge tone={issue.status === 'FAILED' ? 'bad' : 'neutral'}>{automationRunStatusLabel(issue.status, t)}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-white/45">
                    {issue.boardName}
                    {issue.taskTitle ? ` · ${issue.taskTitle}` : ''}
                  </p>
                  {(issue.errorMessage || issue.summary || issue.errorCode) && (
                    <p className="mt-2 max-w-3xl text-xs leading-5 text-white/38">
                      {issue.errorMessage ?? issue.errorCode ?? issue.summary}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 text-xs text-white/38 sm:items-end">
                  <span>{formatDate(issue.lastRunAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                  <Link href={`/admin/task-boards/${issue.boardId}?section=automation`} className="inline-flex items-center gap-1.5 font-semibold text-accent hover:text-emerald-200">
                    <FileText size={13} />
                    {t.admin.openAutomation}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <section className="space-y-5">
        <div className="flex w-full justify-end">
          <div
            aria-label={t.admin.automationsAndTemplates}
            className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
          >
            {tabs.map((tab) => {
              const active = selectedTemplateTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onTemplateTabChange(tab.key)}
                  className={`min-h-10 min-w-max rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                    active
                      ? 'bg-accent text-background shadow-sm shadow-emerald-950/25'
                      : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedTemplateTab === 'automation-presets' ? (
          <AutomationPresetManager onDirtyChange={onWorkspaceDirtyChange} />
        ) : (
          <TaskTemplateManager
            endpointBase={`/admin/${COMMUNITY_ID}/task-boards/task-templates`}
            onDirtyChange={onWorkspaceDirtyChange}
          />
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  comparison,
  comparisonLabel,
  tone,
}: {
  label: string;
  value: number;
  detail?: string;
  comparison?: AutomationMetricComparison;
  comparisonLabel?: string;
  tone?: 'warn';
}) {
  const { t } = useI18n();
  const comparisonText = comparison ? automationComparisonText(comparison, t) : null;
  const sentimentClass = comparison?.sentiment === 'positive'
    ? 'text-emerald-300'
    : comparison?.sentiment === 'negative'
      ? 'text-rose-300'
      : 'text-white/45';
  const lineColor = comparison?.sentiment === 'positive' ? '#6ee7b7' : comparison?.sentiment === 'negative' ? '#fda4af' : '#93c5fd';
  return (
    <div className="min-h-[132px] rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-2xl font-semibold tabular-nums ${tone === 'warn' && value > 0 ? 'text-rose-200' : 'text-white'}`}>{value}</p>
          <p className="mt-1 text-xs text-white/45">{label}</p>
        </div>
        {comparison && comparison.sparkline.length > 1 && (
          <div className="h-12 w-24 shrink-0" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparison.sparkline} margin={{ top: 5, right: 2, bottom: 5, left: 2 }}>
                <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {detail && <p className="mt-4 text-[11px] text-white/32">{detail}</p>}
      {comparison && comparison.direction !== 'unavailable' && (
        <div className={`mt-4 text-[11px] font-semibold ${sentimentClass}`}>
          <span>{comparisonText}</span>
          {comparisonLabel && <span className="ml-1 font-normal text-white/30">{comparisonLabel}</span>}
        </div>
      )}
    </div>
  );
}

function automationComparisonText(comparison: AutomationMetricComparison, t: ReturnType<typeof useI18n>['t']) {
  if (comparison.direction === 'new') return t.admin.automationComparisonNew;
  if (comparison.direction === 'flat') return `→ ${t.admin.automationComparisonFlat}`;
  if (comparison.direction === 'unavailable') return t.admin.automationComparisonUnavailable;
  const percent = Math.abs(comparison.changePercent ?? 0).toFixed(1);
  return `${comparison.direction === 'up' ? '↑' : '↓'} ${percent}% ${comparison.direction === 'up' ? t.admin.automationComparisonIncrease : t.admin.automationComparisonDecrease}`;
}
function automationRunStatusLabel(status: AutomationIssue['status'], t: ReturnType<typeof useI18n>['t']) {
  if (status === 'FAILED') return t.common.failed;
  if (status === 'SUCCESS') return t.common.success;
  return t.admin.automationSkipped;
}
function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm text-white/65">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-55"
      />
    </label>
  );
}
