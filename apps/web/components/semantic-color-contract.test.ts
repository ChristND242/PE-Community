import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const file = (path: string) => new URL(path, import.meta.url);

test('shared semantic states own appearance-specific colors', async () => {
  const [styles, ui] = await Promise.all([
    readFile(file('../app/globals.css'), 'utf8'),
    readFile(file('./ui.tsx'), 'utf8'),
  ]);

  for (const state of ['success', 'warning', 'danger', 'info', 'neutral']) {
    assert.match(styles, new RegExp(`\\.app-status-${state}`));
  }
  assert.match(ui, /good: 'app-status-success'/);
  assert.match(ui, /warn: 'app-status-warning'/);
  assert.match(ui, /bad: 'app-status-danger'/);
  assert.match(ui, /neutral: 'app-status-neutral'/);
});

test('known low-contrast surfaces use the semantic contract', async () => {
  const [chat, automation, registrations, streaks] = await Promise.all([
    readFile(file('./chat-workspace.tsx'), 'utf8'),
    readFile(file('./task-board-automation.tsx'), 'utf8'),
    readFile(file('../app/admin/registrations/page.tsx'), 'utf8'),
    readFile(file('../app/admin/streaks/page.tsx'), 'utf8'),
  ]);

  assert.match(chat, /app-file-input/);
  assert.match(chat, /app-callout-warning/);
  assert.match(automation, /automationStatusStopped, tone: 'app-status-warning'/);
  assert.match(registrations, /app-text-warning[\s\S]{0,160}notificationSuppressed/);
  assert.match(streaks, /streakActiveToday[\s\S]*tone: 'app-status-warning'/);
});
