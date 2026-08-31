import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { assertChatDeviceLimit, chatPublicKeyFingerprint, chatPublicKeysEqual, lockChatDeviceEnrollment } from './chat.service';
import { generateChatKeyPair } from '../../../web/lib/chat-crypto';
import { exportEncryptedChatKeyBackup, importEncryptedChatKeyBackup } from '../../../web/lib/chat-key-recovery';
import { detectClientDeviceInfo, detectClientDeviceInfoSync } from '../../../web/lib/chat-device-info';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

test('chat public-key fingerprint is canonical and excludes JSON property order', () => {
  const first = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'test-x', y: 'test-y', ext: true });
  const second = JSON.stringify({ y: 'test-y', x: 'test-x', crv: 'P-256', kty: 'EC' });
  assert.equal(chatPublicKeyFingerprint(first), chatPublicKeyFingerprint(second));
  assert.equal(chatPublicKeysEqual(first, second), true);
  assert.equal(chatPublicKeysEqual(first, JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'other-x', y: 'test-y' })), false);
});

test('restore verification uses canonical identity matching for retained and legacy key rows', async () => {
  const source = await readFile('src/chat/chat.service.ts', 'utf8');
  const enrollment = source.slice(source.indexOf('async registerMyDeviceKey'), source.indexOf('async verifyRestoredKey'));
  const verification = source.slice(source.indexOf('async verifyRestoredKey'), source.indexOf('async myDevices'));
  assert.match(enrollment, /fingerprint: null[\s\S]+chatPublicKeysEqual\(key\.publicKey, publicKey\)/);
  assert.match(enrollment, /!chatPublicKeysEqual\(retainedKey\.publicKey, publicKey\)/);
  assert.match(verification, /fingerprint: null[\s\S]+chatPublicKeysEqual\(key\.publicKey, publicKey\)/);
  assert.match(verification, /!chatPublicKeysEqual\(retained\.publicKey, publicKey\)/);
  assert.doesNotMatch(`${enrollment}\n${verification}`, /retained(?:Key)?\.publicKey !== publicKey/);
});

test('active chat device limit accepts only 1 through 8', () => {
  for (let value = 1; value <= 8; value += 1) assert.doesNotThrow(() => assertChatDeviceLimit(value));
  assert.throws(() => assertChatDeviceLimit(0));
  assert.throws(() => assertChatDeviceLimit(9));
  assert.throws(() => assertChatDeviceLimit(1.5));
});

test('version-1 chat backup still restores locally and wrong material fails closed', async () => {
  const keyPair = await generateChatKeyPair();
  const backup = await exportEncryptedChatKeyBackup(keyPair.privateKey, 'audit-only-recovery-password');
  assert.equal(backup.version, 1);
  const restored = await importEncryptedChatKeyBackup(backup, 'audit-only-recovery-password');
  assert.ok(restored.publicKeyJson.includes('"P-256"'));
  await assert.rejects(() => importEncryptedChatKeyBackup(backup, 'wrong-recovery-password'));
});

test('immutable key migration preserves IDs and never rewrites ciphertext', async () => {
  const migration = await readFile(
    '../../prisma/migrations/20260726000000_secure_chat_devices_and_media_governance/migration.sql',
    'utf8',
  );
  assert.match(migration, /'legacy-' \\|\\| "id"/);
  assert.doesNotMatch(migration, /UPDATE "ChatMessage"[^;]+encryptedPayload/is);
  assert.doesNotMatch(migration, /DELETE FROM "ChatDeviceKey"/i);
});

