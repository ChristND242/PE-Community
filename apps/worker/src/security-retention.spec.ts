import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSecurityRetentionDays } from '@pe/shared';
import { runSecurityRetentionCleanup, SECURITY_RETENTION_BATCH_SIZE } from './security-retention';

const now = new Date('2026-08-29T12:00:00.000Z');
const day = 24 * 60 * 60 * 1_000;

test('retention configuration defaults safely and rejects destructive or excessive values', () => {
  assert.equal(parseSecurityRetentionDays('TEST_RETENTION', undefined), 180);
  assert.equal(parseSecurityRetentionDays('TEST_RETENTION', '30'), 30);
  for (const value of ['0', '-1', '29', 'abc', '30.5', '3651']) {
    assert.throws(() => parseSecurityRetentionDays('TEST_RETENTION', value));
  }
});

test('event cleanup preserves recent and exact-boundary rows and deletes only older rows', async () => {
  const store = retentionStore({
    events: [
      { id: 'newer', occurredAt: new Date(now.getTime() - 179 * day) },
      { id: 'boundary', occurredAt: new Date(now.getTime() - 180 * day) },
      { id: 'older', occurredAt: new Date(now.getTime() - 181 * day) },
    ],
    sessions: [],
  });
  const result = await runSecurityRetentionCleanup(store.prisma, { now, eventRetentionDays: 180, sessionRetentionDays: 180 });
  assert.equal(result.securityEventsDeleted, 1);
  assert.deepEqual(store.events.map((event) => event.id), ['newer', 'boundary']);
});

test('custom retention, bounded batches, and reruns are deterministic and idempotent', async () => {
  const store = retentionStore({
    events: Array.from({ length: SECURITY_RETENTION_BATCH_SIZE + 1 }, (_, index) => ({ id: `old-${index}`, occurredAt: new Date(now.getTime() - 31 * day) })),
    sessions: [],
  });
  const first = await runSecurityRetentionCleanup(store.prisma, { now, eventRetentionDays: 30, sessionRetentionDays: 30 });
  const second = await runSecurityRetentionCleanup(store.prisma, { now, eventRetentionDays: 30, sessionRetentionDays: 30 });
  assert.equal(first.securityEventsDeleted, SECURITY_RETENTION_BATCH_SIZE + 1);
  assert.equal(store.eventSelectCalls, 3);
  assert.equal(second.securityEventsDeleted, 0);
});

test('session cleanup preserves active and recent expired sessions and removes only old terminal rows', async () => {
  const store = retentionStore({
    events: [],
    sessions: [
      { id: 'active-old-creation', expiresAt: new Date(now.getTime() + day), idleExpiresAt: new Date(now.getTime() + day) },
      { id: 'recent-expired', expiresAt: new Date(now.getTime() - 30 * day), idleExpiresAt: new Date(now.getTime() - 30 * day) },
      { id: 'historical-expired', expiresAt: new Date(now.getTime() - 181 * day), idleExpiresAt: new Date(now.getTime() - 181 * day) },
    ],
  });
  const result = await runSecurityRetentionCleanup(store.prisma, { now, eventRetentionDays: 180, sessionRetentionDays: 180 });
  assert.equal(result.expiredSessionsDeleted, 1);
  assert.deepEqual(store.sessions.map((session) => session.id), ['active-old-creation', 'recent-expired']);
});

test('worker schedules one bounded daily retryable retention job and logs aggregate counts only', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  assert.match(source, /jobId: 'security-retention-cleanup-daily'/);
  assert.match(source, /repeat: \{ every: 24 \* 60 \* 60 \* 1_000 \}/);
  assert.match(source, /attempts: 3/);
  assert.match(source, /security events deleted=\$\{result\.securityEventsDeleted\}/);
  assert.doesNotMatch(source, /security:retention[^\n]*(ipAddress|countryName|userAgent)/);
});

type EventRow = { id: string; occurredAt: Date };
type SessionRow = { id: string; expiresAt: Date; idleExpiresAt: Date };

function retentionStore(input: { events: EventRow[]; sessions: SessionRow[] }) {
  const state = {
    events: [...input.events],
    sessions: [...input.sessions],
    eventSelectCalls: 0,
  };
  return {
    events: state.events,
    sessions: state.sessions,
    get eventSelectCalls() { return state.eventSelectCalls; },
    prisma: {
      securityEvent: {
        findMany: async (query: { where: { occurredAt: { lt: Date } }; take: number }) => {
          state.eventSelectCalls += 1;
          return state.events.filter((row) => row.occurredAt < query.where.occurredAt.lt).slice(0, query.take).map(({ id }) => ({ id }));
        },
        deleteMany: async (query: { where: { id: { in: string[] }; occurredAt: { lt: Date } } }) => remove(state.events, query.where.id.in, (row) => row.occurredAt < query.where.occurredAt.lt),
      },
      session: {
        findMany: async (query: { where: { OR: Array<{ expiresAt?: { lt: Date }; idleExpiresAt?: { lt: Date } }> }; take: number }) => {
          const cutoff = query.where.OR[0].expiresAt!.lt;
          return state.sessions.filter((row) => row.expiresAt < cutoff || row.idleExpiresAt < cutoff).slice(0, query.take).map(({ id }) => ({ id }));
        },
        deleteMany: async (query: { where: { id: { in: string[] }; OR: Array<{ expiresAt?: { lt: Date }; idleExpiresAt?: { lt: Date } }> } }) => {
          const cutoff = query.where.OR[0].expiresAt!.lt;
          return remove(state.sessions, query.where.id.in, (row) => row.expiresAt < cutoff || row.idleExpiresAt < cutoff);
        },
      },
    } as never,
  };
}

function remove<T extends { id: string }>(rows: T[], ids: string[], eligible: (row: T) => boolean) {
  const selected = new Set(ids);
  const before = rows.length;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (selected.has(rows[index].id) && eligible(rows[index])) rows.splice(index, 1);
  }
  return { count: before - rows.length };
}
