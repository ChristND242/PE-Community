import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  EmailChangeService,
  hashEmailChangeToken,
  isValidEmail,
  maskEmail,
  normalizeEmail,
} from '../auth/email-change.service';

type RequestRow = {
  id: string;
  userId: string;
  currentEmail: string;
  normalizedNewEmail: string;
  tokenHash: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  cancelledAt: Date | null;
  activeUserId: string | null;
  activeNewEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function harness(passwordValid = true) {
  const state = {
    user: { id: 'user-1', email: 'old@example.test', name: 'Member', passwordHash: 'stored-hash' },
    requests: [] as RequestRow[],
    sessions: [
      { tokenHash: 'current-session', userId: 'user-1' },
      { tokenHash: 'other-session', userId: 'user-1' },
    ],
    audits: [] as Array<{ action: string }>,
    verificationTokens: [] as string[],
    queuedNotices: 0,
    queuedCompletions: 0,
  };

  const prisma = {
    user: {
      findUniqueOrThrow: async () => ({ ...state.user }),
      findFirst: async ({ where }: { where: { email?: string | { equals: string }; id?: { not?: string } } }) => (
        (typeof where.email === 'string' ? where.email : where.email?.equals) === state.user.email
          && where.id?.not !== state.user.id
          ? { id: state.user.id }
          : null
      ),
      update: async ({ data }: { data: { email: string } }) => {
        state.user.email = data.email;
        return { name: state.user.name };
      },
    },
    emailChangeRequest: {
      findFirst: async ({ where }: { where: { userId?: string | { not: string }; activeUserId?: string; activeNewEmail?: string } }) => (
        state.requests.find((request) => (
          request.activeUserId
          && request.verifiedAt === null
          && request.cancelledAt === null
          && (typeof where.userId !== 'string' || request.userId === where.userId)
          && (typeof where.userId !== 'object' || request.userId !== where.userId.not)
          && (!where.activeUserId || request.activeUserId === where.activeUserId)
          && (!where.activeNewEmail || request.activeNewEmail === where.activeNewEmail)
        )) ?? null
      ),
      findUnique: async ({ where }: { where: { tokenHash: string } }) => (
        state.requests.find((request) => request.tokenHash === where.tokenHash) ?? null
      ),
      updateMany: async ({ where, data }: { where: { id?: string; userId?: string }; data: Partial<RequestRow> }) => {
        const matches = state.requests.filter((request) => (
          (!where.id || request.id === where.id)
          && (!where.userId || request.userId === where.userId)
          && request.activeUserId !== null
          && request.verifiedAt === null
          && request.cancelledAt === null
        ));
        for (const request of matches) Object.assign(request, data, { updatedAt: new Date() });
        return { count: matches.length };
      },
      create: async ({ data }: { data: Omit<RequestRow, 'id' | 'createdAt' | 'updatedAt' | 'verifiedAt' | 'cancelledAt'> }) => {
        const now = new Date();
        const request: RequestRow = {
          ...data,
          id: `request-${state.requests.length + 1}`,
          verifiedAt: null,
          cancelledAt: null,
          createdAt: now,
          updatedAt: now,
        };
        state.requests.push(request);
        return request;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RequestRow> }) => {
        const request = state.requests.find((item) => item.id === where.id);
        assert.ok(request);
        Object.assign(request, data, { updatedAt: new Date() });
        return request;
      },
    },
    session: {
      deleteMany: async ({ where }: { where: { userId: string; tokenHash: { not: string } } }) => {
        const before = state.sessions.length;
        state.sessions = state.sessions.filter((session) => (
          session.userId !== where.userId || session.tokenHash === where.tokenHash.not
        ));
        return { count: before - state.sessions.length };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        state.audits.push(data);
        return data;
      },
    },
    $transaction: async (operation: unknown) => (
      typeof operation === 'function'
        ? (operation as (client: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(operation as Promise<unknown>[])
    ),
  };

  const email = {
    passwordResetAvailable: async () => ({ available: true }),
    queueEmailChangeVerification: async (_communityId: string, _user: unknown, _email: string, token: string) => {
      state.verificationTokens.push(token);
    },
    queueEmailChangeRequestNotice: async () => {
      state.queuedNotices += 1;
    },
    queueEmailChangeCompleted: async () => {
      state.queuedCompletions += 1;
    },
  };
  const service = new EmailChangeService(
    prisma as never,
    { verifyWithoutUpgrade: async () => passwordValid } as never,
    email as never,
    { reserve: async () => undefined } as never,
  );
  return { service, state };
}

test('email helpers normalize, validate, hash, and mask without provider-specific rewriting', () => {
  assert.equal(normalizeEmail(' User.Name+tag@Example.COM '), 'user.name+tag@example.com');
  assert.equal(isValidEmail('user.name+tag@example.com'), true);
  assert.equal(isValidEmail('invalid'), false);
  assert.equal(maskEmail('user.name@example.com'), 'u***@example.com');
  assert.equal(hashEmailChangeToken('token').length, 64);
});

test('request keeps canonical email unchanged and queues verification plus old-address notice', async () => {
  const { service, state } = harness();
  await service.request(
    'user-1',
    'community-1',
    { currentPassword: 'audit-only-password', newEmail: 'New@Example.test' },
    '127.0.0.1',
  );
  assert.equal(state.user.email, 'old@example.test');
  assert.equal(state.requests[0]?.normalizedNewEmail, 'new@example.test');
  assert.equal(state.requests[0]?.tokenHash, hashEmailChangeToken(state.verificationTokens[0]!));
  assert.equal(state.queuedNotices, 1);
  assert.equal(state.audits.at(-1)?.action, 'account.email_change_requested');
});

test('wrong current password creates no request and queues no email', async () => {
  const { service, state } = harness(false);
  await assert.rejects(() => service.request(
    'user-1',
    'community-1',
    { currentPassword: 'wrong-password', newEmail: 'new@example.test' },
    '127.0.0.1',
  ));
  assert.equal(state.requests.length, 0);
  assert.equal(state.verificationTokens.length, 0);
  assert.equal(state.queuedNotices, 0);
});

test('new request invalidates the previous token and valid verification updates only email', async () => {
  const { service, state } = harness();
  await service.request('user-1', 'community-1', { currentPassword: 'password', newEmail: 'first@example.test' }, '127.0.0.1');
  const firstToken = state.verificationTokens[0]!;
  await service.request('user-1', 'community-1', { currentPassword: 'password', newEmail: 'second@example.test' }, '127.0.0.1');
  const secondToken = state.verificationTokens[1]!;

  await assert.rejects(() => service.verify('user-1', 'community-1', firstToken, 'current-session'));
  const result = await service.verify('user-1', 'community-1', secondToken, 'current-session');

  assert.equal(result.email, 'second@example.test');
  assert.deepEqual(state.sessions, [{ tokenHash: 'current-session', userId: 'user-1' }]);
  assert.equal(state.queuedCompletions, 1);
  assert.equal(state.audits.at(-1)?.action, 'account.email_changed');
});

test('email change source never stores or audits raw verification tokens or current passwords', async () => {
  const source = await readFile(new URL('../auth/email-change.service.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /tokenHash:\s*token[,}]/);
  assert.doesNotMatch(source, /metadata:\s*\{[^}]*currentPassword/s);
  assert.match(source, /tokenHash:\s*hashEmailChangeToken\(token\)/);
  assert.match(source, /passwords\.verifyWithoutUpgrade/);
});
