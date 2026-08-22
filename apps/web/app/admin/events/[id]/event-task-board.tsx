'use client';

import { type DragCancelEvent, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Archive, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../../components/app-select';
import { EventTaskCollaborationDrawer } from '../../../../components/event-task-collaboration-drawer';
import { TaskBoardKanbanView, sameTaskBoardOrder, taskBoardColumnIds, taskBoardColumns, taskBoardStatusForDropTarget, taskBoardStatusForId, taskBoardStatuses, tasksFromTaskBoardColumns, type TaskBoardMember, type TaskBoardPriority, type TaskBoardStatus, type TaskBoardTask } from '../../../../components/task-board-kanban-view';
import { ConfirmDialog, LoadingButton, TableErrorState } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';
import { useEventTaskRealtime } from '../../../../hooks/use-event-task-realtime';

type EventTaskStatus = TaskBoardStatus;
type EventTaskPriority = TaskBoardPriority;
type EventTask = TaskBoardTask;
type Member = TaskBoardMember;
type TaskForm = { title: string; description: string; assigneeIds: string[]; dueDate: string; priority: EventTaskPriority; label: string };
type TaskTemplate = { id: string; name: string; description?: string | null; isActive: boolean; items: { id: string }[] };

const statuses = taskBoardStatuses;
const emptyForm: TaskForm = { title: '', description: '', assigneeIds: [], dueDate: '', priority: 'MEDIUM', label: '' };

export function EventTaskBoard({ eventId, canManage, canArchive, minimalHeading = false }: { eventId: string; canManage: boolean; canArchive: boolean; minimalHeading?: boolean }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<EventTask[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [editingTask, setEditingTask] = useState<EventTask | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movingTaskId, setMovingTaskId] = useState('');
  const [archiveTask, setArchiveTask] = useState<EventTask | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState('');
  const [reordering, setReordering] = useState(false);
  const [collaborationRevision, setCollaborationRevision] = useState(0);
  const [applyOpen, setApplyOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const mountedRef = useRef(false);
  const loadRequestRef = useRef(0);
  const dragSnapshotRef = useRef<EventTask[] | null>(null);
  const dragCurrentTasksRef = useRef<EventTask[]>([]);
  const draggingRef = useRef(false);
  const reorderingRef = useRef(false);
  const pendingRealtimeRef = useRef(false);
  const openCollaborationTaskIdRef = useRef('');

  const loadTasks = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setError('');
    try {
      const response = await apiFetch<{ tasks: EventTask[] }>(`/admin/${COMMUNITY_ID}/events/${eventId}/tasks`);
      if (mountedRef.current && requestId === loadRequestRef.current) {
        if (draggingRef.current || reorderingRef.current) pendingRealtimeRef.current = true;
        else setTasks(response.tasks);
      }
    } catch {
      if (mountedRef.current && requestId === loadRequestRef.current && !draggingRef.current && !reorderingRef.current) setError(t.admin.eventTasksLoadFailed);
    }
  }, [eventId, t.admin.eventTasksLoadFailed]);

  const loadMembers = useCallback(async () => {
    if (canManage) {
      try {
        const response = await apiFetch<Member[]>(`/admin/${COMMUNITY_ID}/members`);
        if (mountedRef.current) setMembers(response.filter((member) => member.status === 'ACTIVE'));
      } catch {
        if (mountedRef.current) setMembers([]);
      }
    }
  }, [canManage]);

  useEffect(() => {
    mountedRef.current = true;
    void loadTasks();
    void loadMembers();
    return () => { mountedRef.current = false; };
  }, [loadMembers, loadTasks]);

  useEffect(() => {
    if (!draggingRef.current) dragCurrentTasksRef.current = tasks ?? [];
  }, [tasks]);

  useEventTaskRealtime(eventId, (payload) => {
    const isCollaborationChange = payload.reason === 'comment-added'
      || payload.reason === 'comment-archived'
      || payload.reason === 'attachment-added'
      || payload.reason === 'attachment-archived'
      || payload.reason === 'checklist-added'
      || payload.reason === 'checklist-updated'
      || payload.reason === 'checklist-toggled'
      || payload.reason === 'checklist-archived'
      || payload.reason === 'checklist-reordered';
    if (isCollaborationChange && String(payload.taskId ?? '') === openCollaborationTaskIdRef.current) {
      setCollaborationRevision((current) => current + 1);
    }
    if (draggingRef.current || reorderingRef.current) {
      pendingRealtimeRef.current = true;
      return;
    }
    void loadTasks();
  });

  const memberByUserId = useMemo(() => new Map(members.map((member) => [member.user.id, member])), [members]);
  const activeTask = useMemo(() => (tasks ?? []).find((task) => task.id === activeTaskId) ?? dragSnapshotRef.current?.find((task) => task.id === activeTaskId) ?? null, [activeTaskId, tasks]);
  const collaborationTask = useMemo(() => (tasks ?? []).find((task) => task.id === searchParams.get('taskId')) ?? null, [searchParams, tasks]);
  const collaborationTab = searchParams.get('tab') === 'activity' ? 'activity' : searchParams.get('tab') === 'attachments' ? 'attachments' : searchParams.get('tab') === 'checklist' ? 'checklist' : 'comments';

  useEffect(() => {
    openCollaborationTaskIdRef.current = collaborationTask?.id ?? '';
  }, [collaborationTask?.id]);

  function openCreate() {
    setEditingTask(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(task: EventTask) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      assigneeIds: task.assignees?.map((assignee) => assignee.id) ?? (task.assigneeId ? [task.assigneeId] : []),
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      priority: task.priority,
      label: task.label ?? '',
    });
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditingTask(null);
    setForm(emptyForm);
  }

  const openCollaboration = useCallback((taskId: string, tab: 'comments' | 'activity' | 'attachments' | 'checklist' = 'comments') => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('taskId', taskId);
    next.set('tab', tab);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeCollaboration = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('taskId');
    next.delete('tab');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  async function saveTask() {
    if (saving) return;
    if (!form.title.trim()) {
      toast.error(t.admin.eventTaskTitleRequired);
      return;
    }
    setSaving(true);
    try {
      const task = await apiFetch<EventTask>(editingTask
        ? `/admin/${COMMUNITY_ID}/events/${eventId}/tasks/${editingTask.id}`
        : `/admin/${COMMUNITY_ID}/events/${eventId}/tasks`, {
        method: editingTask ? 'PATCH' : 'POST',
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          assigneeIds: form.assigneeIds,
          dueDate: form.dueDate || null,
          priority: form.priority,
          label: form.label || null,
        }),
      });
      setTasks((current) => editingTask
        ? (current ?? []).map((item) => item.id === task.id ? task : item)
        : [...(current ?? []), task]);
      toast.success(editingTask ? t.admin.eventTaskUpdated : t.admin.eventTaskCreated);
      setFormOpen(false);
      setEditingTask(null);
      setForm(emptyForm);
    } catch {
      toast.error(t.admin.eventTaskSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(task: EventTask, status: EventTaskStatus) {
    if (movingTaskId || reordering || task.status === status) return;
    const previous = tasks ?? [];
    setMovingTaskId(task.id);
    setTasks(previous.map((item) => item.id === task.id ? { ...item, status } : item));
    try {
      const updated = await apiFetch<EventTask>(`/admin/${COMMUNITY_ID}/events/${eventId}/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setTasks((current) => (current ?? []).map((item) => item.id === updated.id ? updated : item));
      toast.success(t.admin.eventTaskMoved);
    } catch {
      setTasks(previous);
      toast.error(t.admin.eventTaskMoveFailed);
    } finally {
      setMovingTaskId('');
    }
  }

  function handleDragStart(event: DragStartEvent) {
    if (!canManage || !tasks) return;
    const taskId = String(event.active.id);
    if (!tasks.some((task) => task.id === taskId)) return;
    dragSnapshotRef.current = tasks;
    dragCurrentTasksRef.current = tasks;
    draggingRef.current = true;
    setActiveTaskId(taskId);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) return;
    const currentTasks = dragCurrentTasksRef.current;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const sourceStatus = taskBoardStatusForId(currentTasks, activeId);
    const targetStatus = taskBoardStatusForDropTarget(currentTasks, overId);
    if (!sourceStatus || !targetStatus) return;

    const nextColumns = taskBoardColumns(currentTasks);
    const sourceIndex = nextColumns[sourceStatus].findIndex((task) => task.id === activeId);
    if (sourceIndex < 0) return;
    if (sourceStatus === targetStatus) {
      const overIndex = statuses.includes(overId as EventTaskStatus)
        ? nextColumns[targetStatus].length - 1
        : nextColumns[targetStatus].findIndex((task) => task.id === overId);
      if (overIndex < 0 || sourceIndex === overIndex) return;
      nextColumns[sourceStatus] = arrayMove(nextColumns[sourceStatus], sourceIndex, overIndex);
    } else {
      const [activeTaskValue] = nextColumns[sourceStatus].splice(sourceIndex, 1);
      const overIndex = nextColumns[targetStatus].findIndex((task) => task.id === overId);
      nextColumns[targetStatus].splice(overIndex < 0 ? nextColumns[targetStatus].length : overIndex, 0, { ...activeTaskValue, status: targetStatus });
    }
    const nextTasks = tasksFromTaskBoardColumns(nextColumns);
    dragCurrentTasksRef.current = nextTasks;
    setTasks(nextTasks);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const snapshot = dragSnapshotRef.current;
    const overId = event.over ? String(event.over.id) : '';
    const nextTasks = dragCurrentTasksRef.current;

    if (!snapshot || !overId) {
      if (snapshot) setTasks(snapshot);
      finishDrag();
      return;
    }

    setActiveTaskId('');
    draggingRef.current = false;
    if (sameTaskBoardOrder(snapshot, nextTasks)) {
      dragSnapshotRef.current = null;
      flushRealtimeRefresh();
      return;
    }

    setReordering(true);
    reorderingRef.current = true;
    try {
      const response = await apiFetch<{ tasks: EventTask[] }>(`/admin/${COMMUNITY_ID}/events/${eventId}/tasks/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ taskId: String(event.active.id), columns: taskBoardColumnIds(taskBoardColumns(nextTasks)) }),
      });
      if (mountedRef.current) setTasks(response.tasks);
    } catch {
      if (mountedRef.current) setTasks(snapshot);
      toast.error(t.admin.eventTaskReorderFailed);
    } finally {
      dragSnapshotRef.current = null;
      reorderingRef.current = false;
      if (mountedRef.current) setReordering(false);
      flushRealtimeRefresh();
    }
  }

  function handleDragCancel(_event?: DragCancelEvent) {
    if (dragSnapshotRef.current) setTasks(dragSnapshotRef.current);
    if (dragSnapshotRef.current) dragCurrentTasksRef.current = dragSnapshotRef.current;
    dragSnapshotRef.current = null;
    finishDrag();
  }

  function finishDrag() {
    setActiveTaskId('');
    draggingRef.current = false;
    flushRealtimeRefresh();
  }

  function flushRealtimeRefresh() {
    if (!pendingRealtimeRef.current || draggingRef.current || reorderingRef.current) return;
    pendingRealtimeRef.current = false;
    void loadTasks();
  }

  async function confirmArchive() {
    if (!archiveTask || archiving) return;
    setArchiving(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/events/${eventId}/tasks/${archiveTask.id}`, { method: 'DELETE' });
      setTasks((current) => (current ?? []).filter((task) => task.id !== archiveTask.id));
      toast.success(t.admin.eventTaskArchived);
      setArchiveTask(null);
      closeForm();
    } catch {
      toast.error(t.admin.eventTaskSaveFailed);
    } finally {
      setArchiving(false);
    }
  }

  async function openApplyTemplate() {
    setApplyOpen(true);
    setTemplates(null);
    setSelectedTemplateId('');
    try {
      const data = await apiFetch<TaskTemplate[]>(`/admin/${COMMUNITY_ID}/event-task-templates`);
      setTemplates(data.filter((template) => template.isActive));
    } catch {
      setTemplates([]);
      toast.error(t.admin.taskTemplateApplyFailed);
    }
  }

  async function applyTemplate() {
    if (!selectedTemplateId || applyingTemplate) return;
    setApplyingTemplate(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/events/${eventId}/task-templates/${selectedTemplateId}/apply`, { method: 'POST', body: JSON.stringify({ defaultStatus: 'TODO' }) });
      toast.success(t.admin.taskTemplateApplied);
      setApplyOpen(false);
      await loadTasks();
    } catch {
      toast.error(t.admin.taskTemplateApplyFailed);
    } finally {
      setApplyingTemplate(false);
    }
  }

  return (
    <section aria-labelledby="event-task-board-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {!minimalHeading && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent/80">{t.admin.eventTaskCoordination}</p>}
          <h2 id="event-task-board-title" className={`${minimalHeading ? '' : 'mt-1'} text-xl font-semibold text-white`}>{t.admin.eventTaskBoard}</h2>
          {!minimalHeading && <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">{t.admin.eventTaskBoardDescription}</p>}
        </div>
        {canManage && <div className="flex flex-wrap gap-2"><Link href="/admin/task-boards?tab=automations-templates" className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-semibold text-white/65 transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent">{t.admin.taskTemplates}</Link><button type="button" onClick={openApplyTemplate} className="inline-flex h-10 items-center justify-center rounded-full border border-accent/25 bg-accent/10 px-4 text-sm font-semibold text-accent transition hover:bg-accent/15">{t.admin.applyTaskTemplate}</button><button type="button" onClick={openCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-background transition hover:bg-[#74e4b1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><Plus size={16} />{t.admin.addEventTask}</button></div>}
      </div>

      {error ? <TableErrorState title={error} retryLabel={t.common.retry} onRetry={loadTasks} /> : !tasks ? (
        <div className="grid min-h-64 animate-pulse gap-4 lg:grid-cols-3">{statuses.map((status) => <div key={status} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="h-5 w-28 rounded bg-white/10" /><div className="mt-5 h-28 rounded-lg bg-white/[0.06]" /></div>)}</div>
      ) : (
        <TaskBoardKanbanView dndContextId={`event-task-board-${eventId}`} tasks={tasks} members={memberByUserId} locale={lang === 'fr' ? 'fr-FR' : 'en-US'} canManage={canManage} moving={Boolean(movingTaskId) || reordering} activeTask={activeTask} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel} onEdit={openEdit} onComments={(task) => openCollaboration(task.id)} onMove={moveTask} t={t} />
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="event-task-form-title">
          <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-[#0a120f] p-5 shadow-2xl shadow-black/50 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 id="event-task-form-title" className="text-lg font-semibold text-white">{editingTask ? t.admin.editEventTask : t.admin.addEventTask}</h2><p className="mt-1 text-sm leading-6 text-white/45">{t.admin.eventTaskFormDescription}</p></div>{editingTask && canArchive && <button type="button" title={t.admin.archiveEventTask} aria-label={t.admin.archiveEventTask} onClick={() => setArchiveTask(editingTask)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rose-200/15 text-rose-200 transition hover:bg-rose-300/10"><Archive size={16} /></button>}</div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TaskField label={t.admin.eventTaskTitle} value={form.title} onChange={(value) => setForm({ ...form, title: value })} className="sm:col-span-2" />
              <TaskField label={t.admin.eventTaskLabel} value={form.label} onChange={(value) => setForm({ ...form, label: value })} />
              <TaskField label={t.admin.eventTaskDueDate} type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} />
              <AppSelect value={form.priority} label={t.admin.eventTaskPriority} options={(['LOW', 'MEDIUM', 'HIGH'] as EventTaskPriority[]).map((priority) => ({ value: priority, label: priorityName(t, priority) }))} onChange={(priority) => setForm({ ...form, priority })} />
              <fieldset className="rounded-xl border border-white/10 bg-black/20 p-3"><legend className="px-1 text-sm text-white/70">{t.admin.eventTaskAssignee}</legend><div className="mt-1 max-h-36 space-y-1 overflow-y-auto">{members.map((member) => { const checked = form.assigneeIds.includes(member.user.id); return <label key={member.user.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/65 hover:bg-white/[0.05]"><input type="checkbox" checked={checked} onChange={() => setForm({ ...form, assigneeIds: checked ? form.assigneeIds.filter((id) => id !== member.user.id) : [...form.assigneeIds, member.user.id] })} className="accent-emerald-400" /><span className="truncate">{member.user.name}</span></label>; })}{members.length === 0 && <p className="px-2 py-2 text-xs text-white/35">{t.admin.eventTaskUnassigned}</p>}</div></fieldset>
              <label className="sm:col-span-2"><span className="text-sm text-white/70">{t.admin.eventTaskDescription}</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-accent/60" /></label>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={saving} onClick={closeForm} className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-50">{t.common.cancel}</button><LoadingButton loading={saving} loadingLabel={t.admin.savingEventTask} onClick={saveTask}>{t.admin.saveEventTask}</LoadingButton></div>
          </div>
        </div>
      )}

      {collaborationTask && <EventTaskCollaborationDrawer taskTitle={collaborationTask.title} endpointBase={`/admin/${COMMUNITY_ID}/events/${eventId}/tasks/${collaborationTask.id}`} taskId={collaborationTask.id} canComment={canManage} refreshToken={collaborationRevision} initialTab={collaborationTab} onClose={closeCollaboration} />}

      {applyOpen && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#08120e] p-5 shadow-2xl shadow-black/50"><h2 className="text-lg font-semibold text-white">{t.admin.selectTaskTemplate}</h2><p className="mt-1 text-sm text-white/48">{t.admin.applyTaskTemplateDescription}</p><div className="mt-5 max-h-[50vh] space-y-2 overflow-y-auto">{templates === null ? <CollaborationSkeletonRows /> : templates.length === 0 ? <p className="py-6 text-center text-sm text-white/40">{t.admin.noTaskTemplates}</p> : templates.map((template) => <label key={template.id} className={`block cursor-pointer rounded-lg p-3 ring-1 transition ${selectedTemplateId === template.id ? 'bg-accent/10 ring-accent/30' : 'bg-black/20 ring-white/[0.07] hover:ring-white/15'}`}><span className="flex items-start gap-3"><input type="radio" name="task-template" value={template.id} checked={selectedTemplateId === template.id} onChange={() => setSelectedTemplateId(template.id)} className="mt-1 accent-emerald-400" /><span className="min-w-0"><span className="block text-sm font-semibold text-white">{template.name}</span>{template.description && <span className="mt-1 block text-xs leading-5 text-white/45">{template.description}</span>}<span className="mt-2 block text-[11px] text-white/32">{t.admin.templateTaskCount(template.items.length)}</span></span></span></label>)}</div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={applyingTemplate} onClick={() => setApplyOpen(false)} className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/65 hover:bg-white/[0.07]">{t.common.cancel}</button><LoadingButton loading={applyingTemplate} loadingLabel={t.admin.applyTaskTemplate} disabled={!selectedTemplateId || applyingTemplate} onClick={applyTemplate}>{t.admin.applyTaskTemplate}</LoadingButton></div></div></div>}

      <ConfirmDialog open={Boolean(archiveTask)} title={t.admin.archiveEventTask} description={t.admin.archiveEventTaskConfirmDescription} confirmLabel={t.admin.archiveEventTask} cancelLabel={t.common.cancel} loading={archiving} onConfirm={confirmArchive} onCancel={() => setArchiveTask(null)} />
    </section>
  );
}

function CollaborationSkeletonRows() { return <div className="space-y-2"><div className="h-20 animate-pulse rounded-lg bg-white/[0.05]" /><div className="h-20 animate-pulse rounded-lg bg-white/[0.04]" /></div>; }

function TaskField({ label, value, onChange, type = 'text', className = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return <label className={className}><span className="text-sm text-white/70">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" /></label>;
}

function statusName(t: ReturnType<typeof useI18n>['t'], status: EventTaskStatus) {
  if (status === 'TODO') return t.admin.eventTaskTodo;
  if (status === 'IN_PROGRESS') return t.admin.eventTaskInProgress;
  return t.admin.eventTaskDone;
}

function priorityName(t: ReturnType<typeof useI18n>['t'], priority: EventTaskPriority) {
  if (priority === 'LOW') return t.admin.eventTaskLow;
  if (priority === 'HIGH') return t.admin.eventTaskHigh;
  return t.admin.eventTaskMedium;
}
