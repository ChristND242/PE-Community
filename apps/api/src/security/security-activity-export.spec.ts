import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  createSecurityActivityCsv,
  resolveSecurityExportRange,
  SECURITY_ACTIVITY_EXPORT_MAX_ROWS,
  securityExportFilename,
  type SecurityActivityExportRow,
} from '../auth/security-activity-export';
import { SecurityActivityService } from '../auth/security-activity.service';
import type { RequestUser } from '../auth/auth.service';

const now = new Date('2026-08-29T12:00:00.000Z');
const day = 24 * 60 * 60 * 1_000;
const user: RequestUser = {
  id: 'user-1', email: 'member@example.test', name: 'Member', communityId: 'community-1',
  community: { defaultLanguage: 'en', timezone: 'UTC' }, role: 'member', permissions: [],
  sessionId: 'session-current', emailVerified: true,
};

test('preset and custom export ranges are UTC bounded by retained history', () => {
  for (const days of [7, 30, 90, 180]) {
    const range = resolveSecurityExportRange({ range: String(days), from: undefined, to: undefined, retentionDays: 180, now });
    assert.equal(range.to.toISOString(), now.toISOString());
    assert.equal(range.from.toISOString(), new Date(now.getTime() - days * day).toISOString());
  }
  const custom = resolveSecurityExportRange({
    range: 'custom', from: '2026-08-01T00:00:00.000Z', to: '2026-08-20T23:59:59.999Z', retentionDays: 180, now,
  });
  assert.equal(custom.label, 'custom');
});

test('invalid, reversed, future, and over-retention ranges fail closed', () => {
  const invalid = [
    { range: 'custom', from: 'invalid', to: now.toISOString() },
    { range: 'custom', from: now.toISOString(), to: new Date(now.getTime() - day).toISOString() },
    { range: 'custom', from: new Date(now.getTime() - day).toISOString(), to: new Date(now.getTime() + day).toISOString() },
    { range: 'custom', from: new Date(now.getTime() - 181 * day).toISOString(), to: now.toISOString() },
    { range: '365', from: undefined, to: undefined },
  ];
  for (const input of invalid) {
    assert.throws(() => resolveSecurityExportRange({ ...input, retentionDays: 180, now }));
  }
});

test('CSV export neutralizes formulas and preserves quotes, commas, and line breaks safely', () => {
  const csv = createSecurityActivityCsv([exportRow({
    eventType: '@IMPORT',
    browser: '=SUM(1+1)',
    operatingSystem: '+cmd',
    ipAddress: '-1+2',
    countryName: '@IMPORT',
    authenticationMethod: '"quoted", method\nnext line',
    metadata: { passkeyName: '@IMPORT' },
  })], user.sessionId);
  assert.match(csv, /"'=SUM\(1\+1\)"/);
  assert.match(csv, /"'\+cmd"/);
  assert.match(csv, /"'-1\+2"/);
  assert.match(csv, /"'@IMPORT"/);
  assert.match(csv, /""quoted"", method\nnext line/);
  assert.doesNotMatch(csv, /user-1|session-current|credentialId|publicKey|userAgent/);
});

test('own-user export is bounded, deterministic, audited after selection, and excludes itself', async () => {
  const operations: string[] = [];
  let query: Record<string, unknown> | undefined;
  let auditData: Record<string, unknown> | undefined;
  const prisma = {
    securityEvent: {
      findMany: async (input: Record<string, unknown>) => { operations.push('query'); query = input; return [exportRow()]; },
      create: async ({ data }: { data: Record<string, unknown> }) => { operations.push('audit'); auditData = data; return { id: 'export-event', ...data }; },
    },
  };
  const service = new SecurityActivityService(prisma as never, {} as never);
  const exported = await service.exportActivity(user, { range: '7', format: 'csv' }, { sourceIp: '203.0.113.9', countryName: 'France', browser: 'Firefox', operatingSystem: 'Linux' });
  const where = query?.where as { userId: string; communityId: string; eventType: { not: string } };
  assert.equal(where.userId, user.id);
  assert.equal(where.communityId, user.communityId);
  assert.equal(where.eventType.not, 'LOGIN_FAILED');
  assert.equal(query?.take, SECURITY_ACTIVITY_EXPORT_MAX_ROWS + 1);
  assert.deepEqual(operations, ['query', 'audit']);
  assert.equal(auditData?.eventType, 'SECURITY_ACTIVITY_EXPORTED');
  const metadata = auditData?.metadata as { timeframe: string; rowCount: number; from: string; to: string };
  assert.equal(metadata.timeframe, '7-days');
  assert.equal(metadata.rowCount, 1);
  assert.match(metadata.from, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(metadata.to, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(exported.rowCount, 1);
  assert.match(exported.filename, /^pe-community-security-activity-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('unsupported formats and result sets over 10,000 rows return structured errors', async () => {
  const service = new SecurityActivityService({
    securityEvent: { findMany: async () => Array.from({ length: SECURITY_ACTIVITY_EXPORT_MAX_ROWS + 1 }, () => exportRow()) },
  } as never, {} as never);
  await assert.rejects(() => service.exportActivity(user, { range: '7', format: 'json' }), BadRequestException);
  await assert.rejects(() => service.exportActivity(user, { range: '7', format: 'csv' }), PayloadTooLargeException);
});

test('controller requires current-session step-up and returns safe non-cacheable CSV headers', async () => {
  const source = await readFile(new URL('../auth/security-activity.controller.ts', import.meta.url), 'utf8');
  const endpoint = source.slice(source.indexOf("@Get('security-activity/export')"), source.indexOf('private currentUser'));
  assert.match(endpoint, /const user = await this\.currentUser\(req\)/);
  assert.match(endpoint, /stepUp\.requireRecent\(user\)/);
  assert.doesNotMatch(endpoint, /userId.*Query|participantId/);
  assert.match(endpoint, /Content-Type', 'text\/csv; charset=utf-8'/);
  assert.match(endpoint, /Content-Disposition.*attachment/);
  assert.match(endpoint, /Cache-Control', 'no-store'/);
  assert.match(endpoint, /Pragma', 'no-cache'/);
});

test('safe filenames contain only the fixed product prefix and UTC dates', () => {
  assert.equal(
    securityExportFilename(new Date('2026-08-01T01:02:03Z'), new Date('2026-08-29T04:05:06Z')),
    'pe-community-security-activity-2026-08-01-to-2026-08-29.csv',
  );
});

function exportRow(overrides: Partial<SecurityActivityExportRow> = {}): SecurityActivityExportRow {
  return {
    eventType: 'PASSKEY_ADDED', result: 'SUCCESS', occurredAt: new Date('2026-08-20T10:00:00.000Z'),
    ipAddress: '203.0.113.5', countryName: 'France', browser: 'Chrome', operatingSystem: 'Linux',
    authenticationMethod: 'PASSKEY', sessionId: 'session-other', metadata: { passkeyName: 'Laptop' } as Prisma.JsonObject,
    ...overrides,
  };
}
