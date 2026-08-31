import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('shared confirmations portal a viewport overlay above drawers and below session expiry', async () => {
  const [dialog, shellPresentation, collaborationDrawer, sessionExpiry] = await Promise.all([
    readFile(new URL('./ui.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./dashboard-shell-presentation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./event-task-collaboration-drawer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./auth/session-expiry-dialog.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(dialog, /import \{ createPortal \} from 'react-dom'/);
  assert.match(dialog, /data-confirm-dialog-root className="fixed inset-0 z-\[260\] grid h-dvh place-items-center p-4"/);
  assert.match(dialog, /data-confirm-dialog-overlay[\s\S]*fixed inset-0 z-0 bg-\[var\(--app-overlay\)\]/);
  assert.match(dialog, /role="dialog" aria-modal="true"[\s\S]*className="relative z-10/);
  assert.match(dialog, /previousFocusRef\.current = document\.activeElement/);
  assert.match(dialog, /previousFocusRef\.current\?\.focus\(\)/);
  assert.match(dialog, /document\.body/);
  assert.match(shellPresentation, /<header className="sticky top-0 z-20/);
  assert.match(collaborationDrawer, /fixed inset-0 z-\[120\]/);
  assert.match(collaborationDrawer, /event\.key === 'Escape' && !event\.defaultPrevented/);
  assert.match(sessionExpiry, /fixed inset-0 z-\[300\]/);
});

test('member suspend and reactivate confirmations use the shared modal primitive', async () => {
  const members = await readFile(new URL('../app/admin/members/[id]/page.tsx', import.meta.url), 'utf8');

  assert.match(members, /useState<'suspend' \| 'reactivate' \| 'remove' \| null>/);
  assert.match(members, /setConfirming\('suspend'\)/);
  assert.match(members, /setConfirming\('reactivate'\)/);
  assert.match(members, /<ConfirmDialog open=\{Boolean\(confirming\)\}/);
  assert.doesNotMatch(members, /fixed inset-0[^\n]*Reactivate member/);
});

test('representative authenticated confirmations share the corrected portal', async () => {
  const sources = await Promise.all([
    '../app/admin/registrations/page.tsx',
    '../app/admin/events/[id]/page.tsx',
    '../app/admin/task-boards/[boardId]/page.tsx',
    '../app/dashboard/settings/page.tsx',
    './profile-social-links.tsx',
    './chat-workspace.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

  for (const source of sources) assert.match(source, /<ConfirmDialog/);
});
