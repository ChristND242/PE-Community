'use client';

import { closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragCancelEvent, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, ClipboardList, GripVertical, MessageSquareText, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppSelect } from './app-select';
import { EventTaskDescription } from './event-task-description';
import { ProfilePhoto } from './profile-photo';
import { eventTaskDueState } from '../lib/event-task-due';
import type { useI18n } from '../lib/i18n';

export type TaskBoardStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TaskBoardPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskBoardTask = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskBoardStatus;
  priority: TaskBoardPriority;
  label?: string | null;
  dueDate?: string | null;
  dueState?: 'overdue' | 'due-soon' | null;
  assigneeId?: string | null;
  sortOrder: number;
  assignee?: { id: string; name: string; email: string } | null;
  assignees: Array<{ id: string; name: string; email: string }>;
  checklistProgress: { completed: number; total: number };
};
export type TaskBoardMember = {
  status: string;
  user: { id: string; name: string; email: string };
  profile?: { avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null } | null;
};
export type TaskBoardColumns = Record<TaskBoardStatus, TaskBoardTask[]>;

export const taskBoardStatuses: TaskBoardStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
const MAX_VISIBLE_TASK_ASSIGNEES = 2;

type TaskBoardKanbanViewProps = {
  dndContextId: string;
  tasks: TaskBoardTask[];
  members: Map<string, TaskBoardMember>;
  locale: string;
  canManage: boolean;
  moving: boolean;
  activeTask: TaskBoardTask | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
  onEdit: (task: TaskBoardTask) => void;
  onComments: (task: TaskBoardTask) => void;
  onMove: (task: TaskBoardTask, status: TaskBoardStatus) => void;
  t: ReturnType<typeof useI18n>['t'];
};

