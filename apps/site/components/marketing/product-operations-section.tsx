'use client';

import type {
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AutomationCanvasView,
  type AutomationCanvasGroup,
  type AutomationCanvasNode,
  type AutomationCanvasPosition,
} from '../automation-canvas-view';
import {
  CampaignsByStatusRadarCard,
  DeliveryStatusDistributionLineCard,
  RecentDeliveryTrendAreaChart,
  type CampaignStatusPoint,
  type DeliveryTrendPoint,
  type EmailTrendRange,
} from '../email-operations-charts';
import {
  TaskBoardKanbanView,
  sameTaskBoardOrder,
  taskBoardColumns,
  taskBoardStatusForDropTarget,
  taskBoardStatusForId,
  tasksFromTaskBoardColumns,
  type TaskBoardMember,
  type TaskBoardTask,
} from '../task-board-kanban-view';
import { useI18n } from '../../lib/i18n';
import { ShineBorder } from './shine-border';
import { COMMUNITY_IDENTITY_MEMBERS } from './community-identity-data';

type ProductOperationsMode = 'kanban' | 'automation' | 'email';
const modes: ProductOperationsMode[] = ['kanban', 'automation', 'email'];
const MARKETING_TASK_BOARD_DND_ID = 'marketing-task-board-preview';

