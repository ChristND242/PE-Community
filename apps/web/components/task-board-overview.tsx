'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Timer,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { ProfilePhoto } from './profile-photo';

export type TaskBoardOverviewData = {
  readiness: {
    score: number;
    label: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'COMPLETE';
  };
  tasks: {
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
    dueSoon: number;
    unassigned: number;
    assignedToMe?: number;
  };
  checklist: { total: number; completed: number; percent: number };
  collaboration: {
    comments: number;
    attachments: number;
    recentActivity: number;
  };
  assignees: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
    role?: string | null;
    totalTasks: number;
    doneTasks: number;
    overdueTasks: number;
  }>;
  blockers: Array<{
    type:
      | 'OVERDUE_TASK'
      | 'UNASSIGNED_TASK'
      | 'INCOMPLETE_CHECKLIST'
      | 'NO_TASKS'
      | 'DUE_SOON';
    taskId?: string;
    title: string;
    targetTab?: 'comments' | 'checklist';
  }>;
};

export function TaskBoardOverview({
  overview,
  mode,
  memberRole,
  onOpenTask,
}: {
  overview: TaskBoardOverviewData;
  mode: 'admin' | 'member';
  memberRole?: 'ASSIGNED' | 'VIEWER';
  onOpenTask: (taskId: string, tab: 'comments' | 'checklist') => void;
}) {
  const { t } = useI18n();
  const readinessLabel = readinessStatusLabel(overview.readiness.label, t);
  const readinessTone = readinessStatusTone(overview.readiness.label);
  const blockers =
    mode === 'member'
      ? overview.blockers.filter((blocker) => blocker.type !== 'UNASSIGNED_TASK').slice(0, 4)
      : overview.blockers.slice(0, 5);
  const completionPercent = overview.tasks.total ? Math.round((overview.tasks.done / overview.tasks.total) * 100) : 0;
  const workDescription = mode === 'member' && memberRole === 'VIEWER' ? t.dashboard.publicBoardViewerDescription : '';

  return (
    <section aria-labelledby={`${mode}-board-overview-title`} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${mode}-board-overview-title`} className="text-xl font-semibold tracking-tight text-white">
            {t.admin.boardHealth}
          </h2>
          {workDescription && <p className="mt-1 text-xs text-white/38">{workDescription}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <SignalPill tone={overview.tasks.overdue > 0 ? 'danger' : 'muted'} label={t.common.overdue} value={overview.tasks.overdue} />
          <SignalPill tone={overview.tasks.dueSoon > 0 ? 'warn' : 'muted'} label={t.common.dueSoon} value={overview.tasks.dueSoon} />
          {mode === 'admin' && <SignalPill tone={overview.tasks.unassigned > 0 ? 'warn' : 'muted'} label={t.admin.eventTaskUnassigned} value={overview.tasks.unassigned} />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CommandCard className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">{t.admin.readiness}</p>
          <div className="mt-4 flex items-center gap-5">
            <DottedReadinessGauge value={overview.readiness.score} tone={readinessTone} label={t.admin.readiness} />
            <div className="min-w-0">
              <p className="mt-1 text-sm font-semibold text-white/72">{readinessLabel}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] text-white/38">
                <MiniSignal label={t.common.overdue} value={overview.tasks.overdue} />
                <MiniSignal label={t.common.dueSoon} value={overview.tasks.dueSoon} />
                <MiniSignal label={mode === 'member' ? t.dashboard.assignedToMe : t.admin.eventTaskUnassigned} value={mode === 'member' ? overview.tasks.assignedToMe ?? 0 : overview.tasks.unassigned} />
              </div>
            </div>
          </div>
        </CommandCard>

        <CommandCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">{t.admin.taskStatus}</p>
          <div className="mt-5">
            <SegmentedTaskBar todo={overview.tasks.todo} inProgress={overview.tasks.inProgress} done={overview.tasks.done} total={overview.tasks.total} />
            <div className="mt-5 grid grid-cols-3 gap-2">
              <TaskCount label={t.dashboard.eventTaskTodo} value={overview.tasks.todo} />
              <TaskCount label={t.dashboard.eventTaskInProgress} value={overview.tasks.inProgress} />
              <TaskCount label={t.dashboard.eventTaskDone} value={overview.tasks.done} accent />
            </div>
            <p className="mt-4 text-xs text-white/42">
              {overview.tasks.done}/{overview.tasks.total} {t.admin.tasksDone} · {completionPercent}%
            </p>
          </div>
        </CommandCard>

        <CommandCard>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">{t.admin.checklist}</p>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums text-white">{overview.checklist.completed}/{overview.checklist.total}</p>
              <p className="mt-1 text-sm text-white/45">{overview.checklist.percent}%</p>
            </div>
            <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${overview.checklist.percent >= 100 ? 'border-accent/25 bg-accent/10 text-accent' : 'border-white/10 bg-white/[0.045] text-white/55'}`}>
              <ClipboardCheck size={22} />
            </span>
          </div>
          <SegmentedProgress
            value={overview.checklist.completed}
            total={overview.checklist.total}
            maxSegments={12}
            ariaLabel={`${t.admin.checklistProgress}: ${overview.checklist.completed}/${overview.checklist.total}, ${overview.checklist.percent}%`}
          />
        </CommandCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <CollaborationPulseCard collaboration={overview.collaboration} t={t} />
        <AssigneeWorkloadCard assignees={overview.assignees} t={t} />
      </div>
      <NeedsAttentionCard overview={overview} blockers={blockers} mode={mode} onOpenTask={onOpenTask} t={t} />
    </section>
  );
}

function CommandCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article className={`rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.022))] p-4 shadow-2xl shadow-black/10 ring-1 ring-white/[0.025] ${className}`}>
      {children}
    </article>
  );
}

function NeedsAttentionCard({ overview, blockers, mode, onOpenTask, t }: { overview: TaskBoardOverviewData; blockers: TaskBoardOverviewData['blockers']; mode: 'admin' | 'member'; onOpenTask: (taskId: string, tab: 'comments' | 'checklist') => void; t: ReturnType<typeof useI18n>['t'] }) {
  return <CommandCard><div className="flex items-center justify-between gap-3"><div><p className="text-base font-semibold text-white">{t.admin.planningNeedsAttention}</p><p className="mt-1 text-xs text-white/38">{blockers.length ? t.admin.attentionItemCount(blockers.length) : t.admin.noUrgentIssues}</p></div><AlertTriangle size={18} className={blockers.length ? 'text-amber-200' : 'text-white/30'} /></div><div className="mt-4 space-y-2">{overview.tasks.total === 0 ? <EmptyLine text={mode === 'admin' ? t.admin.addTasksBoardGuidance : t.dashboard.noVisibleBoardTasks} /> : blockers.length ? blockers.map((blocker, index) => <button key={`${blocker.type}-${blocker.taskId ?? index}`} type="button" disabled={!blocker.taskId} onClick={() => blocker.taskId && onOpenTask(blocker.taskId, blocker.targetTab ?? 'comments')} className={`group flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition disabled:cursor-default ${blockerTone(blocker.type)}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/20">{blockerIcon(blocker.type)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white/82">{blocker.title}</span><span className="mt-0.5 block text-xs text-white/40">{blockerLabel(blocker.type, t)}</span></span>{blocker.taskId && <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/48 group-hover:border-accent/30 group-hover:text-accent">{t.admin.openTask}</span>}</button>) : <EmptyLine text={t.admin.noUrgentIssues} />}</div></CommandCard>;
}

function AssigneeWorkloadCard({ assignees, t }: { assignees: TaskBoardOverviewData['assignees']; t: ReturnType<typeof useI18n>['t'] }) {
  const visibleAssignees = assignees.slice(0, 5);
  const maxMagnitude = Math.max(1, ...visibleAssignees.map((assignee) => Math.max(assignee.overdueTasks, Math.max(assignee.totalTasks - assignee.overdueTasks, 0))));
  return <CommandCard><p className="text-base font-semibold text-white">{t.admin.assigneeWorkload}</p>{visibleAssignees.length ? <div className="mt-4 space-y-3">{visibleAssignees.map((assignee) => <AssigneeWorkloadRow key={assignee.id} assignee={assignee} maxMagnitude={maxMagnitude} t={t} />)}</div> : <div className="mt-4"><EmptyLine text={t.admin.noAssigneeWorkloadYet} /></div>}</CommandCard>;
}

function AssigneeWorkloadRow({ assignee, maxMagnitude, t }: { assignee: TaskBoardOverviewData['assignees'][number]; maxMagnitude: number; t: ReturnType<typeof useI18n>['t'] }) {
  const positiveCount = Math.max(assignee.totalTasks - assignee.overdueTasks, 0);
  const negativeCount = assignee.overdueTasks;
  const positiveWidth = `${Math.round((positiveCount / maxMagnitude) * 100)}%`;
  const negativeWidth = `${Math.round((negativeCount / maxMagnitude) * 100)}%`;
  const workloadLabel = `${assignee.name}: ${assignee.doneTasks}/${assignee.totalTasks} ${t.admin.tasksDone}, ${negativeCount} ${t.common.overdue}`;
  return <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-3"><div className="flex items-center gap-3"><span tabIndex={0} role="img" aria-label={workloadLabel} className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/35"><span className="block overflow-hidden rounded-full border border-white/10 transition group-hover:border-accent/50 group-focus-within:border-accent/60"><ProfilePhoto name={assignee.name} avatarUrl={assignee.avatarUrl} dicebearStyle={assignee.dicebearStyle} dicebearSeed={assignee.dicebearSeed} size="sm" className="h-9 w-9 rounded-full text-[11px]" /></span><span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#07120e] px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus:opacity-100">{assignee.name}</span></span><div className="min-w-0 flex-1"><div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center gap-1" role="img" aria-label={`${assignee.name}: ${positiveCount} ${t.admin.positiveWorkload}, ${negativeCount} ${t.admin.overdueWorkload}`}><div className="flex h-3 justify-end overflow-hidden rounded-l-full bg-white/[0.04]"><span className="h-full rounded-l-full bg-rose-400/80 transition-[width]" style={{ width: negativeWidth }} /></div><span className="h-5 w-px bg-white/20" /><div className="h-3 overflow-hidden rounded-r-full bg-white/[0.04]"><span className="block h-full rounded-r-full bg-accent/80 transition-[width]" style={{ width: positiveWidth }} /></div></div><div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-xs"><span className="shrink-0 font-semibold tabular-nums text-white/72">{assignee.doneTasks}/{assignee.totalTasks} {t.admin.tasksDone}</span>{negativeCount > 0 ? <span className="truncate rounded-full border border-rose-300/20 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold text-rose-100">{negativeCount} {t.common.overdue}</span> : <span className="truncate text-[10px] text-white/38">{positiveCount} {t.admin.positiveWorkload}</span>}</div></div></div></div>;
}

type CollaborationSegment = { key: 'comments' | 'attachments' | 'updates'; label: string; value: number; color: string };

function CollaborationPulseCard({ collaboration, t }: { collaboration: TaskBoardOverviewData['collaboration']; t: ReturnType<typeof useI18n>['t'] }) {
  const segments: CollaborationSegment[] = [
    { key: 'comments', label: t.common.comments, value: collaboration.comments, color: '#5eead4' },
    { key: 'attachments', label: t.common.attachments, value: collaboration.attachments, color: '#67e8f9' },
    { key: 'updates', label: t.admin.updates, value: collaboration.recentActivity, color: '#fbbf24' },
  ];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const defaultActiveKey = largestCollaborationSegmentKey(segments);
  const [activeKey, setActiveKey] = useState<CollaborationSegment['key'] | null>(defaultActiveKey);
  useEffect(() => setActiveKey(defaultActiveKey), [defaultActiveKey]);
  const resetActive = () => setActiveKey(defaultActiveKey);
  return <CommandCard><p className="text-base font-semibold text-white">{t.admin.collaborationPulse}</p><div className="mt-4 grid items-center gap-5 sm:grid-cols-[minmax(170px,0.8fr)_minmax(0,1fr)]"><InteractiveCollaborationDonut segments={segments} total={total} activeKey={activeKey} activityLabel={t.admin.activity} emptyLabel={t.admin.noActivityYet} onActiveChange={setActiveKey} onResetActive={resetActive} /><div className="space-y-2">{segments.map((segment) => { const active = segment.key === activeKey; const percent = collaborationPercent(segment.value, total); return <button key={segment.key} type="button" onMouseEnter={() => segment.value > 0 && setActiveKey(segment.key)} onFocus={() => segment.value > 0 && setActiveKey(segment.key)} onMouseLeave={resetActive} onBlur={resetActive} aria-label={`${segment.label}: ${segment.value}, ${percent}%`} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition ${active ? 'border-white/20 bg-white/[0.07] shadow-sm shadow-black/15' : 'border-white/[0.07] bg-black/15 hover:border-white/15 hover:bg-white/[0.04]'} focus-visible:ring-2 focus-visible:ring-accent/25`}><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" /><span className="truncate text-sm font-medium text-white/68">{segment.label}</span></span><span className="flex shrink-0 items-center gap-2"><span className="text-xs tabular-nums text-white/40">{percent}%</span><span className="text-sm font-semibold tabular-nums text-white/82">{segment.value}</span></span></button>; })}</div></div></CommandCard>;
}

function InteractiveCollaborationDonut({ segments, total, activeKey, activityLabel, emptyLabel, onActiveChange, onResetActive }: { segments: CollaborationSegment[]; total: number; activeKey: CollaborationSegment['key'] | null; activityLabel: string; emptyLabel: string; onActiveChange: (key: CollaborationSegment['key']) => void; onResetActive: () => void }) {
  const size = 176;
  const strokeWidth = 16;
  const activeStrokeWidth = 20;
  const radius = 66;
  const activeRadius = 69;
  const circumference = 2 * Math.PI * radius;
  const activeSegment = segments.find((segment) => segment.key === activeKey && segment.value > 0) ?? null;
  let offset = 0;
  const renderedSegments = total > 0 ? segments.filter((segment) => segment.value > 0).map((segment) => { const dash = (segment.value / total) * circumference; const rendered = { ...segment, dashArray: `${dash} ${circumference - dash}`, dashOffset: -offset }; offset += dash; return rendered; }) : [];
  const orderedSegments = [...renderedSegments.filter((segment) => segment.key !== activeKey), ...renderedSegments.filter((segment) => segment.key === activeKey)];
  return <div className="relative mx-auto flex h-44 w-44 items-center justify-center"><svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" role="img" aria-label={`${activityLabel}: ${total}`}><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-white/10" />{orderedSegments.map((segment) => { const active = segment.key === activeKey; const percent = collaborationPercent(segment.value, total); return <circle key={segment.key} cx={size / 2} cy={size / 2} r={active ? activeRadius : radius} fill="none" stroke={segment.color} strokeWidth={active ? activeStrokeWidth : strokeWidth} strokeDasharray={segment.dashArray} strokeDashoffset={segment.dashOffset} strokeLinecap="round" tabIndex={0} role="button" aria-label={`${segment.label}: ${segment.value}, ${percent}%`} onMouseEnter={() => onActiveChange(segment.key)} onFocus={() => onActiveChange(segment.key)} onMouseLeave={onResetActive} onBlur={onResetActive} className={`cursor-pointer outline-none transition-all duration-200 ${active ? 'opacity-100' : 'opacity-70 hover:opacity-95'} focus-visible:opacity-100`} style={{ filter: active ? `drop-shadow(0 0 7px ${segment.color}66)` : undefined }}><title>{segment.label}: {segment.value} · {percent}%</title></circle>; })}</svg><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"><span className="text-3xl font-semibold tabular-nums text-white">{total}</span><span className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-white/38">{activityLabel}</span></div>{activeSegment ? <div className="pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#07120e]/95 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-xl">{activeSegment.label} · {activeSegment.value} · {collaborationPercent(activeSegment.value, total)}%</div> : total === 0 ? <div className="pointer-events-none absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[10px] text-white/38">{emptyLabel}</div> : null}</div>;
}

function largestCollaborationSegmentKey(segments: CollaborationSegment[]) { const visible = segments.filter((segment) => segment.value > 0); return visible.length ? visible.reduce((largest, segment) => segment.value > largest.value ? segment : largest).key : null; }
function collaborationPercent(value: number, total: number) { return total > 0 ? Math.round((value / total) * 100) : 0; }

function DottedReadinessGauge({ value, tone, label }: { value: number; tone: ReturnType<typeof readinessStatusTone>; label: string }) {
  const normalized = clampPercent(value);
  const dots = 44;
  const activeDots = Math.round((normalized / 100) * dots);
  const center = 48;
  const radius = 39;
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={`${label} ${normalized}%`}>
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90" aria-hidden="true">
        {Array.from({ length: dots }).map((_, index) => {
          const angle = (index / dots) * Math.PI * 2;
          const x = center + radius * Math.cos(angle);
          const y = center + radius * Math.sin(angle);
          const active = index < activeDots;
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={active ? 2.8 : 2.2}
              className={active ? `${tone.text} transition-colors duration-700` : 'text-white/10'}
              fill="currentColor"
            />
          );
        })}
        <circle cx={center} cy={center} r="29" fill="var(--app-panel-muted)" stroke="var(--app-border)" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`text-3xl font-semibold tabular-nums tracking-tight ${tone.text}`}>{normalized}%</span>
        <span className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-white/42">{label}</span>
      </div>
    </div>
  );
}

