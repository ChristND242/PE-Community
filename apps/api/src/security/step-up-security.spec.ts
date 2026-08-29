import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PasskeyChallengeService, PasskeyRateLimitException } from '../auth/passkey-challenge.service';
import { StepUpController } from '../auth/step-up.controller';
import { STEP_UP_AUTH_TTL_MS, StepUpService } from '../auth/step-up.service';

const authDirectory = new URL('../auth/', import.meta.url);
const schemaUrl = new URL('../../../../prisma/schema.prisma', import.meta.url);
const migrationUrl = new URL('../../../../prisma/migrations/20260830000000_passkey_step_up/migration.sql', import.meta.url);

class MemoryRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  async set(key: string, value: string, _mode: string, ttl: number) {
    this.values.set(key, value);
    this.expirations.set(key, ttl);
    return 'OK';
  }
  async eval(script: string, _keyCount: number, key: string, ...args: string[]) {
    if (script.includes("redis.call('GET'")) {
      const value = this.values.get(key) ?? null;
      this.values.delete(key);
      return value;
    }
    const current = Number(this.values.get(key) ?? '0') + 1;
    this.values.set(key, String(current));
    return [current, Number(args[0])];
  }
  async quit() { return 'OK'; }
  disconnect() {}
}

const requestUser = {
  id: 'user-a', email: 'a@example.test', name: 'A', communityId: 'community-a',
  community: { defaultLanguage: 'en', timezone: 'UTC' }, role: 'owner', permissions: [],
  sessionId: 'session-a', emailVerified: true,
};

test('step-up attempts are five-minute, ceremony-bound, session-bound, and single-use', async () => {
  const redis = new MemoryRedis();
  const challenges = new PasskeyChallengeService(redis as never);
  const attemptId = await challenges.createStepUpAttempt({
    challenge: 'step-up-challenge', userId: 'user-a', sessionId: 'session-a',
  });
  assert.equal([...redis.expirations.values()][0], 300);
  assert.equal(await challenges.consumeAuthenticationAttempt(attemptId), null);
  assert.equal(await challenges.consumeStepUpAttempt(attemptId, 'user-b', 'session-a'), null);
  assert.equal(await challenges.consumeStepUpAttempt(attemptId, 'user-a', 'session-a'), null);

  const replayId = await challenges.createStepUpAttempt({
    challenge: 'single-use', userId: 'user-a', sessionId: 'session-a',
  });
  assert.equal((await challenges.consumeStepUpAttempt(replayId, 'user-a', 'session-a'))?.challenge, 'single-use');
  assert.equal(await challenges.consumeStepUpAttempt(replayId, 'user-a', 'session-a'), null);
});

test('step-up endpoints require an active authenticated session before ceremony work', async () => {
  const auth = {
    cookieName: 'pe_session',
    userFromCookie: async () => { throw new UnauthorizedException('Authentication required.'); },
  };
  const controller = new StepUpController(auth as never, {} as never, {} as never);
  const request = { cookies: {}, get: () => 'https://community.example.com' };
  const response = { setHeader: () => undefined };
  await assert.rejects(controller.status(request as never), UnauthorizedException);
  await assert.rejects(controller.password(request as never, response as never, {}), UnauthorizedException);
  await assert.rejects(controller.passkeyOptions(request as never, response as never), UnauthorizedException);
  await assert.rejects(controller.passkeyVerify(request as never, response as never, {}), UnauthorizedException);
});

test('password step-up rate limits repeated attempts', async () => {
  const challenges = new PasskeyChallengeService(new MemoryRedis() as never);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await challenges.enforceRateLimit('step-up-password', 'user-a:session-a:127.0.0.1', 8, 300);
  }
  await assert.rejects(
    challenges.enforceRateLimit('step-up-password', 'user-a:session-a:127.0.0.1', 8, 300),
    PasskeyRateLimitException,
  );
});

test('recent authentication is marked and enforced only on the current session', async () => {
  const sessions = new Map<string, { userId: string; stepUpAuthenticatedAt: Date | null; stepUpMethod: string | null }>([
    ['session-a', { userId: 'user-a', stepUpAuthenticatedAt: null, stepUpMethod: null }],
    ['session-b', { userId: 'user-a', stepUpAuthenticatedAt: null, stepUpMethod: null }],
  ]);
  const prisma = {
    session: {
      updateMany: async ({ where, data }: any) => {
        const session = sessions.get(where.id);
        if (!session || session.userId !== where.userId) return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      },
      findFirst: async ({ where }: any) => {
        const session = sessions.get(where.id);
        if (!session || session.userId !== where.userId) return null;
        if (where.stepUpAuthenticatedAt && (!session.stepUpAuthenticatedAt || session.stepUpAuthenticatedAt <= where.stepUpAuthenticatedAt.gt)) return null;
        if (where.stepUpMethod && !where.stepUpMethod.in.includes(session.stepUpMethod)) return null;
        return { id: where.id };
      },
    },
  };
  const service = new StepUpService(prisma as never, {} as never, {} as never, { recordBestEffort: async () => undefined } as never);
  await assert.rejects(service.requireRecent(requestUser), ForbiddenException);
  await service.markAuthenticated(requestUser, 'PASSKEY');
  await assert.doesNotReject(service.requireRecent(requestUser));
  assert.equal(sessions.get('session-b')?.stepUpAuthenticatedAt, null);
  sessions.get('session-a')!.stepUpAuthenticatedAt = new Date(Date.now() - STEP_UP_AUTH_TTL_MS - 1);
  await assert.rejects(service.requireRecent(requestUser), ForbiddenException);
});

