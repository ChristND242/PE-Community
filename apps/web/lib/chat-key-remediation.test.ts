import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateChatKeyPair } from './chat-crypto';
import { exportEncryptedChatKeyBackup, importEncryptedChatKeyBackup } from './chat-key-recovery';
import { reconcileStoredChatKeyState, type StoredChatKeyMaterial, type StoredChatKeyState } from './chat-key-store';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const current: StoredChatKeyMaterial = { privateKey: 'private-current', publicKey: 'public-current', createdAt: '2026-01-01T00:00:00.000Z' };
const retired: StoredChatKeyMaterial = { privateKey: 'private-retired', publicKey: 'public-retired', createdAt: '2025-01-01T00:00:00.000Z' };
const unknown: StoredChatKeyMaterial = { privateKey: 'private-unknown', publicKey: 'public-unknown', createdAt: '2026-02-01T00:00:00.000Z' };

function storedState(overrides: Partial<StoredChatKeyState> = {}): StoredChatKeyState {
  return {
    id: 'community:user',
    formatVersion: 2,
    current,
    history: [retired],
    pending: null,
    quarantined: [],
    ...overrides,
  };
}

test('authorized server-active material is current and retained history remains decrypt-only', () => {
  const next = reconcileStoredChatKeyState(
    storedState(),
    [{ publicKey: current.publicKey, status: 'ACTIVE' }, { publicKey: retired.publicKey, status: 'RETIRED' }],
    current.publicKey,
    true,
  );
  assert.equal(next.current?.publicKey, current.publicKey);
  assert.deepEqual(next.history.map((key) => key.publicKey), [retired.publicKey]);
});

test('unauthorized, unknown, and revoked material never becomes current', () => {
  const next = reconcileStoredChatKeyState(
    storedState({ history: [retired, unknown] }),
    [{ publicKey: current.publicKey, status: 'ACTIVE' }, { publicKey: retired.publicKey, status: 'REVOKED' }],
    current.publicKey,
    false,
  );
  assert.equal(next.current, null);
  assert.deepEqual(next.history.map((key) => key.publicKey), [current.publicKey]);
  assert.deepEqual(new Set(next.quarantined.map((key) => key.publicKey)), new Set([retired.publicKey, unknown.publicKey]));
});

test('a crash-recovered pending key is promoted only when server-active and device-authorized', () => {
  const next = reconcileStoredChatKeyState(
    storedState({ current: null, history: [retired], pending: current }),
    [{ publicKey: current.publicKey, status: 'ACTIVE' }, { publicKey: retired.publicKey, status: 'RETIRED' }],
    current.publicKey,
    true,
  );
  assert.equal(next.current?.publicKey, current.publicKey);
  assert.equal(next.pending, null);
});

test('wrong password and tampered v1 fields fail authentication without producing imported material', async () => {
  const pair = await generateChatKeyPair();
  const backup = await exportEncryptedChatKeyBackup(pair.privateKey, 'audit-only-recovery-password');
  await assert.rejects(() => importEncryptedChatKeyBackup(backup, 'wrong-password'));
  for (const field of ['salt', 'iv', 'encryptedPrivateKey'] as const) {
    const tampered = { ...backup, [field]: `${backup[field][0] === 'A' ? 'B' : 'A'}${backup[field].slice(1)}` };
    await assert.rejects(() => importEncryptedChatKeyBackup(tampered, 'audit-only-recovery-password'));
  }
});

test('v1 parser rejects unsupported, malformed, extra, and oversized backup structures', async () => {
  const pair = await generateChatKeyPair();
  const backup = await exportEncryptedChatKeyBackup(pair.privateKey, 'audit-only-recovery-password');
  await assert.rejects(() => importEncryptedChatKeyBackup({ ...backup, version: 2 }, 'audit-only-recovery-password'));
  await assert.rejects(() => importEncryptedChatKeyBackup({ ...backup, extra: 'field' }, 'audit-only-recovery-password'));
  await assert.rejects(() => importEncryptedChatKeyBackup({ ...backup, salt: 'not-base64' }, 'audit-only-recovery-password'));
  await assert.rejects(() => importEncryptedChatKeyBackup({ ...backup, encryptedPrivateKey: 'A'.repeat(100_000) }, 'audit-only-recovery-password'));
  assert.throws(() => JSON.parse('{malformed'));
});

test('reported failed-restore regression is staged, exact-state, and never reactivates stale local material', async () => {
  const workspace = await readFile(new URL('../components/chat-workspace.tsx', import.meta.url), 'utf8');
  const restore = workspace.slice(workspace.indexOf('async function importKeyBackup()'), workspace.indexOf('useEffect(() =>', workspace.indexOf('async function importKeyBackup()')));
  assert.ok(restore.indexOf('importEncryptedChatKeyBackup') < restore.indexOf("'/chat/keys/restore/verify'"));
  assert.ok(restore.indexOf("'/chat/keys/restore/verify'") < restore.indexOf('stageLocalChatKey'));
  assert.ok(restore.indexOf('registerLocalChatKey') < restore.indexOf('commitStagedLocalChatKey'));
  assert.match(restore, /restoreLocalChatKeyState\(currentUser\.id, currentUser\.communityId, snapshot\)/);
  assert.doesNotMatch(restore, /replaceLocalChatKey|setKeyStatus\(localPrivateKey \? 'ready'/);
});

test('server enrollment modes and send acknowledgement preserve the repaired boundaries', async () => {
  const [service, gateway, socketHook] = await Promise.all([
    readFile(new URL('../../api/src/chat/chat.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/chat/chat.gateway.ts', import.meta.url), 'utf8'),
    readFile(new URL('../hooks/use-chat-socket.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(service, /requestedMode === 'initial'[\s\S]+CHAT_DEVICE_IDENTITY_CONFLICT/);
  assert.match(service, /retainedKey\.status !== 'ACTIVE'[\s\S]+CHAT_RETIRED_KEY_HISTORY_ONLY/);
  assert.match(service, /status: retained\.status[\s\S]+isCurrentActive:[\s\S]+deviceAuthorized/);
  assert.match(gateway, /chat:message:send[\s\S]+@Ack\(\) ack[\s\S]+ack\?\.\(\{ message \}\)/);
  assert.match(socketHook, /socket\.timeout\(8000\)\.emit\('chat:message:send'/);
  assert.match(socketHook, /message_send_timeout/);
});
