'use client';

import { ArrowLeft, Archive, CalendarDays, CheckCircle2, Pause, Play, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../../components/app-select';
import { AppShell } from '../../../../components/shell';
import {
  TaskBoardOverview,
  type TaskBoardOverviewData,
} from '../../../../components/task-board-overview';
import {
  Card,
  ConfirmDialog,
  LoadingButton,
  StatusBadge,
  TableEmptyState,
  TableErrorState,
  TableSkeleton,
} from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';
import { formatDate } from '../../../../lib/utils';
import { useEventTaskRealtime } from '../../../../hooks/use-event-task-realtime';
import { EventTaskBoard } from '../../events/[id]/event-task-board';
import { TaskBoardAutomation } from '../../../../components/task-board-automation';

type TaskBoardDetail = {
  id: string;
  name: string;
  description?: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  eventEnded: boolean;
  linkedEvent?: { id: string; title: string; startsAt?: string | null } | null;
  taskCounts: { total: number; done: number; overdue: number };
  checklistProgress: { completed: number; total: number };
  canManageTasks: boolean;
  canArchiveTasks: boolean;
  canArchiveBoard: boolean;
  canEditBoard: boolean;
  overview: TaskBoardOverviewData;
  createdAt: string;
  updatedAt: string;
};

export default function AdminTaskBoardDetailPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t } = useI18n();
  const [board, setBoard] = useState<TaskBoardDetail | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    visibility: 'PRIVATE' as 'PRIVATE' | 'PUBLIC',
  });
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [lifecycleTarget, setLifecycleTarget] = useState<TaskBoardDetail['status'] | null>(null);
  const [changingLifecycle, setChangingLifecycle] = useState(false);
  const requestedSection = searchParams.get('taskId') ? 'board' : searchParams.get('section');
  const section = requestedSection === 'board' || requestedSection === 'automation' || requestedSection === 'settings' ? requestedSection : 'overview';

  function selectSection(nextSection: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('section', nextSection);
    if (nextSection !== 'board') { next.delete('taskId'); next.delete('tab'); }
    router.replace(`/admin/task-boards/${boardId}?${next.toString()}`, { scroll: false });
  }

  const load = useCallback(async () => {
    setError(false);
    try {
      const next = await apiFetch<TaskBoardDetail>(
        `/admin/${COMMUNITY_ID}/task-boards/${boardId}`,
      );
      setBoard(next);
      setForm({
        name: next.name,
        description: next.description ?? '',
        visibility: next.visibility,
      });
    } catch {
      setError(true);
    }
  }, [boardId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEventTaskRealtime(board?.linkedEvent?.id ?? '', () => {
    void load();
  });

  async function save() {
    if (!board || saving || (!board.linkedEvent && !form.name.trim())) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${board.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      toast.success(t.admin.taskBoardUpdated);
      await load();
    } catch {
      toast.error(t.admin.taskBoardSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!board || board.linkedEvent || archiving) return;
    setArchiving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${board.id}`, {
        method: 'DELETE',
      });
      toast.success(t.admin.taskBoardArchived);
      router.push('/admin/task-boards');
    } catch {
      toast.error(t.admin.taskBoardSaveFailed);
    } finally {
      setArchiving(false);
      setArchiveOpen(false);
    }
  }

  async function changeLifecycle() {
    if (!board || !lifecycleTarget || changingLifecycle) return;
    setChangingLifecycle(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/task-boards/${board.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: lifecycleTarget }),
      });
      toast.success(lifecycleSuccess(lifecycleTarget, board.status, t));
      setLifecycleTarget(null);
      await load();
    } catch {
      toast.error(t.admin.taskBoardStatusUpdateFailed);
    } finally {
      setChangingLifecycle(false);
    }
  }

  return (
    <AppShell admin>
      <div className="space-y-6">
        <Link
          href="/admin/task-boards"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/50 hover:text-accent"
        >
          <ArrowLeft size={14} />
          {t.admin.taskBoards}
        </Link>
        {error ? (
          <TableErrorState
            title={t.admin.taskBoardsLoadFailed}
            retryLabel={t.common.retry}
            onRetry={load}
          />
        ) : !board ? (
          <TableSkeleton rows={5} columns={2} />
        ) : (
          <>
            <header className="overflow-hidden rounded-2xl border border-emerald-300/10 bg-[linear-gradient(135deg,rgba(10,24,18,0.96),rgba(5,10,8,0.98))] p-5 shadow-2xl shadow-black/20 ring-1 ring-white/[0.03]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent/75">{t.admin.taskBoard}</p>
                  <div className="mt-2">
                    <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-white md:text-3xl">{board.linkedEvent?.title ?? board.name}</h1>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/38">
                    <span>{t.admin.created} {formatDate(board.createdAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                    <span>{t.admin.updated} {formatDate(board.updatedAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                  </div>
                  {board.linkedEvent && <div className="mt-3">
                    <Link href={`/admin/events/${board.linkedEvent.id}`} className="inline-flex items-center gap-2 text-xs font-semibold text-accent hover:text-emerald-200">
                      <CalendarDays size={14} />
                      {t.admin.linkedEvent}: {board.linkedEvent.title}
                    </Link>
                    {board.eventEnded && <p className="mt-2 text-xs text-[var(--app-warning-foreground)] dark:text-amber-100/65">{t.admin.taskBoardEventEndedAutomationStopped}</p>}
                  </div>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <StatusBadge tone={board.visibility === 'PUBLIC' ? 'good' : 'neutral'}>
                    {board.visibility === 'PUBLIC' ? t.admin.publicVisibility : t.admin.privateVisibility}
                  </StatusBadge>
                  <StatusBadge tone="neutral">{board.linkedEvent ? t.admin.eventLinked : t.admin.standalone}</StatusBadge>
                  <StatusBadge tone={board.status === 'ACTIVE' && !board.eventEnded ? 'good' : board.status === 'PAUSED' ? 'warn' : 'neutral'}>{taskBoardStatusLabel(board.status, t)}</StatusBadge>
                </div>
              </div>
            </header>
            <nav className="flex overflow-x-auto border-b border-white/[0.08]" aria-label={t.admin.taskBoard}><BoardTab active={section === 'overview'} onClick={() => selectSection('overview')}>{t.admin.boardOverviewTab}</BoardTab><BoardTab active={section === 'board'} onClick={() => selectSection('board')}>{t.admin.boardBoardTab}</BoardTab><BoardTab active={section === 'automation'} onClick={() => selectSection('automation')}>{t.admin.boardAutomationTab}</BoardTab><BoardTab active={section === 'settings'} onClick={() => selectSection('settings')}>{t.admin.boardSettingsTab}</BoardTab></nav>
            {section === 'overview' && <TaskBoardOverview
              overview={board.overview}
              mode="admin"
              onOpenTask={(taskId, tab) =>
                router.push(
                  `/admin/task-boards/${board.id}?section=board&taskId=${encodeURIComponent(taskId)}&tab=${tab}`,
                  { scroll: false },
                )
              }
            />}
            {section === 'automation' && <TaskBoardAutomation boardId={board.id} boardName={board.linkedEvent?.title ?? board.name} linkedEvent={Boolean(board.linkedEvent)} lifecycle={{ status: board.status, eventEnded: board.eventEnded }} canEdit={board.canEditBoard} assignees={board.overview.assignees} />}
            {section === 'settings' && board.canEditBoard && (
              <Card className="rounded-xl">
                <h2 className="text-base font-semibold text-white">
                  {t.admin.editTaskBoard}
                </h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Field
                    label={t.admin.boardName}
                    value={board.linkedEvent?.title ?? form.name}
                    disabled={Boolean(board.linkedEvent)}
                    onChange={(name) => setForm({ ...form, name })}
                  />
                  <Field
                    label={t.admin.boardDescription}
                    value={form.description}
                    onChange={(description) =>
                      setForm({ ...form, description })
                    }
                  />
                  <AppSelect
                    label={t.admin.visibility}
                    value={form.visibility}
                    options={[
                      { value: 'PRIVATE', label: t.admin.privateVisibility },
                      { value: 'PUBLIC', label: t.admin.publicVisibility },
                    ]}
                    onChange={(visibility) => setForm({ ...form, visibility })}
                  />
                </div>
                {board.linkedEvent && (
                  <p className="mt-3 text-xs text-white/38">
                    {t.admin.eventLinkedBoardNameHelp}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <LoadingButton
                    loading={saving}
                    loadingLabel={t.common.loading}
                    onClick={save}
                  >
                    {t.common.save}
                  </LoadingButton>
                  {board.status === 'ACTIVE' && <LifecycleButton icon={<Pause size={14} />} onClick={() => setLifecycleTarget('PAUSED')}>{t.admin.pauseTaskBoard}</LifecycleButton>}
                  {board.status === 'PAUSED' && <LifecycleButton icon={<Play size={14} />} onClick={() => setLifecycleTarget('ACTIVE')}>{t.admin.resumeTaskBoard}</LifecycleButton>}
                  {board.status !== 'COMPLETED' && <LifecycleButton icon={<CheckCircle2 size={14} />} onClick={() => setLifecycleTarget('COMPLETED')}>{t.admin.completeTaskBoard}</LifecycleButton>}
                  {board.status === 'COMPLETED' && <LifecycleButton icon={<RotateCcw size={14} />} onClick={() => setLifecycleTarget('ACTIVE')}>{t.admin.reopenTaskBoard}</LifecycleButton>}
                  {board.canArchiveBoard && (
                    <button
                      type="button"
                      onClick={() => setArchiveOpen(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-200/15 bg-rose-300/[0.06] px-4 text-sm font-semibold text-rose-100 hover:bg-rose-300/10"
                    >
                      <Archive size={14} />
                      {t.admin.archiveTaskBoard}
                    </button>
                  )}
                </div>
              </Card>
            )}
            {section === 'board' && (board.linkedEvent ? (
              <EventTaskBoard
                eventId={board.linkedEvent.id}
                canManage={board.canManageTasks}
                canArchive={board.canArchiveTasks}
                minimalHeading
              />
            ) : (
              <Card className="rounded-xl">
                <TableEmptyState
                  title={t.admin.standaloneTasksDeferred}
                  description={t.admin.standaloneTasksDeferredDescription}
                />
              </Card>
            ))}
            <ConfirmDialog
              open={archiveOpen}
              title={t.admin.archiveTaskBoard}
              description={t.admin.archiveTaskBoardDescription}
              confirmLabel={t.admin.archiveTaskBoard}
              cancelLabel={t.common.cancel}
              loading={archiving}
              onConfirm={archive}
              onCancel={() => setArchiveOpen(false)}
            />
            <ConfirmDialog
              open={Boolean(lifecycleTarget)}
              title={lifecycleDialogTitle(lifecycleTarget, board.status, t)}
              description={lifecycleDialogDescription(lifecycleTarget, board.status, board.eventEnded, t)}
              confirmLabel={lifecycleDialogConfirmLabel(lifecycleTarget, board.status, t)}
              cancelLabel={t.common.cancel}
              loading={changingLifecycle}
              onConfirm={changeLifecycle}
              onCancel={() => setLifecycleTarget(null)}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function LifecycleButton({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/60 hover:bg-white/[0.07] hover:text-white">{icon}{children}</button>; }

function taskBoardStatusLabel(status: TaskBoardDetail['status'], t: ReturnType<typeof useI18n>['t']) { return status === 'PAUSED' ? t.admin.taskBoardPaused : status === 'COMPLETED' ? t.admin.taskBoardCompleted : t.admin.taskBoardActive; }
function lifecycleDialogTitle(target: TaskBoardDetail['status'] | null, current: TaskBoardDetail['status'], t: ReturnType<typeof useI18n>['t']) { if (target === 'PAUSED') return t.admin.pauseTaskBoardQuestion; if (target === 'COMPLETED') return t.admin.completeTaskBoardQuestion; return current === 'COMPLETED' ? t.admin.reopenTaskBoardQuestion : t.admin.resumeTaskBoardQuestion; }
function lifecycleDialogDescription(target: TaskBoardDetail['status'] | null, current: TaskBoardDetail['status'], eventEnded: boolean, t: ReturnType<typeof useI18n>['t']) { if (target === 'PAUSED') return t.admin.pauseTaskBoardDescription; if (target === 'COMPLETED') return t.admin.completeTaskBoardDescription; if (current === 'COMPLETED') return eventEnded ? t.admin.reopenEndedTaskBoardDescription : t.admin.reopenTaskBoardDescription; return eventEnded ? t.admin.resumeEndedTaskBoardDescription : t.admin.resumeTaskBoardDescription; }
function lifecycleDialogConfirmLabel(target: TaskBoardDetail['status'] | null, current: TaskBoardDetail['status'], t: ReturnType<typeof useI18n>['t']) { if (target === 'PAUSED') return t.admin.pauseTaskBoard; if (target === 'COMPLETED') return t.admin.completeTaskBoard; return current === 'COMPLETED' ? t.admin.reopenTaskBoard : t.admin.resumeTaskBoard; }
function lifecycleSuccess(target: TaskBoardDetail['status'], current: TaskBoardDetail['status'], t: ReturnType<typeof useI18n>['t']) { if (target === 'PAUSED') return t.admin.taskBoardPausedNotice; if (target === 'COMPLETED') return t.admin.taskBoardCompletedNotice; return current === 'COMPLETED' ? t.admin.taskBoardReopenedNotice : t.admin.taskBoardResumedNotice; }

function BoardTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? 'border-accent bg-accent/[0.06] text-accent' : 'border-transparent text-white/45 hover:text-white/75'}`}>{children}</button>; }

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
