'use client';

import { CalendarDays, ClipboardList } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../../components/app-select';
import { EventTaskCollaborationDrawer } from '../../../../components/event-task-collaboration-drawer';
import { EventTaskDescription } from '../../../../components/event-task-description';
import { ProfilePhoto } from '../../../../components/profile-photo';
import { TableEmptyState, TableErrorState } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';
import { eventTaskDueState } from '../../../../lib/event-task-due';
import { useEventTaskRealtime } from '../../../../hooks/use-event-task-realtime';

type EventTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
type EventTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type MemberEventTask = {
  id: string;
  title: string;
  description?: string | null;
  status: EventTaskStatus;
  priority: EventTaskPriority;
  label?: string | null;
  dueDate?: string | null;
  sortOrder: number;
  assignee?: { id: string; name: string; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null } | null;
  assignees: Array<{ id: string; name: string; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null }>;
  canUpdateStatus: boolean;
  checklistProgress: { completed: number; total: number };
};

const statuses: EventTaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export function MemberEventTasks({ eventId }: { eventId: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<MemberEventTask[] | null>(null);
  const [error, setError] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState('');
  const [collaborationRevision, setCollaborationRevision] = useState(0);
  const mountedRef = useRef(false);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setError('');
    try {
      const response = await apiFetch<{ tasks: MemberEventTask[] }>(`/communities/${COMMUNITY_ID}/events/${eventId}/tasks`);
      if (mountedRef.current && requestId === loadRequestRef.current) setTasks(response.tasks);
    } catch {
      if (mountedRef.current && requestId === loadRequestRef.current) setError(t.dashboard.eventTasksLoadFailed);
    }
  }, [eventId, t.dashboard.eventTasksLoadFailed]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  useEventTaskRealtime(eventId, (payload) => {
    if (payload.taskId && payload.taskId === searchParams.get('taskId')) setCollaborationRevision((current) => current + 1);
    void load();
  });

  const selectedTask = tasks?.find((task) => task.id === searchParams.get('taskId')) ?? null;
  const collaborationTab = searchParams.get('tab') === 'activity' ? 'activity' : searchParams.get('tab') === 'attachments' ? 'attachments' : searchParams.get('tab') === 'checklist' ? 'checklist' : 'comments';

  const openCollaboration = useCallback((taskId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('taskId', taskId);
    next.set('tab', 'comments');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeCollaboration = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('taskId');
    next.delete('tab');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  async function updateStatus(task: MemberEventTask, status: EventTaskStatus) {
    if (!task.canUpdateStatus || updatingTaskId || task.status === status) return;
    const previous = tasks ?? [];
    setUpdatingTaskId(task.id);
    setTasks(previous.map((item) => item.id === task.id ? { ...item, status } : item));
    try {
      const updated = await apiFetch<MemberEventTask>(`/communities/${COMMUNITY_ID}/events/${eventId}/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTasks((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item));
      toast.success(t.dashboard.eventTaskStatusUpdated);
    } catch {
      setTasks(previous);
      toast.error(t.dashboard.eventTaskStatusUpdateFailed);
    } finally {
      setUpdatingTaskId('');
    }
  }

  return (
    <section aria-labelledby="member-event-tasks-title" className="space-y-4">
      <div>
        <h2 id="member-event-tasks-title" className="text-xl font-semibold text-white">{t.dashboard.eventTasks}</h2>
        <p className="mt-1 text-sm leading-6 text-white/50">{t.dashboard.eventTasksDescription}</p>
      </div>
      {error ? <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /> : !tasks ? (
        <div className="grid min-h-48 animate-pulse gap-4 lg:grid-cols-3">{statuses.map((status) => <div key={status} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="h-5 w-24 rounded bg-white/10" /><div className="mt-4 h-24 rounded-lg bg-white/[0.06]" /></div>)}</div>
      ) : tasks.length === 0 ? (
        <TableEmptyState title={t.dashboard.noEventTasks} description={t.dashboard.noEventTasksDescription} />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-[var(--task-board-workspace)] pb-2">
          <div className="grid min-w-[840px] grid-cols-3 gap-4">
            {statuses.map((status) => {
              const columnTasks = tasks.filter((task) => task.status === status).sort((left, right) => left.sortOrder - right.sortOrder);
              return (
                <div key={status} className="rounded-xl border border-white/10 bg-[var(--task-board-column)] p-3">
                  <div className="flex items-center justify-between gap-3 px-1"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusTone(status)}`} /><h3 className="text-sm font-semibold text-white">{statusName(t, status)}</h3></div><span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-semibold tabular-nums text-white/55">{columnTasks.length}</span></div>
                  <div className="mt-3 space-y-3">
                    {columnTasks.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 px-4 py-7 text-center"><ClipboardList className="mx-auto text-white/25" size={19} /><p className="mt-2 text-xs text-white/38">{t.dashboard.noTasksInStage}</p></div> : columnTasks.map((task) => {
                      const dueState = eventTaskDueState(task.dueDate, task.status);
                      return (
                      <article key={task.id} className={`rounded-lg border p-3.5 shadow-lg shadow-black/10 ${task.canUpdateStatus ? 'border-accent/25 bg-[var(--task-board-card-accent)]' : 'border-white/[0.08] bg-[var(--task-board-member-card)]'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">{task.label ? <span className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-white/55">{task.label}</span> : <span />}{task.canUpdateStatus && <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">{t.dashboard.assignedToYou}</span>}</div>
                        <div className="mt-2 flex items-start gap-2"><span title={priorityName(t, task.priority)} aria-label={priorityName(t, task.priority)} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityTone(task.priority)}`} /><h4 className="text-sm font-semibold leading-5 text-white">{task.title}</h4></div>
                        <EventTaskDescription description={task.description} readMoreLabel={t.common.readMore} showLessLabel={t.common.showLess} />
                        {task.checklistProgress.total > 0 && <div className="mt-3"><div className="flex items-center justify-between text-[11px] text-white/42"><span>{t.common.checklist}</span><span className="tabular-nums">{t.common.checklistProgress(task.checklistProgress.completed, task.checklistProgress.total)}</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]"><span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round((task.checklistProgress.completed / task.checklistProgress.total) * 100)}%` }} /></div></div>}
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
                          <div className="min-w-0">{task.dueDate && <div className="flex flex-wrap items-center gap-2"><p className={`flex items-center gap-1.5 text-[11px] ${dueState === 'overdue' ? 'text-[var(--task-overdue)]' : dueState === 'due-soon' ? 'text-[var(--task-due-soon)]' : 'text-[var(--task-date)]'}`}><CalendarDays size={12} />{t.dashboard.eventTaskDue} {formatTaskDate(task.dueDate, lang === 'fr' ? 'fr-FR' : 'en-US')}</p>{dueState && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dueState === 'overdue' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>{dueState === 'overdue' ? t.common.overdue : t.common.dueSoon}</span>}</div>}<div className="mt-1.5 flex items-center gap-2">{task.assignees?.length ? <div className="flex -space-x-2">{task.assignees.slice(0, 2).map((assignee) => <ProfilePhoto key={assignee.id} name={assignee.name} avatarUrl={assignee.avatarUrl} dicebearStyle={assignee.dicebearStyle} dicebearSeed={assignee.dicebearSeed} size="sm" className="h-7 w-7 rounded-full border-2 border-[#07100c] text-[10px]" />)}{task.assignees.length > 2 && <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#07100c] bg-white/10 text-[9px] text-white/65">+{task.assignees.length - 2}</span>}</div> : <span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-white/15 text-[10px] text-white/30">—</span>}<span className="truncate text-[11px] text-white/45">{task.assignees?.map((assignee) => assignee.name).join(', ') || t.dashboard.eventTaskUnassigned}</span></div></div>
                        </div>
                        <button type="button" onClick={() => openCollaboration(task.id)} className="mt-3 text-xs font-semibold text-accent transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{t.common.details}</button>
                        {task.canUpdateStatus && <div className="mt-3"><AppSelect value={task.status} options={statuses.map((option) => ({ value: option, label: statusName(t, option) }))} disabled={Boolean(updatingTaskId)} dense className="min-w-0" onChange={(nextStatus) => updateStatus(task, nextStatus)} /></div>}
                      </article>
                    );})}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {selectedTask && (
        <EventTaskCollaborationDrawer
          taskTitle={selectedTask.title}
          endpointBase={`/communities/${COMMUNITY_ID}/events/${eventId}/tasks/${selectedTask.id}`}
          taskId={selectedTask.id}
          canComment={selectedTask.canUpdateStatus}
          refreshToken={collaborationRevision}
          initialTab={collaborationTab}
          onClose={closeCollaboration}
          summary={<><EventTaskDescription description={selectedTask.description} readMoreLabel={t.common.readMore} showLessLabel={t.common.showLess} /><div className="mt-4 grid gap-3 text-xs text-white/48 sm:grid-cols-3"><p><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/28">{t.common.status}</span><span className="mt-1 block text-white/70">{statusName(t, selectedTask.status)}</span></p><p><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/28">{t.admin.eventTaskPriority}</span><span className="mt-1 block text-white/70">{priorityName(t, selectedTask.priority)}</span></p><p><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/28">{t.dashboard.eventTaskDue}</span><span className="mt-1 block text-white/70">{selectedTask.dueDate ? formatTaskDate(selectedTask.dueDate, lang === 'fr' ? 'fr-FR' : 'en-US') : '—'}</span></p></div></>}
        />
      )}
    </section>
  );
}

function statusName(t: ReturnType<typeof useI18n>['t'], status: EventTaskStatus) {
  if (status === 'TODO') return t.dashboard.eventTaskTodo;
  if (status === 'IN_PROGRESS') return t.dashboard.eventTaskInProgress;
  return t.dashboard.eventTaskDone;
}

function priorityName(t: ReturnType<typeof useI18n>['t'], priority: EventTaskPriority) {
  if (priority === 'LOW') return t.dashboard.eventTaskLow;
  if (priority === 'HIGH') return t.dashboard.eventTaskHigh;
  return t.dashboard.eventTaskMedium;
}

function statusTone(status: EventTaskStatus) {
  if (status === 'IN_PROGRESS') return 'bg-amber-300';
  if (status === 'DONE') return 'bg-emerald-300';
  return 'bg-slate-300';
}

function priorityTone(priority: EventTaskPriority) {
  if (priority === 'HIGH') return 'bg-rose-300';
  if (priority === 'MEDIUM') return 'bg-amber-300';
  return 'bg-emerald-300';
}

function formatTaskDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}