function SegmentedTaskBar({ todo, inProgress, done, total }: { todo: number; inProgress: number; done: number; total: number }) {
  const segments = [
    { value: done, className: 'bg-accent/75' },
    { value: inProgress, className: 'bg-sky-300/55' },
    { value: todo, className: 'bg-white/18' },
  ];
  return (
    <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.07]">
      {segments.map((segment, index) => (
        <span key={index} className={segment.className} style={{ width: `${total ? Math.max(4, (segment.value / total) * 100) : index === 2 ? 100 : 0}%` }} />
      ))}
    </div>
  );
}

function SegmentedProgress({ value, total, maxSegments, size = 'md', ariaLabel }: { value: number; total: number; maxSegments: number; size?: 'sm' | 'md'; ariaLabel: string }) {
  const segmentCount = total > 0 ? Math.min(total, maxSegments) : 1;
  const percent = total > 0 ? clampPercent((value / total) * 100) : 0;
  const activeSegments = total > maxSegments
    ? Math.round((percent / 100) * segmentCount)
    : Math.min(Math.max(value, 0), segmentCount);
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className={`mt-4 grid min-w-0 gap-1 ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
      style={{ gridTemplateColumns: `repeat(${segmentCount}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: segmentCount }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`min-w-0 rounded-full border transition-colors ${index < activeSegments ? 'border-accent/25 bg-accent/80 shadow-[0_0_10px_rgba(94,210,156,0.1)]' : 'border-white/[0.065] bg-white/[0.04]'}`}
        />
      ))}
    </div>
  );
}