export function TaskBoardKanbanView({ dndContextId, tasks, members, locale, canManage, moving, activeTask, onDragStart, onDragOver, onDragEnd, onDragCancel, onEdit, onComments, onMove, t }: TaskBoardKanbanViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns = taskBoardColumns(tasks);

  return (
    <DndContext id={dndContextId} sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div className="chat-scrollbar overflow-x-auto rounded-xl bg-[var(--task-board-workspace)] pb-2">
        <div className="grid min-w-[900px] grid-cols-3 gap-4">
          {taskBoardStatuses.map((status) => (
            <TaskColumn key={status} status={status} tasks={columns[status]} t={t}>
              {columns[status].map((task) => (
                <SortableTaskCard key={task.id} task={task} members={members} locale={locale} canManage={canManage} moving={moving} onEdit={() => onEdit(task)} onComments={() => onComments(task)} onMove={(status) => onMove(task, status)} t={t} />
              ))}
            </TaskColumn>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <TaskCardVisual task={activeTask} members={members} locale={locale} canManage={false} moving overlay onEdit={() => undefined} onComments={() => undefined} onMove={() => undefined} t={t} /> : null}</DragOverlay>
    </DndContext>
  );
}

type TaskCardProps = { task: TaskBoardTask; members: Map<string, TaskBoardMember>; locale: string; canManage: boolean; moving: boolean; onEdit: () => void; onComments: () => void; onMove: (status: TaskBoardStatus) => void; t: ReturnType<typeof useI18n>['t'] };

function TaskColumn({ status, tasks, children, t }: { status: TaskBoardStatus; tasks: TaskBoardTask[]; children: ReactNode; t: ReturnType<typeof useI18n>['t'] }) {
  const { isOver, setNodeRef } = useDroppable({ id: status, data: { type: 'event-task-column', status } });
  return <div ref={setNodeRef} className={`min-w-0 rounded-xl border p-3 transition-colors ${isOver ? 'border-accent/30 bg-[var(--task-board-drop)]' : 'border-white/10 bg-[var(--task-board-column)]'}`}><div className="flex items-center justify-between gap-3 px-1 py-1"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${statusTone(status)}`} /><h3 className="text-sm font-semibold text-white">{statusName(t, status)}</h3></div><span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-semibold tabular-nums text-white/55">{tasks.length}</span></div><SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}><div className="mt-3 min-h-28 space-y-3">{tasks.length === 0 ? <div className={`rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${isOver ? 'border-accent/25 bg-[var(--task-board-drop-empty)]' : 'border-white/10'}`}><ClipboardList className="mx-auto text-white/25" size={20} /><p className="mt-2 text-xs text-white/40">{isOver ? t.admin.eventTaskDropHere : t.admin.noEventTasks}</p></div> : children}</div></SortableContext></div>;
}

function SortableTaskCard(props: TaskCardProps) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({ id: props.task.id, disabled: !props.canManage || props.moving, data: { type: 'event-task', status: props.task.status } });
  const dragHandle = props.canManage ? <button ref={setActivatorNodeRef} type="button" title={props.t.admin.eventTaskDrag} aria-label={`${props.t.admin.eventTaskDrag}: ${props.task.title}`} {...attributes} {...listeners} className="grid h-8 w-8 shrink-0 cursor-grab place-items-center rounded-full text-white/28 outline-none transition hover:bg-white/[0.07] hover:text-white/65 focus-visible:bg-white/[0.07] focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-accent/25 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-35"><GripVertical size={15} /></button> : null;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'relative z-10 opacity-30' : ''}><TaskCardVisual {...props} dragHandle={dragHandle} /></div>;
}

function TaskCardVisual({ task, members, locale, canManage, moving, onEdit, onComments, onMove, t, dragHandle, overlay = false }: TaskCardProps & { dragHandle?: ReactNode; overlay?: boolean }) {
  const assignees = task.assignees ?? (task.assignee ? [task.assignee] : []);
  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_TASK_ASSIGNEES);
  const remainingAssigneeCount = Math.max(0, assignees.length - MAX_VISIBLE_TASK_ASSIGNEES);
  const dueState = task.dueState === undefined ? eventTaskDueState(task.dueDate, task.status) : task.dueState;
  return <article className={`rounded-lg border bg-[var(--task-board-card)] p-3.5 transition ${overlay ? 'w-[280px] rotate-[0.5deg] border-accent/30 shadow-2xl shadow-black/50 ring-1 ring-accent/15' : 'border-white/[0.08] shadow-lg shadow-black/10 hover:border-[var(--task-board-card-hover-border)] hover:bg-[var(--task-board-card-hover)]'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0">{task.label && <span className="inline-flex max-w-full truncate rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-white/55">{task.label}</span>}<div className="mt-2 flex items-start gap-2"><span title={priorityName(t, task.priority)} aria-label={priorityName(t, task.priority)} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityTone(task.priority)}`} /><h4 className="text-sm font-semibold leading-5 text-white">{task.title}</h4></div></div><div className="flex shrink-0 items-center gap-0.5">{dragHandle}{canManage && <button type="button" title={t.admin.editEventTask} aria-label={t.admin.editEventTask} onClick={onEdit} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/[0.07] hover:text-white"><Pencil size={14} /></button>}</div></div><EventTaskDescription description={task.description} readMoreLabel={t.common.readMore} showLessLabel={t.common.showLess} />{task.checklistProgress.total > 0 && <div className="mt-3"><div className="flex items-center justify-between text-[11px] text-white/42"><span>{t.common.checklist}</span><span className="tabular-nums">{t.common.checklistProgress(task.checklistProgress.completed, task.checklistProgress.total)}</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]"><span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round((task.checklistProgress.completed / task.checklistProgress.total) * 100)}%` }} /></div></div>}<div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3"><div className="min-w-0">{task.dueDate && <div className="flex flex-wrap items-center gap-2"><p className={`flex items-center gap-1.5 text-[11px] ${dueState === 'overdue' ? 'text-[var(--task-overdue)]' : dueState === 'due-soon' ? 'text-[var(--task-due-soon)]' : 'text-[var(--task-date)]'}`}><CalendarDays size={12} />{formatTaskDate(task.dueDate, locale)}</p>{dueState && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dueState === 'overdue' ? 'border-rose-300/20 bg-rose-300/10 text-rose-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>{dueState === 'overdue' ? t.common.overdue : t.common.dueSoon}</span>}</div>}<div className="mt-1.5 flex items-center gap-2">{assignees.length ? <div className="flex -space-x-2">{visibleAssignees.map((assignee) => { const member = members.get(assignee.id); return <ProfilePhoto key={assignee.id} name={assignee.name} avatarUrl={member?.profile?.avatarUrl} dicebearStyle={member?.profile?.dicebearStyle} dicebearSeed={member?.profile?.dicebearSeed} size="sm" alt={assignee.name} className="h-7 w-7 rounded-full border-2 border-[#07100c] text-[10px]" />; })}{remainingAssigneeCount > 0 && <span aria-label={t.admin.eventTaskMoreAssignees(remainingAssigneeCount)} className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#07100c] bg-white/10 text-[9px] text-white/65">+{remainingAssigneeCount}</span>}</div> : <span className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-white/15 text-[10px] text-white/30">-</span>}<span className="truncate text-[11px] text-white/45">{assignees.length ? `${t.admin.eventTaskAssignedTo} ${assignees.map((assignee) => assignee.name).join(', ')}` : t.admin.eventTaskUnassigned}</span></div></div></div>{!overlay && <button type="button" onClick={(event) => { event.stopPropagation(); onComments(); }} aria-disabled={!canManage} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><MessageSquareText size={13} />{t.common.comments}</button>}{canManage && <div className="mt-3"><AppSelect value={task.status} options={taskBoardStatuses.map((status) => ({ value: status, label: statusName(t, status) }))} ariaLabel={`${t.admin.eventTaskMove}: ${task.title}`} disabled={moving} dense className="min-w-0" onChange={onMove} /></div>}</article>;
}

export function taskBoardColumns(tasks: TaskBoardTask[]): TaskBoardColumns {
  const columns: TaskBoardColumns = { TODO: [], IN_PROGRESS: [], DONE: [] };
  tasks.forEach((task) => columns[task.status].push(task));
  taskBoardStatuses.forEach((status) => columns[status].sort((left, right) => left.sortOrder - right.sortOrder));
  return columns;
}

export function tasksFromTaskBoardColumns(columns: TaskBoardColumns) { return taskBoardStatuses.flatMap((status) => columns[status].map((task, sortOrder) => ({ ...task, status, sortOrder }))); }
export function taskBoardColumnIds(columns: TaskBoardColumns) { return taskBoardStatuses.reduce<Record<TaskBoardStatus, string[]>>((result, status) => { result[status] = columns[status].map((task) => task.id); return result; }, { TODO: [], IN_PROGRESS: [], DONE: [] }); }
export function taskBoardStatusForId(tasks: TaskBoardTask[], taskId: string) { return tasks.find((task) => task.id === taskId)?.status; }
export function taskBoardStatusForDropTarget(tasks: TaskBoardTask[], targetId: string) { return taskBoardStatuses.includes(targetId as TaskBoardStatus) ? targetId as TaskBoardStatus : taskBoardStatusForId(tasks, targetId); }
export function sameTaskBoardOrder(previous: TaskBoardTask[], next: TaskBoardTask[]) { const previousColumns = taskBoardColumnIds(taskBoardColumns(previous)); const nextColumns = taskBoardColumnIds(taskBoardColumns(next)); return taskBoardStatuses.every((status) => previousColumns[status].join(',') === nextColumns[status].join(',')); }

function statusName(t: ReturnType<typeof useI18n>['t'], status: TaskBoardStatus) { if (status === 'TODO') return t.admin.eventTaskTodo; if (status === 'IN_PROGRESS') return t.admin.eventTaskInProgress; return t.admin.eventTaskDone; }
function priorityName(t: ReturnType<typeof useI18n>['t'], priority: TaskBoardPriority) { if (priority === 'LOW') return t.admin.eventTaskLow; if (priority === 'HIGH') return t.admin.eventTaskHigh; return t.admin.eventTaskMedium; }
function statusTone(status: TaskBoardStatus) { if (status === 'IN_PROGRESS') return 'bg-amber-300'; if (status === 'DONE') return 'bg-emerald-300'; return 'bg-slate-300'; }
function priorityTone(priority: TaskBoardPriority) { if (priority === 'HIGH') return 'bg-rose-300'; if (priority === 'MEDIUM') return 'bg-amber-300'; return 'bg-emerald-300'; }
function formatTaskDate(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)); }