export function ProductOperationsSection() {
  const { t } = useI18n();
  const [mode, setMode] = useState<ProductOperationsMode>('kanban');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const copy = t.landing.productOperations;
  const labels = {
    kanban: copy.tabs.kanban,
    automation: copy.tabs.automation,
    email: copy.tabs.email,
  };

  function selectFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? modes.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + modes.length) %
            modes.length;
    const next = modes[nextIndex];
    setMode(next);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section
      aria-labelledby="product-operations-title"
      className="site-product-section relative overflow-hidden border-t border-white/10 px-5 py-20 md:py-28 lg:py-32"
    >
      <div className="site-product-ambient pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(94,210,156,0.08),transparent_34%)]" />
      <div className="relative mx-auto max-w-[1280px]">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-jakarta text-[11px] font-bold uppercase tracking-[0.24em] text-accent">
            {copy.eyebrow}
          </p>
          <h2
            id="product-operations-title"
            className="mt-5 text-[clamp(2.4rem,5vw,4.8rem)] font-black leading-[0.98] tracking-tight"
          >
            {copy.title}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/58">
            {copy.subtitle}
          </p>
        </div>
        <div className="mt-9 flex justify-center">
          <div
            role="tablist"
            aria-label={copy.tabsLabel}
            className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1"
          >
            {modes.map((item, index) => (
              <button
                key={item}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`product-operations-tab-${item}`}
                type="button"
                role="tab"
                aria-selected={mode === item}
                aria-controls={`product-operations-panel-${item}`}
                tabIndex={mode === item ? 0 : -1}
                onClick={() => setMode(item)}
                onKeyDown={(event) => selectFromKeyboard(event, index)}
                className={`min-h-10 cursor-pointer rounded-lg px-4 text-sm font-semibold outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent/35 ${mode === item ? 'bg-accent text-[#04110b] shadow-sm shadow-emerald-950/30' : 'text-white/52 hover:bg-white/[0.055] hover:text-white'}`}
              >
                {labels[item]}
              </button>
            ))}
          </div>
        </div>
        <ShineBorder
          className="site-product-showcase-frame mt-10 shadow-[0_32px_90px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)]"
          contentClassName="site-dark-product-preview bg-black/20"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.025] px-5 py-3.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent/75">
              {copy.frameLabel}
            </span>
            <span className="text-sm font-semibold text-white/62">
              {labels[mode]}
            </span>
          </div>
          <div
            id={`product-operations-panel-${mode}`}
            role="tabpanel"
            aria-labelledby={`product-operations-tab-${mode}`}
            className="product-preview-panel min-h-[720px] overflow-hidden p-3 sm:p-5 lg:p-6"
          >
            {mode === 'kanban' ? (
              <KanbanPreview />
            ) : mode === 'automation' ? (
              <AutomationPreview />
            ) : (
              <EmailOperationsPreview />
            )}
          </div>
        </ShineBorder>
        <p className="mt-4 text-center text-sm text-white/40">
          {copy.temporaryNote}
        </p>
      </div>
      <style jsx>{`
        @keyframes product-preview-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .product-preview-panel {
          animation: product-preview-in 220ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .product-preview-panel {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}

function KanbanPreview() {
  const { lang, t } = useI18n();
  const [tasks, setTasks] = useState<TaskBoardTask[]>(() =>
    createTasks(t.landing.productOperations.tasks),
  );
  const [activeTaskId, setActiveTaskId] = useState('');
  const snapshotRef = useRef<TaskBoardTask[] | null>(null);
  const currentRef = useRef(tasks);
  useEffect(() => {
    const next = createTasks(t.landing.productOperations.tasks);
    setTasks(next);
    currentRef.current = next;
    snapshotRef.current = null;
    setActiveTaskId('');
  }, [lang, t.landing.productOperations.tasks]);
  const members = useMemo(
    () =>
      new Map<string, TaskBoardMember>(
        previewMembers.map((member) => [member.user.id, member]),
      ),
    [],
  );
  const activeTask =
    tasks.find((task) => task.id === activeTaskId) ??
    snapshotRef.current?.find((task) => task.id === activeTaskId) ??
    null;
  function dragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (!tasks.some((task) => task.id === id)) return;
    snapshotRef.current = tasks;
    currentRef.current = tasks;
    setActiveTaskId(id);
  }
  function dragOver(event: DragOverEvent) {
    if (!event.over) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const source = taskBoardStatusForId(currentRef.current, activeId);
    const target = taskBoardStatusForDropTarget(currentRef.current, overId);
    if (!source || !target) return;
    const columns = taskBoardColumns(currentRef.current);
    const sourceIndex = columns[source].findIndex(
      (task) => task.id === activeId,
    );
    if (sourceIndex < 0) return;
    if (source === target) {
      const overIndex = ['TODO', 'IN_PROGRESS', 'DONE'].includes(overId)
        ? columns[target].length - 1
        : columns[target].findIndex((task) => task.id === overId);
      if (overIndex < 0 || sourceIndex === overIndex) return;
      columns[source] = arrayMove(columns[source], sourceIndex, overIndex);
    } else {
      const [task] = columns[source].splice(sourceIndex, 1);
      const overIndex = columns[target].findIndex((item) => item.id === overId);
      columns[target].splice(
        overIndex < 0 ? columns[target].length : overIndex,
        0,
        { ...task, status: target },
      );
    }
    const next = tasksFromTaskBoardColumns(columns);
    currentRef.current = next;
    setTasks(next);
  }
  function dragEnd(event: DragEndEvent) {
    if (
      snapshotRef.current &&
      (!event.over ||
        sameTaskBoardOrder(snapshotRef.current, currentRef.current))
    ) {
      setTasks(snapshotRef.current);
      currentRef.current = snapshotRef.current;
    }
    snapshotRef.current = null;
    setActiveTaskId('');
  }
  function dragCancel(_event: DragCancelEvent) {
    if (snapshotRef.current) {
      setTasks(snapshotRef.current);
      currentRef.current = snapshotRef.current;
    }
    snapshotRef.current = null;
    setActiveTaskId('');
  }
  function moveTask(task: TaskBoardTask, status: TaskBoardTask['status']) {
    setTasks((current) => {
      const next = current.map((item) =>
        item.id === task.id ? { ...item, status } : item,
      );
      currentRef.current = next;
      return next;
    });
  }
  return (
    <TaskBoardKanbanView
      dndContextId={MARKETING_TASK_BOARD_DND_ID}
      tasks={tasks}
      members={members}
      locale={lang === 'fr' ? 'fr-FR' : 'en-US'}
      canManage
      moving={false}
      activeTask={activeTask}
      onDragStart={dragStart}
      onDragOver={dragOver}
      onDragEnd={dragEnd}
      onDragCancel={dragCancel}
      onEdit={() => undefined}
      onComments={() => undefined}
      onMove={moveTask}
      t={t}
    />
  );
}

function AutomationPreview() {
  const { lang, t } = useI18n();
  const copy = t.landing.productOperations.automation;
  const [positions, setPositions] = useState<
    Record<string, AutomationCanvasPosition>
  >(() => ({
    due: { x: 86, y: 380 },
    overdue: { x: 436, y: 380 },
    checklist: { x: 786, y: 380 },
  }));
  const [structural, setStructural] = useState<
    Record<string, AutomationCanvasPosition>
  >(() => ({
    root: { x: 450, y: 32 },
    due: { x: 74, y: 190 },
    overdue: { x: 424, y: 190 },
    checklist: { x: 774, y: 190 },
  }));
  const [openRecipientsId, setOpenRecipientsId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  const recipient = {
    id: 'preview-alex',
    name: 'Alex Morgan',
    sourceLabel: lang === 'fr' ? 'Responsable' : 'Assignee',
    dicebearStyle: 'initials',
    dicebearSeed: 'Alex Morgan',
  };
  const inertActions = [
    {
      label: t.admin.automationEditRule,
      action: () => undefined,
      disabled: true,
    },
    {
      label: t.admin.automationViewRuns,
      action: () => undefined,
      disabled: true,
    },
  ];
  const node = (
    id: string,
    type: string,
    label: string,
    status: 'success' | 'skipped' | 'pending',
    lastRunAt: string,
    recipients: boolean,
  ): AutomationCanvasNode => ({
    id,
    type,
    label,
    lastRunAt,
    lastRunStatus:
      status === 'success'
        ? 'SUCCESS'
        : status === 'skipped'
          ? 'SKIPPED'
          : null,
    notificationRule: recipients,
    recipients: recipients ? [recipient] : [],
    actions: inertActions,
    status:
      status === 'success'
        ? {
            label: copy.status.success,
            tone: 'border-accent/20 bg-accent/10 text-accent',
          }
        : status === 'skipped'
          ? {
              label: copy.status.skipped,
              tone: 'border-amber-200/15 bg-amber-300/[0.06] text-amber-100/75',
            }
          : {
              label: copy.status.pending,
              tone: 'border-white/10 bg-white/[0.04] text-white/45',
            },
  });
  const groups: AutomationCanvasGroup[] = [
    {
      key: 'due',
      type: 'DUE_BEFORE',
      label: copy.beforeDue,
      nodes: [
        node(
          'due',
          'DUE_BEFORE',
          copy.beforeDueInstance,
          'success',
          '2026-07-18T08:00:00.000Z',
          true,
        ),
      ],
      enabled: 1,
      executed: 1,
      issueCount: 0,
    },
    {
      key: 'overdue',
      type: 'OVERDUE',
      label: copy.overdue,
      nodes: [
        node(
          'overdue',
          'OVERDUE',
          copy.overdueInstance,
          'skipped',
          '2026-07-19T09:30:00.000Z',
          true,
        ),
      ],
      enabled: 1,
      executed: 0,
      issueCount: 0,
    },
    {
      key: 'checklist',
      type: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE',
      label: copy.checklist,
      nodes: [
        node(
          'checklist',
          'AUTO_COMPLETE_WHEN_CHECKLIST_DONE',
          copy.checklistInstance,
          'pending',
          '2026-07-20T11:15:00.000Z',
          false,
        ),
      ],
      enabled: 1,
      executed: 0,
      issueCount: 0,
    },
  ];
  function beginDrag(
    event: ReactPointerEvent,
    start: AutomationCanvasPosition,
    update: (position: AutomationCanvasPosition) => void,
    minY: number,
    nodeWidth: number,
  ) {
    event.preventDefault();
    cleanupRef.current?.();
    const origin = { x: event.clientX, y: event.clientY };
    const move = (next: PointerEvent) =>
      update({
        x: Math.round(
          Math.min(
            1120 - nodeWidth,
            Math.max(16, start.x + next.clientX - origin.x),
          ),
        ),
        y: Math.round(
          Math.min(690, Math.max(minY, start.y + next.clientY - origin.y)),
        ),
      });
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cleanup);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cleanup, { once: true });
  }
  return (
    <AutomationCanvasView
      width={1120}
      height={720}
      boardName={copy.board}
      groups={groups}
      positions={positions}
      rootPosition={structural.root}
      groupPositions={{
        due: structural.due,
        overdue: structural.overdue,
        checklist: structural.checklist,
      }}
      labels={{
        rootKind: copy.rootKind,
        rules: t.admin.automationRules,
        instances: copy.instances,
        validationIssues: copy.validationIssues,
        executedProgress: copy.executed,
        moveNode: copy.moveNode,
        recipients: copy.recipients,
        noRecipients: copy.noRecipients,
        viewRecipients: copy.viewRecipients,
        hideRecipients: copy.hideRecipients,
        actions: t.common.actions,
      }}
      locale={lang === 'fr' ? 'fr-FR' : 'en-US'}
      canMove
      openRecipientsId={openRecipientsId}
      openMenuId={openMenuId}
      onRootPointerDown={(event) =>
        beginDrag(
          event,
          structural.root,
          (position) =>
            setStructural((current) => ({ ...current, root: position })),
          16,
          320,
        )
      }
      onGroupPointerDown={(event, group) =>
        beginDrag(
          event,
          structural[group.key],
          (position) =>
            setStructural((current) => ({ ...current, [group.key]: position })),
          150,
          272,
        )
      }
      onNodePointerDown={(event, current) =>
        beginDrag(
          event,
          positions[current.id],
          (position) =>
            setPositions((value) => ({ ...value, [current.id]: position })),
          300,
          248,
        )
      }
      onRecipientsToggle={(current) => {
        setOpenMenuId(null);
        setOpenRecipientsId((value) =>
          value === current.id ? null : current.id,
        );
      }}
      onMenuToggle={(current) => {
        setOpenRecipientsId(null);
        setOpenMenuId((value) => (value === current.id ? null : current.id));
      }}
    />
  );
}

function EmailOperationsPreview() {
  const { lang, t } = useI18n();
  const copy = t.landing.productOperations.email;
  const [range, setRange] = useState<EmailTrendRange>('30d');
  const status = copy.statuses;
  const campaignData: CampaignStatusPoint[] = [
    { status: status.canceled, count: 14 },
    { status: status.queued, count: 38 },
    { status: status.partial, count: 22 },
    { status: status.failed, count: 31 },
    { status: status.sending, count: 17 },
    { status: status.sent, count: 428 },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DeliveryStatusDistributionLineCard
          emptyText={copy.noData}
          lang={lang}
          title={copy.delivery}
          totals={[
            {
              key: 'failed',
              label: status.failed,
              value: 3550,
              color: '#fb7185',
            },
            { key: 'sent', label: status.sent, value: 10000, color: '#5ed29c' },
          ]}
          trendData={deliveryStatusTrendData}
          timeZone="UTC"
        />
        <CampaignsByStatusRadarCard
          data={campaignData}
          emptyText={copy.noData}
          lang={lang}
          title={copy.campaigns}
        />
      </div>
      <RecentDeliveryTrendAreaChart
        data={emailTrendPreviewData[range]}
        emptyText={copy.noData}
        lang={lang}
        timeRange={range}
        onTimeRangeChange={setRange}
        title={copy.trend}
        timeZone="UTC"
      />
    </div>
  );
}

const previewMembers: TaskBoardMember[] = COMMUNITY_IDENTITY_MEMBERS.map(
  (identity) => ({
    status: 'ACTIVE',
    user: {
      id: identity.id,
      name: identity.name,
      email: `${identity.id}@example.test`,
    },
    profile: { dicebearStyle: 'notionists', dicebearSeed: identity.avatarSeed },
  }),
);

function previewAssignee(id: string) {
  const identity = COMMUNITY_IDENTITY_MEMBERS.find(
    (member) => member.id === id,
  );
  if (!identity) throw new Error(`Unknown marketing identity: ${id}`);
  return {
    id: identity.id,
    name: identity.name,
    email: `${identity.id}@example.test`,
  };
}

function createTasks(
  copy: ReturnType<
    typeof useI18n
  >['t']['landing']['productOperations']['tasks'],
): TaskBoardTask[] {
  return [
    {
      id: 'venue',
      ...copy.venue,
      status: 'TODO',
      priority: 'HIGH',
      dueDate: '2026-08-14T09:00:00.000Z',
      dueState: 'due-soon',
      sortOrder: 0,
      assignees: [previewAssignee('sample-owner')],
      checklistProgress: { completed: 1, total: 4 },
    },
    {
      id: 'speakers',
      ...copy.speakers,
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: '2026-08-18T09:00:00.000Z',
      dueState: null,
      sortOrder: 1,
      assignees: [previewAssignee('daniel-okafor')],
      checklistProgress: { completed: 2, total: 5 },
    },
    {
      id: 'announcement',
      ...copy.announcement,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: '2026-08-10T09:00:00.000Z',
      dueState: 'overdue',
      sortOrder: 0,
      assignees: [
        previewAssignee('sample-owner'),
        previewAssignee('daniel-okafor'),
        previewAssignee('amour-m'),
        previewAssignee('noah-kim'),
      ],
      checklistProgress: { completed: 3, total: 6 },
    },
    {
      id: 'schedule',
      ...copy.schedule,
      status: 'DONE',
      priority: 'MEDIUM',
      dueDate: '2026-08-04T09:00:00.000Z',
      dueState: null,
      sortOrder: 0,
      assignees: [previewAssignee('amara-nsimba')],
      checklistProgress: { completed: 4, total: 4 },
    },
    {
      id: 'registrations',
      ...copy.registrations,
      status: 'DONE',
      priority: 'LOW',
      dueDate: '2026-08-06T09:00:00.000Z',
      dueState: null,
      sortOrder: 1,
      assignees: [previewAssignee('sara-ndinga')],
      checklistProgress: { completed: 2, total: 2 },
    },
  ];
}

const deliveryStatusTrendData: DeliveryTrendPoint[] = [
  { label: 'Apr 1', date: '2026-04-01T00:00:00.000Z', sent: 190, failed: 70 },
  { label: 'Apr 8', date: '2026-04-08T00:00:00.000Z', sent: 780, failed: 185 },
  { label: 'Apr 15', date: '2026-04-15T00:00:00.000Z', sent: 310, failed: 190 },
  { label: 'Apr 22', date: '2026-04-22T00:00:00.000Z', sent: 940, failed: 445 },
  { label: 'Apr 29', date: '2026-04-29T00:00:00.000Z', sent: 590, failed: 180 },
  { label: 'May 6', date: '2026-05-06T00:00:00.000Z', sent: 560, failed: 295 },
  { label: 'May 13', date: '2026-05-13T00:00:00.000Z', sent: 900, failed: 400 },
  { label: 'May 20', date: '2026-05-20T00:00:00.000Z', sent: 270, failed: 15 },
  { label: 'May 27', date: '2026-05-27T00:00:00.000Z', sent: 1020, failed: 90 },
  { label: 'Jun 3', date: '2026-06-03T00:00:00.000Z', sent: 280, failed: 230 },
  {
    label: 'Jun 10',
    date: '2026-06-10T00:00:00.000Z',
    sent: 1510,
    failed: 875,
  },
  {
    label: 'Jun 17',
    date: '2026-06-17T00:00:00.000Z',
    sent: 2720,
    failed: 575,
  },
];

const emailTrendPreviewData: Record<EmailTrendRange, DeliveryTrendPoint[]> = {
  '7d': [
    { label: 'Jun 11', date: '2026-06-11T00:00:00.000Z', sent: 28, failed: 88 },
    {
      label: 'Jun 12',
      date: '2026-06-12T00:00:00.000Z',
      sent: 142,
      failed: 121,
    },
    {
      label: 'Jun 13',
      date: '2026-06-13T00:00:00.000Z',
      sent: 336,
      failed: 97,
    },
    {
      label: 'Jun 14',
      date: '2026-06-14T00:00:00.000Z',
      sent: 55,
      failed: 113,
    },
    {
      label: 'Jun 15',
      date: '2026-06-15T00:00:00.000Z',
      sent: 1149,
      failed: 399,
    },
    {
      label: 'Jun 16',
      date: '2026-06-16T00:00:00.000Z',
      sent: 68,
      failed: 100,
    },
    { label: 'Jun 17', date: '2026-06-17T00:00:00.000Z', sent: 972, failed: 6 },
  ],
  '30d': [
    {
      label: 'May 19',
      date: '2026-05-19T00:00:00.000Z',
      sent: 310,
      failed: 97,
    },
    {
      label: 'May 22',
      date: '2026-05-22T00:00:00.000Z',
      sent: 352,
      failed: 81,
    },
    {
      label: 'May 25',
      date: '2026-05-25T00:00:00.000Z',
      sent: 38,
      failed: 324,
    },
    {
      label: 'May 28',
      date: '2026-05-28T00:00:00.000Z',
      sent: 476,
      failed: 229,
    },
    { label: 'May 31', date: '2026-05-31T00:00:00.000Z', sent: 65, failed: 26 },
    {
      label: 'Jun 3',
      date: '2026-06-03T00:00:00.000Z',
      sent: 801,
      failed: 334,
    },
    { label: 'Jun 6', date: '2026-06-06T00:00:00.000Z', sent: 789, failed: 21 },
    { label: 'Jun 9', date: '2026-06-09T00:00:00.000Z', sent: 427, failed: 75 },
    {
      label: 'Jun 12',
      date: '2026-06-12T00:00:00.000Z',
      sent: 514,
      failed: 130,
    },
    {
      label: 'Jun 17',
      date: '2026-06-17T00:00:00.000Z',
      sent: 648,
      failed: 293,
    },
  ],
  '90d': deliveryStatusTrendData,
};