test('password step-up uses the centralized verifier and is rate-limited by user, session, and source', async () => {
  const calls: string[] = [];
  const prisma = {
    user: { findUnique: async () => ({ passwordHash: 'stored' }) },
    session: {
      updateMany: async () => ({ count: 1 }),
      findFirst: async () => ({ stepUpAuthenticatedAt: new Date(), stepUpMethod: 'PASSWORD' }),
    },
    passkeyCredential: { count: async () => 0 },
  };
  const challenges = { enforceRateLimit: async (_scope: string, reference: string) => calls.push(reference) };
  const failed = new StepUpService(prisma as never, { verifyWithoutUpgrade: async () => false } as never, challenges as never, { recordBestEffort: async () => undefined } as never);
  await assert.rejects(failed.verifyPassword(requestUser, 'wrong', '127.0.0.1'), ForbiddenException);
  const success = new StepUpService(prisma as never, { verifyWithoutUpgrade: async () => true } as never, challenges as never, { recordBestEffort: async () => undefined } as never);
  await success.verifyPassword(requestUser, 'correct', '127.0.0.1');
  assert.ok(calls.every((reference) => reference === 'user-a:session-a:127.0.0.1'));
});

test('passkey step-up is account-bound, UV-required, replay-safe, and reuses counter CAS', async () => {
  const source = await readFile(new URL('passkey.service.ts', authDirectory), 'utf8');
  const options = source.slice(source.indexOf('async stepUpOptions('), source.indexOf('async verifyStepUp('));
  const verify = source.slice(source.indexOf('async verifyStepUp('), source.indexOf('async registrationOptions('));
  const shared = source.slice(source.indexOf('private async verifyAuthenticationCredential('), source.indexOf('private async recordAuthenticationFailure('));
  assert.match(options, /where: \{ userId: user\.id, revokedAt: null \}/);
  assert.match(options, /allowCredentials: credentials\.map/);
  assert.match(options, /userVerification: 'required'/);
  assert.match(options, /userId: user\.id/);
  assert.match(options, /sessionId: user\.sessionId/);
  assert.match(verify, /consumeStepUpAttempt\(attemptId, user\.id, user\.sessionId\)/);
  assert.match(verify, /requestContext, user/);
  assert.match(shared, /expectedUser && credential\.userId !== expectedUser\.id/);
  assert.match(shared, /requireUserVerification: true/);
  assert.match(shared, /counter: credential\.counter/);
  assert.match(shared, /lastUsedAt: new Date\(\)/);
});

test('sensitive endpoints enforce one shared recent-auth primitive after normal authentication and RBAC', async () => {
  const [authController, meController, passkeyController, adminController] = await Promise.all([
    readFile(new URL('auth.controller.ts', authDirectory), 'utf8'),
    readFile(new URL('me.controller.ts', authDirectory), 'utf8'),
    readFile(new URL('passkey.controller.ts', authDirectory), 'utf8'),
    readFile(new URL('../admin/admin.controller.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(authController, /changeRequiredPassword[\s\S]*stepUp\.requireRecent\(user\)/);
  assert.match(authController, /requestEmailChange[\s\S]*stepUp\.requireRecent\(user\)/);
  for (const method of ['setupTwoFactor', 'verifyTwoFactor', 'disableTwoFactor', 'regenerateBackupCodes']) {
    assert.match(meController, new RegExp(`${method}[\\s\\S]*stepUp\\.requireRecent\\(user\\)`));
  }
  assert.match(passkeyController, /registrationOptions[\s\S]*stepUp\.requireRecent\(user\)/);
  assert.match(passkeyController, /registrationVerify[\s\S]*stepUp\.requireRecent\(user\)/);
  assert.match(passkeyController, /async remove[\s\S]*stepUp\.requireRecent\(user\)/);
  for (const method of ['resetMemberPassword', 'resetMemberTwoFactor', 'suspendMember', 'removeMember', 'changeRole', 'updateRolePermissions']) {
    assert.match(adminController, new RegExp(`${method}[\\s\\S]*requireAdminPermission[\\s\\S]*stepUp\\.requireRecent\\(user\\)`));
  }
});

test('session migration is additive and stores no reusable proof', async () => {
  const [schema, migration] = await Promise.all([readFile(schemaUrl, 'utf8'), readFile(migrationUrl, 'utf8')]);
  assert.match(schema, /stepUpAuthenticatedAt\s+DateTime\?/);
  assert.match(schema, /stepUpMethod\s+String\?/);
  assert.match(migration, /ADD COLUMN "stepUpAuthenticatedAt" TIMESTAMP\(3\)/);
  assert.match(migration, /ADD COLUMN "stepUpMethod" TEXT/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});
