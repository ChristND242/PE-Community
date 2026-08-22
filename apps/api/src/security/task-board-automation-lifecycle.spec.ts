import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateAutomationExecution } from '@pe/shared';

const controllerUrl = new URL('../admin/admin.controller.ts', import.meta.url);
const serviceUrl = new URL('../admin/admin.service.ts', import.meta.url);
const collaborationUrl = new URL('../event-tasks-realtime/event-task-collaboration.service.ts', import.meta.url);

test('event end uses an exact UTC boundary and independent boards remain eligible', () => {
  const eventStartsAt = new Date('2026-08-08T10:00:00.000Z');
  const active = { boardStatus: 'ACTIVE' as const, ruleEnabled: true };
  assert.deepEqual(evaluateAutomationExecution({ ...active, eventStartsAt }, new Date('2026-08-08T09:59:59.999Z')), { eligible: true });
  assert.deepEqual(evaluateAutomationExecution({ ...active, eventStartsAt }, eventStartsAt), { eligible: false, reason: 'EVENT_ENDED' });
  assert.deepEqual(evaluateAutomationExecution(active, new Date('2030-01-01T00:00:00.000Z')), { eligible: true });
});

test('all terminal lifecycle states suppress execution with structured reasons', () => {
  const active = { boardStatus: 'ACTIVE' as const, ruleEnabled: true };
  assert.deepEqual(evaluateAutomationExecution({ ...active, boardStatus: 'PAUSED' }), { eligible: false, reason: 'BOARD_PAUSED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, boardStatus: 'COMPLETED' }), { eligible: false, reason: 'BOARD_COMPLETED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, boardArchivedAt: new Date() }), { eligible: false, reason: 'BOARD_ARCHIVED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, ruleEnabled: false }), { eligible: false, reason: 'AUTOMATION_PAUSED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, ruleArchivedAt: new Date() }), { eligible: false, reason: 'AUTOMATION_ARCHIVED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, taskStatus: 'DONE' }), { eligible: false, reason: 'TASK_COMPLETED' });
  assert.deepEqual(evaluateAutomationExecution({ ...active, taskArchivedAt: new Date() }), { eligible: false, reason: 'TASK_ARCHIVED' });
});

test('board lifecycle route keeps existing RBAC and transitions are audited', async () => {
  const [controller, service] = await Promise.all([readFile(controllerUrl, 'utf8'), readFile(serviceUrl, 'utf8')]);
  const route = controller.slice(controller.indexOf("@Patch('task-boards/:boardId/status')"), controller.indexOf("@Delete('task-boards/:boardId')"));
  const lifecycle = service.slice(service.indexOf('async updateTaskBoardStatus'), service.indexOf('async archiveTaskBoard'));
  assert.match(route, /PERMISSIONS\.eventsUpdate/);
  assert.match(lifecycle, /ACTIVE: \[TaskBoardStatus\.PAUSED, TaskBoardStatus\.COMPLETED\]/);
  assert.match(lifecycle, /PAUSED: \[TaskBoardStatus\.ACTIVE, TaskBoardStatus\.COMPLETED\]/);
  assert.match(lifecycle, /COMPLETED: \[TaskBoardStatus\.ACTIVE\]/);
  for (const action of ['task.board.paused', 'task.board.resumed', 'task.board.completed', 'task.board.reopened']) assert.match(lifecycle, new RegExp(action.replaceAll('.', '\\.')));
  assert.match(lifecycle, /previousStatus/);
  assert.match(lifecycle, /newStatus/);
});

test('retry, dry run, test delivery, and checklist mutation use the shared execution gate', async () => {
  const [service, collaboration] = await Promise.all([readFile(serviceUrl, 'utf8'), readFile(collaborationUrl, 'utf8')]);
  assert.match(service, /async retryTaskBoardAutomationRun[\s\S]*automationExecutionDecision/);
  assert.match(service, /async testTaskBoardAutomationRule[\s\S]*automationExecutionDecision/);
  assert.match(service, /async testTaskBoardAutomationNotification[\s\S]*automationExecutionDecision/);
  assert.match(service, /summary: 'lifecycle_suppressed'/);
  assert.match(collaboration, /evaluateAutomationExecution/);
  assert.match(collaboration, /summary: 'lifecycle_suppressed'/);
});

test('event deletion archives linked boards before deleting the event', async () => {
  const service = await readFile(serviceUrl, 'utf8');
  const deletion = service.slice(service.indexOf('async deleteEvent'), service.indexOf('async eventRsvps'));
  const archiveIndex = deletion.indexOf('taskBoard.updateMany');
  const deleteIndex = deletion.indexOf('await tx.event.delete');
  assert.ok(archiveIndex >= 0);
  assert.ok(deleteIndex > archiveIndex);
  assert.match(deletion, /archivedAt: new Date\(\)/);
});
