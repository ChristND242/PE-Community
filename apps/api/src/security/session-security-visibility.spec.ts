import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SecurityActivityService } from '../auth/security-activity.service';
import type { RequestUser } from '../auth/auth.service';

const user: RequestUser = {
  id: 'user-1',
  email: 'member@example.test',
  name: 'Member',
  communityId: 'community-1',
  community: { defaultLanguage: 'en', timezone: 'UTC' },
  role: 'member',
  permissions: [],
  sessionId: 'session-current',
  emailVerified: true,
};

test('session revocation routes preserve Phase 4 fresh step-up enforcement', async () => {
  const source = await readFile(new URL('../auth/security-activity.controller.ts', import.meta.url), 'utf8');
  const revokeOthers = source.slice(source.indexOf("@Delete('sessions/others')"), source.indexOf("@Delete('sessions/:sessionId')"));
  const revokeOne = source.slice(source.indexOf("@Delete('sessions/:sessionId')"), source.indexOf("@Get('security-activity')"));
  assert.match(revokeOthers, /stepUp\.requireRecent\(user\)/);
  assert.match(revokeOne, /stepUp\.requireRecent\(user\)/);
});

test('session listing is own-user scoped, identifies current session, and omits token material', async () => {
  let receivedWhere: unknown;
  const prisma = {
    session: {
      findMany: async ({ where }: { where: unknown }) => {
        receivedWhere = where;
        return [session('session-current'), session('session-other')];
      },
    },
  };
  const service = new SecurityActivityService(prisma as never, {} as never);
  const response = await service.sessions(user);
  const where = receivedWhere as { userId: string; expiresAt: { gt: Date }; idleExpiresAt: { gt: Date } };
  assert.equal(where.userId, user.id);
  assert.ok(where.expiresAt.gt instanceof Date);
  assert.ok(where.idleExpiresAt.gt instanceof Date);
  assert.equal(response.sessions[0].current, true);
  assert.equal(response.sessions[1].current, false);
  assert.equal('tokenHash' in response.sessions[0], false);
  assert.equal('userAgent' in response.sessions[0], false);
});

test('another user session cannot be revoked by guessing its ID', async () => {
  const prisma = { session: { findFirst: async () => null } };
  const service = new SecurityActivityService(prisma as never, {} as never);
  await assert.rejects(() => service.revokeSession(user, 'someone-elses-session'), NotFoundException);
});

test('sign out all others preserves the current session', async () => {
  let deletionWhere: unknown;
  const prisma = {
    session: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletionWhere = where;
        return { count: 3 };
      },
    },
    securityEvent: { create: async ({ data }: { data: object }) => ({ id: 'event-1', ...data }) },
  };
  const service = new SecurityActivityService(prisma as never, { queueSecurityEventEmail: async () => ({}) } as never);
  const result = await service.revokeOtherSessions(user);
  assert.deepEqual(deletionWhere, { userId: user.id, id: { not: user.sessionId } });
  assert.equal(result.revokedCount, 3);
});

test('security activity is bounded, newest-first, own-user scoped, and omits secret metadata', async () => {
  let query: Record<string, unknown> | undefined;
  const event = {
    id: 'event-1', eventType: 'PASSKEY_ADDED', result: 'SUCCESS', occurredAt: new Date('2026-08-30T10:00:00Z'),
    ipAddress: '203.0.113.5', countryName: 'Philippines', browser: 'Chrome', operatingSystem: 'Windows',
    authenticationMethod: 'PASSKEY', metadata: { passkeyName: 'Laptop', credentialId: 'must-not-leak', secret: 'must-not-leak' },
  };
  const prisma = {
    securityEvent: {
      findMany: async (input: Record<string, unknown>) => { query = input; return [event]; },
      count: async () => 1,
    },
  };
  const service = new SecurityActivityService(prisma as never, {} as never);
  const response = await service.activity(user, '1', '25');
  assert.deepEqual(query?.where, { userId: user.id, communityId: user.communityId, eventType: { not: 'LOGIN_FAILED' } });
  assert.deepEqual(query?.orderBy, [{ occurredAt: 'desc' }, { id: 'desc' }]);
  assert.equal(query?.take, 25);
  assert.equal(response.items[0].ipAddress, '203.0.113.5');
  assert.deepEqual(response.items[0].metadata, { passkeyName: 'Laptop' });
});

test('failed-attempt alerts start at five attempts and one-hour dedupe suppresses mail floods', async () => {
  type StoredEvent = Record<string, unknown> & { eventType?: string; dedupeKey?: string; occurredAt: Date };
  const events: StoredEvent[] = [];
  let emailCount = 0;
  const prisma = {
    securityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (data.dedupeKey && events.some((event) => event.dedupeKey === data.dedupeKey)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
        }
        const event = { id: `event-${events.length + 1}`, occurredAt: new Date(), ...data };
        events.push(event);
        return event;
      },
      findMany: async () => events.filter((event) => event.eventType === 'LOGIN_FAILED').slice(-20).reverse(),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const email = { queueSecurityEventEmail: async () => { emailCount += 1; } };
  const service = new SecurityActivityService(prisma as never, email as never);
  for (let attempt = 0; attempt < 7; attempt += 1) {
    await service.recordFailedLogin({
      communityId: user.communityId,
      userId: user.id,
      authenticationMethod: 'PASSWORD',
      context: { sourceIp: `198.51.100.${attempt + 1}`, countryName: attempt % 2 ? 'France' : 'Unknown' },
    });
  }
  assert.equal(events.filter((event) => event.eventType === 'LOGIN_FAILED').length, 7);
  assert.equal(events.filter((event) => event.eventType === 'LOGIN_FAILED_ALERT').length, 1);
  assert.equal(emailCount, 1);
});

test('mail queue failure does not undo a persisted security event', async () => {
  let persisted = false;
  const prisma = {
    securityEvent: {
      create: async ({ data }: { data: object }) => { persisted = true; return { id: 'event-1', ...data }; },
      updateMany: async () => ({ count: 0 }),
    },
  };
  const service = new SecurityActivityService(prisma as never, { queueSecurityEventEmail: async () => { throw new Error('queue unavailable'); } } as never);
  const event = await service.record({ communityId: user.communityId, userId: user.id, eventType: 'PASSWORD_CHANGED', notify: true });
  assert.equal(persisted, true);
  assert.equal(event.id, 'event-1');
});

function session(id: string) {
  const now = new Date('2026-08-30T10:00:00Z');
  return {
    id, createdAt: now, lastActivityAt: now, idleExpiresAt: new Date('2026-08-30T10:20:00Z'), expiresAt: new Date('2026-09-06T10:00:00Z'),
    authenticationMethod: 'PASSWORD', createdIp: '127.0.0.1', createdCountryName: 'Unknown', lastSeenIp: '127.0.0.1',
    lastSeenCountryName: 'Unknown', browser: 'Chrome', operatingSystem: 'Linux',
  };
}