function SignalPill({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'warn' | 'muted' }) {
  const className = tone === 'danger' ? 'border-rose-300/20 bg-rose-300/10 text-rose-100' : tone === 'warn' ? 'border-amber-300/20 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-white/[0.035] text-white/55';
  return <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold tabular-nums ${className}`}>{value} {label}</span>;
}

function MiniSignal({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="block text-sm font-semibold tabular-nums text-white/75">{value}</span>
      <span className="block truncate">{label}</span>
    </span>
  );
}

function TaskCount({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2">
      <p className={`text-xl font-semibold tabular-nums ${accent ? 'text-accent' : 'text-white/82'}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-white/35">{label}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-5 text-sm text-white/45">{text}</p>;
}

function readinessStatusLabel(label: TaskBoardOverviewData['readiness']['label'], t: ReturnType<typeof useI18n>['t']) {
  if (label === 'COMPLETE') return t.admin.planningComplete;
  if (label === 'ON_TRACK') return t.admin.planningOnTrack;
  if (label === 'AT_RISK') return t.admin.planningAtRisk;
  return t.admin.planningNeedsAttention;
}

function readinessStatusTone(label: TaskBoardOverviewData['readiness']['label']) {
  if (label === 'COMPLETE' || label === 'ON_TRACK') return { text: 'text-accent' };
  if (label === 'AT_RISK') return { text: 'text-rose-200' };
  return { text: 'text-amber-200' };
}