test('device metadata parser normalizes common and unknown clients without throwing', () => {
  const chrome = detectClientDeviceInfoSync({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36',
    platform: 'Win32',
  });
  assert.equal(chrome.deviceType, 'DESKTOP');
  assert.equal(chrome.operatingSystemName, 'Windows');
  assert.equal(chrome.browserName, 'Chrome');
  assert.equal(chrome.browserVersion, '150.0.0.0');
  assert.equal(chrome.suggestedDisplayName, 'Chrome on Windows');

  const edge = detectClientDeviceInfoSync({
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36 EdgA/150.0.0.0',
  });
  assert.equal(edge.deviceType, 'MOBILE');
  assert.equal(edge.browserName, 'Edge');
  assert.equal(edge.operatingSystemVersion, '15');

  const opera = detectClientDeviceInfoSync({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 OPR/122.0.0.0',
  });
  assert.equal(opera.browserName, 'Opera');

  const samsung = detectClientDeviceInfoSync({
    userAgent: 'Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S938B) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36 SamsungBrowser/28.0',
  });
  assert.equal(samsung.browserName, 'Samsung Internet');
  assert.equal(samsung.operatingSystemName, 'Android');
  assert.equal(samsung.operatingSystemVersion, '15');

  const firefox = detectClientDeviceInfoSync({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
    platform: 'Linux x86_64',
  });
  assert.equal(firefox.browserName, 'Firefox');
  assert.equal(firefox.browserVersion, '142.0');
  assert.equal(firefox.operatingSystemName, 'Linux');

  const safari = detectClientDeviceInfoSync({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
  });
  assert.equal(safari.deviceType, 'MOBILE');
  assert.equal(safari.browserName, 'Safari');
  assert.equal(safari.operatingSystemName, 'iOS');
  assert.equal(safari.operatingSystemVersion, '18.5');

  assert.doesNotThrow(() => detectClientDeviceInfoSync({ userAgent: '\u0000malformed'.repeat(200) }));
  const unknown = detectClientDeviceInfoSync({ userAgent: 'unknown-agent' });
  assert.equal(unknown.browserName, 'Unknown');
  assert.equal(unknown.suggestedDisplayName, 'Unknown device');
});

test('device metadata parser uses bounded Chromium client hints and falls back safely', async () => {
  const chromium = await detectClientDeviceInfo({
    userAgent: 'Mozilla/5.0',
    userAgentData: {
      mobile: false,
      platform: 'Windows',
      brands: [{ brand: 'Google Chrome', version: '150' }],
      getHighEntropyValues: async () => ({
        platform: 'Windows',
        platformVersion: '15.0.0',
        fullVersionList: [{ brand: 'Google Chrome', version: `150.${'1'.repeat(80)}` }],
      }),
    },
  });
  assert.equal(chromium.deviceType, 'DESKTOP');
  assert.equal(chromium.browserName, 'Chrome');
  assert.equal(chromium.browserVersion?.length, 32);
  assert.equal(chromium.suggestedDisplayName, 'Chrome on Windows');

  const fallback = await detectClientDeviceInfo({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/142.0',
    userAgentData: {
      getHighEntropyValues: async () => {
        throw new Error('Client hints unavailable');
      },
    },
  });
  assert.equal(fallback.browserName, 'Firefox');
});

test('device metadata detection is SSR-safe and does not require navigator', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true });
  try {
    const detected = await detectClientDeviceInfo();
    assert.equal(detected.deviceType, 'UNKNOWN');
    assert.equal(detected.operatingSystemName, 'Unknown');
    assert.equal(detected.browserName, 'Unknown');
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  }
});

