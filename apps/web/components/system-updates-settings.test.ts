import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('system update UI keeps execution behind step-up and confirmation', async () => {
  const source = await readFile(
    new URL('./system-updates-settings.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /stepUp\.run\(\(\) => apiFetch\(`\/admin\/\$\{COMMUNITY_ID\}\/system-updates\/authorize/,
  );
  assert.match(source, /setConfirmOpen\(true\)/);
  assert.match(source, /idempotencyKey: crypto\.randomUUID\(\)/);
  assert.match(source, /<ConfirmDialog/);
});

test('history, realtime logs, and update badge remain permission and state scoped', async () => {
  const [settings, badge, socket, shell, settingsPage] = await Promise.all([
    readFile(new URL('./system-updates-settings.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../hooks/use-system-update-badge.ts', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../hooks/use-system-update-socket.ts', import.meta.url),
      'utf8',
    ),
    readFile(new URL('./shell.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL('../app/admin/settings/page.tsx', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(settings, /overview\.canViewHistory/);
  assert.match(settings, /lastSequenceRef/);
  assert.match(settings, /terminalNotifiedRef/);
  assert.match(badge, /status === 'UPDATE_AVAILABLE' \? 1 : 0/);
  assert.doesNotMatch(badge, /NO_RELEASE_AVAILABLE.*\? 1|CHECK_FAILED.*\? 1/);
  assert.match(socket, /system:update:subscribe/);
  assert.match(socket, /after: afterRef\.current/);
  assert.match(shell, /user\?\.role === 'owner'/);
  assert.match(settingsPage, /currentUser\?\.role === 'owner'/);
});

test('empty release catalogs and development builds have calm non-installable UI states', async () => {
  const [settings, copy] = await Promise.all([
    readFile(new URL('./system-updates-settings.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/i18n.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(settings, /NO_RELEASE_AVAILABLE/);
  assert.match(settings, /DEVELOPMENT/);
  assert.match(
    settings,
    /release\.status === 'UPDATE_AVAILABLE' && <LoadingButton/,
  );
  assert.match(copy, /No published updates/);
  assert.match(copy, /No updater-compatible release has been published yet\./);
  assert.match(copy, /Aucune mise à jour publiée/);
});

test('an eligible release exposes Update Now without starting an update during load or check', async () => {
  const source = await readFile(
    new URL('./system-updates-settings.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /release\.status === 'UPDATE_AVAILABLE' && <LoadingButton/,
  );
  assert.match(source, /onClick=\{prepareInstall\}/);
  assert.match(
    source,
    /async function install\(\)[\s\S]*?\/system-updates\/install/,
  );
  assert.doesNotMatch(
    source.match(/const load[\s\S]*?const acceptRunState/)?.[0] ?? '',
    /\/system-updates\/install/,
  );
  assert.doesNotMatch(
    source.match(
      /async function check[\s\S]*?async function prepareInstall/,
    )?.[0] ?? '',
    /\/system-updates\/install/,
  );
});

test('supply-chain status is display-only and has no provenance bypass control', async () => {
  const source = await readFile(
    new URL('./system-updates-settings.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /ProvenanceStatus/);
  assert.match(source, /supplyChainVerification/);
  assert.match(source, /authenticityBlocked/);
  assert.doesNotMatch(
    source,
    /continueAnyway|bypassProvenance|skipProvenance/i,
  );
});
