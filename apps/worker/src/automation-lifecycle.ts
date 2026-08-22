import type { PrismaClient } from '@prisma/client';
import {
  evaluateAutomationExecution,
  type AutomationExecutionDecision,
} from '@pe/shared';

type LifecyclePrisma = Pick<PrismaClient, 'eventTask'>;

export async function loadAutomationExecutionDecision(
  prisma: LifecyclePrisma,
  input: {
    communityId: string;
    boardId: string | null;
    ruleId: string | null;
    ruleType: string;
    ruleConfig: Record<string, unknown>;
    taskId: string;
    now: Date;
  },
): Promise<AutomationExecutionDecision> {
  const task = await prisma.eventTask.findFirst({
    where: {
      id: input.taskId,
      communityId: input.communityId,
      ...(input.boardId ? { taskBoardId: input.boardId } : {}),
    },
    select: {
      status: true,
      archivedAt: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      assignees: { where: { archivedAt: null }, select: { user: { select: { memberships: { select: { communityId: true, status: true } } } } } },
      checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      event: { select: { startsAt: true } },
      taskBoard: {
        select: {
          status: true,
          archivedAt: true,
          automationRules: {
            where: input.ruleId ? { id: input.ruleId } : { id: { equals: '__default__' } },
            select: { enabled: true, archivedAt: true, type: true, config: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!task) return { eligible: false, reason: 'RULE_NO_LONGER_APPLICABLE' };
  const rule = task.taskBoard?.automationRules[0];
  if (input.ruleId && !rule) return { eligible: false, reason: 'RULE_NO_LONGER_APPLICABLE' };
  if (rule && (rule.type !== input.ruleType || JSON.stringify(rule.config) !== JSON.stringify(input.ruleConfig))) {
    return { eligible: false, reason: 'RULE_NO_LONGER_APPLICABLE' };
  }
  const config = (rule?.config ?? input.ruleConfig) as Record<string, unknown>;
  const lastActivityAt = [task.updatedAt, task.createdAt, task.activities[0]?.createdAt, task.comments[0]?.updatedAt, task.attachments[0]?.updatedAt, ...task.checklistItems.map((item) => item.updatedAt)].filter((value): value is Date => value instanceof Date).reduce((latest, value) => value > latest ? value : latest, task.createdAt);
  const activeAssigneeCount = task.assignees.filter((assignment) => assignment.user.memberships.some((membership) => membership.communityId === input.communityId && membership.status === 'ACTIVE')).length;
  const ruleApplicable = currentTaskMatchesRule(input.ruleType, config, { dueDate: task.dueDate, lastActivityAt, activeAssigneeCount, checklistItems: task.checklistItems }, input.now);
  return evaluateAutomationExecution({
    boardStatus: task.taskBoard?.status ?? 'ACTIVE',
    boardArchivedAt: task.taskBoard?.archivedAt,
    eventStartsAt: task.event.startsAt,
    ruleEnabled: rule?.enabled ?? true,
    ruleArchivedAt: rule?.archivedAt,
    taskStatus: task.status,
    taskArchivedAt: task.archivedAt,
    ruleApplicable,
  }, input.now);
}

function currentTaskMatchesRule(type: string, config: Record<string, unknown>, task: { dueDate: Date | null; lastActivityAt: Date; activeAssigneeCount: number; checklistItems: Array<{ isCompleted: boolean }> }, now: Date) {
  const nowMs = now.getTime();
  if (type === 'DUE_BEFORE') {
    const hours = Number(config.hoursBeforeDue);
    return task.activeAssigneeCount > 0 && Boolean(task.dueDate && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() - nowMs <= hours * 3_600_000);
  }
  if (type === 'OVERDUE') return task.activeAssigneeCount > 0 && Boolean(task.dueDate && task.dueDate.getTime() < nowMs);
  if (type === 'STALE_TASK_FOLLOW_UP') return task.activeAssigneeCount > 0 && task.lastActivityAt.getTime() <= nowMs - Number(config.inactiveDays) * 86_400_000;
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') {
    const hasChecklist = task.checklistItems.length > 0;
    const checklistEligible = config.requireChecklistItems === false || hasChecklist;
    const checklistIncomplete = hasChecklist ? task.checklistItems.some((item) => !item.isCompleted) : config.requireChecklistItems === false;
    return Boolean(task.dueDate && checklistEligible && checklistIncomplete && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() - nowMs <= Number(config.hoursBeforeDue) * 3_600_000);
  }
  if (type === 'OVERDUE_ESCALATION') return Boolean(task.dueDate && task.dueDate.getTime() <= nowMs - Number(config.graceDays) * 86_400_000);
  return false;
}