test('chat governance row menus portal outside table viewports and retain confirmations', async () => {
  const [menuSource, tableSource] = await Promise.all([
    readFile('../web/components/row-action-menu.tsx', 'utf8'),
    readFile('../web/components/chat-governance-tables.tsx', 'utf8'),
  ]);
  assert.match(menuSource, /createPortal\([\s\S]+document\.body/);
  assert.match(menuSource, /position:\s*'fixed'/);
  assert.match(menuSource, /nextPlacement\s*===\s*'top'/);
  assert.match(menuSource, /event\.key\s*===\s*'Escape'/);
  assert.match(menuSource, /ArrowDown[\s\S]+ArrowUp[\s\S]+Home[\s\S]+End/);
  assert.equal((tableSource.match(/<RowActionMenu/g) ?? []).length, 4);
  assert.doesNotMatch(tableSource, /absolute right-3 top-11/);
  assert.match(tableSource, /<ConfirmDialog open=\{Boolean\(revokeTarget\)\}/);
  assert.match(tableSource, /<ConfirmDialog open=\{Boolean\(deleteTarget\)\}/);
});

test('shared pagination uses accessible chevrons without visible previous or next text', async () => {
  const source = await readFile('../web/components/ui.tsx', 'utf8');
  const pagination = source.slice(source.indexOf('export function DataTablePagination'), source.indexOf('export function ConfirmDialog'));
  assert.match(pagination, /aria-label=\{previousLabel\}/);
  assert.match(pagination, /title=\{previousLabel\}/);
  assert.match(pagination, /<ChevronLeft[^>]+aria-hidden="true"/);
  assert.match(pagination, /disabled=\{page <= 1\}/);
  assert.match(pagination, /onPageChange\(page - 1\)/);
  assert.match(pagination, /aria-label=\{nextLabel\}/);
  assert.match(pagination, /title=\{nextLabel\}/);
  assert.match(pagination, /<ChevronRight[^>]+aria-hidden="true"/);
  assert.match(pagination, /disabled=\{page >= pageCount\}/);
  assert.match(pagination, /onPageChange\(page \+ 1\)/);
  assert.doesNotMatch(pagination, />\s*\{previousLabel\}\s*</);
  assert.doesNotMatch(pagination, />\s*\{nextLabel\}\s*</);
});

test('current-browser metadata enrichment is bounded to an established retained key and metadata fields', async () => {
  const [controllerSource, serviceSource, clientSource, i18nSource] = await Promise.all([
    readFile('src/chat/chat.controller.ts', 'utf8'),
    readFile('src/chat/chat.service.ts', 'utf8'),
    readFile('../web/lib/chat-device-metadata.ts', 'utf8'),
    readFile('../web/lib/i18n.tsx', 'utf8'),
  ]);
  const start = serviceSource.indexOf('async enrichMyDeviceMetadata');
  const end = serviceSource.indexOf('async revokeMyDevice', start);
  const enrichment = serviceSource.slice(start, end);
  assert.match(controllerSource, /@Patch\('devices\/me\/metadata'\)/);
  assert.match(enrichment, /publicKey,[\s\S]+fingerprint,[\s\S]+status:\s*\{\s*not:\s*'REVOKED'/);
  assert.match(enrichment, /deviceIdentifier:\s*currentDeviceIdentifier/);
  assert.match(enrichment, /keyId:\s*key\.id/);
  assert.match(enrichment, /compatibilityDevices\.length\s*===\s*1/);
  assert.match(enrichment, /data:\s*metadata/);
  assert.doesNotMatch(enrichment, /chatDevice\.create|chatDeviceKey\.(?:create|update)|lastSeenAt:\s*new Date/);
  assert.equal((clientSource.match(/\/chat\/devices\/me\/metadata/g) ?? []).length, 1);
  assert.match(clientSource, /typeof window === 'undefined'/);
  assert.match(serviceSource, /chatDevice\.create\(\{[\s\S]+displayName:\s*metadata\.generatedLabel,[\s\S]+\.\.\.metadata/);
  assert.equal((i18nSource.match(/deviceOnOperatingSystem:/g) ?? []).length, 2);
  assert.match(i18nSource, /`\$\{browser\} on \$\{operatingSystem\}`/);
  assert.match(i18nSource, /`\$\{browser\} sur \$\{operatingSystem\}`/);
});

test('device enrollment advisory lock executes parameterized SQL without deserializing PostgreSQL void', async () => {
  const calls: unknown[][] = [];
  const transaction = {
    $executeRaw: async (...args: unknown[]) => {
      calls.push(args);
      return 1;
    },
  } as unknown as Prisma.TransactionClient;
  await lockChatDeviceEnrollment(transaction, 'community-test', 'user-test');
  assert.equal(calls.length, 1);

  const source = await readFile('src/chat/chat.service.ts', 'utf8');
  assert.match(source, /lockChatDeviceEnrollment[\s\S]+?\$executeRaw`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(source, /lockChatDeviceEnrollment[\s\S]{0,300}?\$queryRaw/);
  assert.doesNotMatch(source, /\$queryRawUnsafe|\$executeRawUnsafe/);
});