function blockerTone(type: TaskBoardOverviewData['blockers'][number]['type']) {
  if (type === 'OVERDUE_TASK') return 'border-rose-300/15 bg-rose-300/[0.07] hover:bg-rose-300/[0.1]';
  if (type === 'DUE_SOON' || type === 'UNASSIGNED_TASK') return 'border-amber-300/15 bg-amber-300/[0.06] hover:bg-amber-300/[0.09]';
  return 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.055]';
}

function blockerIcon(type: TaskBoardOverviewData['blockers'][number]['type']) {
  if (type === 'INCOMPLETE_CHECKLIST') return <ClipboardCheck size={15} />;
  if (type === 'OVERDUE_TASK' || type === 'DUE_SOON') return <Timer size={15} />;
  if (type === 'UNASSIGNED_TASK') return <Users size={15} />;
  return <CheckCircle2 size={15} />;
}

function blockerLabel(type: TaskBoardOverviewData['blockers'][number]['type'], t: ReturnType<typeof useI18n>['t']) {
  if (type === 'OVERDUE_TASK') return t.admin.overdueTasks;
  if (type === 'DUE_SOON') return t.common.dueSoon;
  if (type === 'UNASSIGNED_TASK') return t.admin.unassignedTasks;
  if (type === 'INCOMPLETE_CHECKLIST') return t.admin.incompleteChecklist;
  return t.admin.planningNeedsAttention;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
