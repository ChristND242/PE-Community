import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AuthService, SESSION_IDLE_TIMEOUT_MS, newSessionDeadlines } from '../auth/auth.service';

const authControllerUrl = new URL('../auth/auth.controller.ts', import.meta.url);
const chatGatewayUrl = new URL('../chat/chat.gateway.ts', import.meta.url);
const eventTasksGatewayUrl = new URL('../event-tasks-realtime/event-tasks-realtime.gateway.ts', import.meta.url);

type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastActivityAt: Date;
  idleExpiresAt: Date;
  expiresAt: Date;
} | null;

test('new sessions receive independent 20-minute idle and seven-day absolute deadlines', () => {
  const now = new Date('2026-07-31T10:00:00.000Z');
  const deadlines = newSessionDeadlines(now);
  assert.equal(deadlines.idleExpiresAt.toISOString(), '2026-07-31T10:20:00.000Z');
  assert.equal(deadlines.absoluteExpiresAt.toISOString(), '2026-08-07T10:00:00.000Z');
});

test('session status exposes authoritative deadlines without secrets', async () => {
  const harness = sessionHarness();
  const result = await harness.service.sessionStatus('signed-cookie');

  assert.equal(result.status, 'active');
  assert.equal(result.idleTimeoutSeconds, 20 * 60);
  assert.equal(result.warningAfterSeconds, 15 * 60);
  assert.equal('tokenHash' in result, false);
  assert.equal('sessionId' in result, false);
});

test('authenticated activity uses server time and extends only the idle deadline', async () => {
  const harness = sessionHarness();
  const absoluteBefore = harness.session!.expiresAt.getTime();
  const idleBefore = harness.session!.idleExpiresAt.getTime();
  await new Promise((resolve) => setTimeout(resolve, 5));

  const result = await harness.service.touchSessionActivity('signed-cookie');

  assert.ok(Date.parse(result.idleExpiresAt) > idleBefore);
  assert.equal(Date.parse(result.absoluteExpiresAt), absoluteBefore);
  assert.equal(harness.session!.expiresAt.getTime(), absoluteBefore);
  assert.ok(harness.session!.idleExpiresAt.getTime() <= absoluteBefore);
});

test('activity after idle expiration deletes the session and cannot revive it', async () => {
  const harness = sessionHarness({ idleExpiresAt: new Date(Date.now() - 1) });

  await assert.rejects(
    harness.service.touchSessionActivity('signed-cookie'),
    (error: unknown) => error instanceof UnauthorizedException,
  );
  assert.equal(harness.session, null);
});

test('revoked and absolute-expired sessions cannot be renewed', async () => {
  const revoked = sessionHarness({ revoked: true });
  await assert.rejects(() => revoked.service.touchSessionActivity('signed-cookie'), UnauthorizedException);

  const absoluteExpired = sessionHarness({ expiresAt: new Date(Date.now() - 1) });
  await assert.rejects(() => absoluteExpired.service.touchSessionActivity('signed-cookie'), UnauthorizedException);
  assert.equal(absoluteExpired.session, null);
});

test('concurrent activity requests preserve one bounded idle deadline', async () => {
  const harness = sessionHarness();
  const [first, second] = await Promise.all([
    harness.service.touchSessionActivity('signed-cookie'),
    harness.service.touchSessionActivity('signed-cookie'),
  ]);

  assert.equal(first.absoluteExpiresAt, second.absoluteExpiresAt);
  assert.ok(harness.session!.idleExpiresAt.getTime() <= Date.now() + SESSION_IDLE_TIMEOUT_MS);
});

test('logout revokes the current database session', async () => {
  const harness = sessionHarness();
  await harness.service.logout('signed-cookie');
  assert.equal(harness.session, null);
});

test('activity endpoint accepts no client deadline fields and realtime traffic does not touch activity', async () => {
  const [controller, chatGateway, eventTasksGateway] = await Promise.all([
    readFile(authControllerUrl, 'utf8'),
    readFile(chatGatewayUrl, 'utf8'),
    readFile(eventTasksGatewayUrl, 'utf8'),
  ]);
  const activityEndpoint = controller.slice(
    controller.indexOf("@Post('session/activity')"),
    controller.indexOf("@Post('change-required-password')"),
  );
  assert.match(activityEndpoint, /touchSessionActivity/);
  assert.doesNotMatch(activityEndpoint, /@Body|lastActivityAt|idleExpiresAt/);
  assert.doesNotMatch(chatGateway, /touchSessionActivity/);
  assert.doesNotMatch(eventTasksGateway, /touchSessionActivity/);
});

function sessionHarness(overrides: { idleExpiresAt?: Date; expiresAt?: Date; revoked?: boolean } = {}) {
  const sid = 'opaque-session-token';
  let session: StoredSession = overrides.revoked ? null : {
    id: 'session-1',
    userId: 'user-1',
    tokenHash: createHash('sha256').update(sid).digest('hex'),
    createdAt: new Date(),
    lastActivityAt: new Date(),
    idleExpiresAt: overrides.idleExpiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  };
  const prisma = {
    session: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => session?.tokenHash === where.tokenHash ? { ...session } : null,
      updateMany: async ({ where, data }: { where: { id?: string; tokenHash?: string; expiresAt?: { gt: Date }; idleExpiresAt?: { gt: Date } }; data?: { lastActivityAt?: Date; idleExpiresAt?: Date } }) => {
        if (where.tokenHash) {
          if (session?.tokenHash === where.tokenHash) {
            session = null;
            return { count: 1 };
          }
          return { count: 0 };
        }
        if (!session || session.id !== where.id || session.expiresAt <= where.expiresAt!.gt || session.idleExpiresAt <= where.idleExpiresAt!.gt) return { count: 0 };
        session = { ...session, ...data };
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id?: string; tokenHash?: string } }) => {
        if (session && (where.id === session.id || where.tokenHash === session.tokenHash)) {
          session = null;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  };
  const jwt = { verifyAsync: async () => ({ sid }) };
  const service = new AuthService(prisma as never, jwt as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return {
    service,
    get session() { return session; },
  };
}
