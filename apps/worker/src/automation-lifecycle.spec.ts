import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateAutomationExecution } from '@pe/shared';
import { loadAutomationExecutionDecision } from './automation-lifecycle.js';

const beforeEnd = new Date('2026-08-08T09:59:59.999Z');
const atEnd = new Date('2026-08-08T10:00:00.000Z');
const eventStartsAt = new Date('2026-08-08T10:00:00.000Z');
const active = { boardStatus: 'ACTIVE' as const, ruleEnabled: true };

test('shared lifecycle policy covers board, event, rule, and task boundaries', () => {
  assert.deepEqual(evaluateAutomationExecution(active, beforeEnd), { eligible: true });
  assert.deepEqual(evaluateAutomationExecution({ ...active, eventStartsAt }, beforeEnd), { eligible: true });
  assert.deepEqual(evaluateAutomationExecution({ ...active, eventStartsAt }, atEnd), { eligible: false, reason: 'EVENT_ENDED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, eventStartsAt }, new Date(atEnd.getTime() + 1)), { eligible: false, reason: 'EVENT_ENDED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, boardStatus: 'PAUSED' }, beforeEnd), { eligible: false, reason: 'BOARD_PAUSED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, boardStatus: 'COMPLETED' }, beforeEnd), { eligible: false, reason: 'BOARD_COMPLETED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, boardArchivedAt: atEnd }, beforeEnd), { eligible: false, reason: 'BOARD_ARCHIVED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, ruleEnabled: false }, beforeEnd), { eligible: false, reason: 'AUTOMATION_PAUSED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, ruleArchivedAt: atEnd }, beforeEnd), { eligible: false, reason: 'AUTOMATION_ARCHIVED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, taskStatus: 'DONE' }, beforeEnd), { eligible: false, reason: 'TASK_COMPLETED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, taskArchivedAt: atEnd }, beforeEnd), { eligible: false, reason: 'TASK_ARCHIVED' });
  assert.deepEqual(evaluateAutomationExecution(active, atEnd), { eligible: true });
});

test('worker reloads authoritative state instead of trusting stale job data', async () => {
  let queried = false;
  const prisma = {
    eventTask: {
      findFirst: async () => {
        queried = true;
        return {
          status: 'TODO',
          archivedAt: null,
          dueDate: new Date('2026-08-08T11:00:00.000Z'),
          createdAt: beforeEnd,
          updatedAt: beforeEnd,
          assignees: [],
          checklistItems: [],
          activities: [],
          comments: [],
          attachments: [],
          event: { startsAt: eventStartsAt },
          taskBoard: { status: 'ACTIVE', archivedAt: null, automationRules: [{ enabled: true, archivedAt: null, type: 'OVERDUE_ESCALATION', config: { graceDays: 0 } }] },
        };
      },
    },
  };
  const decision = await loadAutomationExecutionDecision(prisma as never, {
    communityId: 'community-a', boardId: 'board-a', ruleId: 'rule-a', ruleType: 'OVERDUE_ESCALATION', ruleConfig: { graceDays: 0 }, taskId: 'task-a', now: atEnd,
  });
  assert.equal(queried, true);
  assert.deepEqual(decision, { eligible: false, reason: 'EVENT_ENDED' });
});

test('hourly reminder execution gates current state before delivery and does not create per-rule delayed jobs', async () => {
  const source = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
  const reminders = source.slice(source.indexOf('async function createEventTaskReminders'), source.indexOf('function automationTaskLastActivityAt'));
  const executionGate = reminders.indexOf('loadAutomationExecutionDecision');
  const firstDelivery = reminders.indexOf('prisma.notification.createMany');
  assert.ok(executionGate >= 0);
  assert.ok(firstDelivery > executionGate);
  assert.ok((reminders.match(/loadAutomationExecutionDecision/g)?.length ?? 0) >= 2);
  assert.match(source, /event-task-reminders-hourly/);
  assert.doesNotMatch(reminders, /delay:/);
});
