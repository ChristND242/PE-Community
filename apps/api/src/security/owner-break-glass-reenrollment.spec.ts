import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSecret, generateSync } from 'otplib';
import { AuthService } from '../auth/auth.service';

test('password login for a recovered Owner returns only a re-enrollment challenge and creates no session', async () => {
  let sessionCreated = false;
  const signedPayloads: unknown[] = [];
  const prisma = {
    user: {
      async findUnique() {
        return {
          id: 'owner-id',
          email: 'owner@example.com',
          passwordHash: 'synthetic-hash',
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorReenrollmentRequired: true,
          memberships: [{ communityId: 'community-id', role: { key: 'owner' }, profile: null }],
        };
      },
    },
  };
  const jwt = {
    async signAsync(payload: unknown) { signedPayloads.push(payload); return 'reenrollment-token'; },
  };
  const passwords = { async verify() { return { valid: true, needsRehash: false }; } };
  const service = authService(prisma, jwt, passwords);
  (service as unknown as { createSessionResponse: () => Promise<unknown> }).createSessionResponse = async () => {
    sessionCreated = true;
    return {};
  };

  const result = await service.login('owner@example.com', 'synthetic-password');

  assert.deepEqual(result, {
    twoFactorReenrollmentRequired: true,
    reenrollmentToken: 'reenrollment-token',
    user: { email: 'owner@example.com' },
  });
  assert.equal(sessionCreated, false);
  assert.deepEqual(signedPayloads, [{ purpose: 'owner-2fa-reenrollment', sub: 'owner-id', communityId: 'community-id' }]);
});

test('re-enrollment clears the required state only after valid TOTP verification and generates fresh recovery codes', async () => {
  const secret = generateSecret();
  const code = generateSync({ secret });
  const writes: Array<{ operation: string; input: unknown }> = [];
  let sessionCreated = false;
  const owner = {
    id: 'owner-id',
    email: 'owner@example.com',
    twoFactorSecret: secret,
    twoFactorReenrollmentRequired: true,
    memberships: [{ communityId: 'community-id' }],
  };
  const tx = {
    user: {
      async updateMany(input: unknown) { writes.push({ operation: 'user.updateMany', input }); return { count: 1 }; },
    },
    userTwoFactorBackupCode: {
      async deleteMany(input: unknown) { writes.push({ operation: 'backup.deleteMany', input }); return { count: 0 }; },
      async createMany(input: unknown) { writes.push({ operation: 'backup.createMany', input }); return { count: 10 }; },
    },
    auditLog: {
      async create(input: unknown) { writes.push({ operation: 'audit.create', input }); return { id: 'audit-id' }; },
    },
  };
  const prisma = {
    user: { async findUnique() { return owner; } },
    async $transaction(callback: (client: typeof tx) => Promise<unknown>) { return callback(tx); },
  };
  const jwt = {
    async verifyAsync() { return { purpose: 'owner-2fa-reenrollment', sub: 'owner-id', communityId: 'community-id' }; },
  };
  const service = authService(prisma, jwt, {});
  (service as unknown as { createSessionResponse: () => Promise<unknown> }).createSessionResponse = async () => {
    sessionCreated = true;
    return { jwtToken: 'new-session', user: { role: 'owner' } };
  };

  await assert.rejects(service.completeOwnerTwoFactorReenrollment('challenge', '000000'), /Invalid authentication code/);
  assert.equal(writes.length, 0);
  assert.equal(sessionCreated, false);

  const result = await service.completeOwnerTwoFactorReenrollment('challenge', code);
  const userWrite = writes.find((entry) => entry.operation === 'user.updateMany')?.input as {
    data: { twoFactorEnabled: boolean; twoFactorConfirmedAt: Date; twoFactorReenrollmentRequired: boolean };
  };
  const backupWrite = writes.find((entry) => entry.operation === 'backup.createMany')?.input as { data: unknown[] };
  assert.deepEqual(userWrite.data, {
    twoFactorEnabled: true,
    twoFactorConfirmedAt: userWrite.data.twoFactorConfirmedAt,
    twoFactorReenrollmentRequired: false,
  });
  assert.equal(backupWrite.data.length, 10);
  assert.equal(result.backupCodes.length, 10);
  assert.equal(sessionCreated, true);
});

function authService(prisma: object, jwt: object, passwords: object) {
  return new AuthService(
    prisma as never,
    jwt as never,
    {} as never,
    {} as never,
    passwords as never,
    {} as never,
    {} as never,
  );
}
