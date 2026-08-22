import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const boardPageUrl = new URL('../app/admin/task-boards/[boardId]/page.tsx', import.meta.url);
const automationUrl = new URL('./task-board-automation.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('task board lifecycle UI keeps execution state visible and confirmed', async () => {
  const [boardPage, automation, i18n] = await Promise.all([
    readFile(boardPageUrl, 'utf8'),
    readFile(automationUrl, 'utf8'),
    readFile(i18nUrl, 'utf8'),
  ]);

  assert.match(boardPage, /body: JSON\.stringify\(\{ status: lifecycleTarget \}\)/);
  assert.match(boardPage, /<ConfirmDialog/);
  assert.match(boardPage, /taskBoardEventEndedAutomationStopped/);
  assert.match(boardPage, /text-\[var\(--app-warning-foreground\)\] dark:text-amber-100\/65/);
  assert.match(automation, /automationStoppedEventEnded/);
  assert.match(automation, /automationStoppedBoardPaused/);
  assert.match(automation, /automationStoppedBoardCompleted/);
  assert.match(automation, /automationStatusStopped/);
  assert.match(automation, /border-\[var\(--app-warning-border\)\] bg-\[var\(--app-warning-soft\)\]/);
  assert.match(automation, /text-\[var\(--app-warning-foreground\)\]/);
  assert.match(automation, /dark:border-amber-200\/10 dark:bg-amber-300\/\[0\.035\] dark:text-amber-100\/65/);
  assert.match(automation, /<AlertTriangle className="mt-0\.5 shrink-0"/);
  assert.match(i18n, /taskBoardEventEndedAutomationStopped: 'Event ended\. Automation stopped\.'/);
  assert.match(i18n, /automationStoppedEventEnded: 'Automation is stopped because the linked event has ended\.'/);
  assert.match(i18n, /taskBoardEventEndedAutomationStopped: 'Événement terminé\. Automatisations arrêtées\.'/);
  assert.match(i18n, /automationStoppedEventEnded: 'Les automatisations sont arrêtées, car l’événement lié est terminé\.'/);

  for (const key of [
    'pauseTaskBoardQuestion',
    'completeTaskBoardQuestion',
    'reopenTaskBoardQuestion',
    'automationStoppedEventEnded',
    'automationStoppedBoardPaused',
    'automationStoppedBoardCompleted',
  ]) {
    assert.equal(i18n.match(new RegExp(`${key}:`, 'g'))?.length, 2, `${key} must exist in EN and FR`);
  }
});
