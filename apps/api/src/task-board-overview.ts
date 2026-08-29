import { EventTaskStatus } from '@prisma/client';

type OverviewTask = {
  id: string;
  title: string;
  status: EventTaskStatus;
  dueDate: Date | null;
  assignees: Array<{
    userId: string;
    user: {
      id: string;
      name: string;
    memberships?: Array<{
      role?: { key: string } | null;
      profile?: {
        avatarUrl?: string | null;
        dicebearStyle?: string | null;
        dicebearSeed?: string | null;
      } | null;
    }>;
    };
  }>;
  checklistItems: Array<{ isCompleted: boolean }>;
  _count: { comments: number; attachments: number; activities: number };
};

export function buildTaskBoardOverview(
  tasks: OverviewTask[],
  options: { currentUserId?: string; includeUnassignedBlockers?: boolean } = {},
) {
  const now = new Date();
  const dueSoonAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const total = tasks.length;
  const todo = tasks.filter(
    (task) => task.status === EventTaskStatus.TODO,
  ).length;
  const inProgress = tasks.filter(
    (task) => task.status === EventTaskStatus.IN_PROGRESS,
  ).length;
  const done = tasks.filter(
    (task) => task.status === EventTaskStatus.DONE,
  ).length;
  const overdueTasks = tasks.filter(
    (task) =>
      task.status !== EventTaskStatus.DONE &&
      task.dueDate &&
      task.dueDate < now,
  );
  const dueSoonTasks = tasks.filter(
    (task) =>
      task.status !== EventTaskStatus.DONE &&
      task.dueDate &&
      task.dueDate >= now &&
      task.dueDate <= dueSoonAt,
  );
  const unassignedTasks = tasks.filter((task) => task.assignees.length === 0);
  const checklistTotal = tasks.reduce(
    (sum, task) => sum + task.checklistItems.length,
    0,
  );
  const checklistCompleted = tasks.reduce(
    (sum, task) =>
      sum + task.checklistItems.filter((item) => item.isCompleted).length,
    0,
  );
  const checklistPercent = checklistTotal
    ? Math.round((checklistCompleted / checklistTotal) * 100)
    : 100;
  const assignedRatio = total ? (total - unassignedTasks.length) / total : 0;
  const rawScore = total
    ? (done / total) * 55 +
      (checklistPercent / 100) * 25 +
      assignedRatio * 20 -
      overdueTasks.length * 8
    : 0;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const label =
    score >= 95 && overdueTasks.length === 0
      ? 'COMPLETE'
      : overdueTasks.length > 0 || score < 45
        ? 'AT_RISK'
        : score >= 75
          ? 'ON_TRACK'
          : 'NEEDS_ATTENTION';

  const assigneeMap = new Map<
    string,
    {
      id: string;
      name: string;
      avatarUrl: string | null;
      dicebearStyle: string | null;
      dicebearSeed: string | null;
      role: string | null;
      totalTasks: number;
      doneTasks: number;
      overdueTasks: number;
    }
  >();
  tasks.forEach((task) => {
    task.assignees.forEach(({ user }) => {
    const profile = user.memberships?.[0]?.profile;
    const current = assigneeMap.get(user.id) ?? {
      id: user.id,
      name: user.name,
      avatarUrl: profile?.avatarUrl ?? null,
      dicebearStyle: profile?.dicebearStyle ?? null,
      dicebearSeed: profile?.dicebearSeed ?? null,
      role: user.memberships?.[0]?.role?.key ?? null,
      totalTasks: 0,
      doneTasks: 0,
      overdueTasks: 0,
    };
    current.totalTasks += 1;
    if (task.status === EventTaskStatus.DONE) current.doneTasks += 1;
    if (overdueTasks.some((overdue) => overdue.id === task.id))
      current.overdueTasks += 1;
    assigneeMap.set(current.id, current);
    });
  });

  const blockers: Array<{
    type:
      | 'OVERDUE_TASK'
      | 'UNASSIGNED_TASK'
      | 'INCOMPLETE_CHECKLIST'
      | 'NO_TASKS'
      | 'DUE_SOON';
    taskId?: string;
    title: string;
    targetTab?: 'comments' | 'checklist';
  }> = [];
  if (!total) blockers.push({ type: 'NO_TASKS', title: '' });
  overdueTasks.forEach((task) =>
    blockers.push({
      type: 'OVERDUE_TASK',
      taskId: task.id,
      title: task.title,
      targetTab: 'comments',
    }),
  );
  dueSoonTasks.forEach((task) =>
    blockers.push({
      type: 'DUE_SOON',
      taskId: task.id,
      title: task.title,
      targetTab: 'comments',
    }),
  );
  if (options.includeUnassignedBlockers)
    unassignedTasks.forEach((task) =>
      blockers.push({
        type: 'UNASSIGNED_TASK',
        taskId: task.id,
        title: task.title,
        targetTab: 'comments',
      }),
    );
  tasks
    .filter((task) => task.checklistItems.some((item) => !item.isCompleted))
    .forEach((task) =>
      blockers.push({
        type: 'INCOMPLETE_CHECKLIST',
        taskId: task.id,
        title: task.title,
        targetTab: 'checklist',
      }),
    );
  if (options.currentUserId)
    blockers.sort(
      (left, right) =>
        Number(taskAssignedTo(right.taskId, tasks, options.currentUserId!)) -
        Number(taskAssignedTo(left.taskId, tasks, options.currentUserId!)),
    );

  return {
    readiness: { score, label },
    tasks: {
      total,
      todo,
      inProgress,
      done,
      overdue: overdueTasks.length,
      dueSoon: dueSoonTasks.length,
      unassigned: unassignedTasks.length,
      ...(options.currentUserId
        ? {
            assignedToMe: tasks.filter(
              (task) => task.assignees.some((assignment) => assignment.userId === options.currentUserId),
            ).length,
          }
        : {}),
    },
    checklist: {
      total: checklistTotal,
      completed: checklistCompleted,
      percent: checklistPercent,
    },
    collaboration: {
      comments: tasks.reduce((sum, task) => sum + task._count.comments, 0),
      attachments: tasks.reduce(
        (sum, task) => sum + task._count.attachments,
        0,
      ),
      recentActivity: tasks.reduce(
        (sum, task) => sum + task._count.activities,
        0,
      ),
    },
    assignees: Array.from(assigneeMap.values()).sort(
      (left, right) =>
        right.overdueTasks - left.overdueTasks ||
        right.totalTasks - left.totalTasks ||
        left.name.localeCompare(right.name),
    ),
    blockers: blockers.slice(0, 8),
  };
}

function taskAssignedTo(
  taskId: string | undefined,
  tasks: OverviewTask[],
  userId: string,
) {
  return Boolean(
    taskId &&
    tasks.some((task) => task.id === taskId && task.assignees.some((assignment) => assignment.userId === userId)),
  );
}
