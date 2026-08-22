import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { countdownParts, parseSessionActivityMessage, sessionDeadline } from './session-activity';

const providerUrl = new URL('../components/auth/session-activity-provider.tsx', import.meta.url);
const dialogUrl = new URL('../components/auth/session-expiry-dialog.tsx', import.meta.url);
const adminLayoutUrl = new URL('../app/admin/layout.tsx', import.meta.url);
const dashboardLayoutUrl = new URL('../app/dashboard/layout.tsx', import.meta.url);

test('countdown and deadline calculations derive from wall-clock timestamps', () => {
  assert.equal(sessionDeadline(2_000, 3_000), 2_000);
  assert.deepEqual(countdownParts(299), { minutes: 4, seconds: 59, text: '4:59' });
  assert.equal(countdownParts(-4).text, '0:00');
});

test('cross-tab messages accept only safe deadline and transition fields', () => {
  const message = parseSessionActivityMessage({
    type: 'renewed',
    idleExpiresAt: 2_000,
    absoluteExpiresAt: 3_000,
    serverNow: 1_000,
    at: 1_000,
    token: 'must-not-survive',
    user: { id: 'must-not-survive' },
  });
  assert.deepEqual(message, { type: 'renewed', idleExpiresAt: 2_000, absoluteExpiresAt: 3_000, serverNow: 1_000, at: 1_000 });
  assert.equal(parseSessionActivityMessage({ type: 'activity', token: 'secret' }), null);
});

test('provider is mounted only at Admin and Member authenticated layout boundaries', async () => {
  const [adminLayout, dashboardLayout] = await Promise.all([
    readFile(adminLayoutUrl, 'utf8'),
    readFile(dashboardLayoutUrl, 'utf8'),
  ]);
  assert.equal((adminLayout.match(/<SessionActivityProvider>/g) ?? []).length, 1);
  assert.equal((dashboardLayout.match(/<SessionActivityProvider>/g) ?? []).length, 1);
});

test('provider listens for trusted interaction, throttles renewal, and handles hidden tabs', async () => {
  const provider = await readFile(providerUrl, 'utf8');
  for (const eventName of ['pointerdown', 'pointermove', 'scroll', 'wheel', 'touchstart', 'keydown']) {
    assert.match(provider, new RegExp(`['"]${eventName}['"]`));
  }
  assert.match(provider, /!event\.isTrusted/);
  assert.match(provider, /LOCAL_ACTIVITY_THROTTLE_MS/);
  assert.match(provider, /SERVER_ACTIVITY_THROTTLE_MS/);
  assert.match(provider, /document\.visibilityState !== 'visible'/);
  assert.match(provider, /visibilitychange/);
  assert.match(provider, /BroadcastChannel/);
  assert.match(provider, /SESSION_ACTIVITY_STORAGE_KEY/);
  assert.doesNotMatch(provider, /setInterval\([^)]*renew|refreshToken|accessToken|password/);
});

test('warning is a blocking alert dialog with focus handling and an explicit action', async () => {
  const dialog = await readFile(dialogUrl, 'utf8');
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.preventDefault\(\)/);
  assert.match(dialog, /event\.key !== 'Tab'/);
  assert.match(dialog, /LoadingButton/);
  assert.match(dialog, /aria-live="polite"/);
  assert.doesNotMatch(dialog, /onClose|closeLabel/);
});
