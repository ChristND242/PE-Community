import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from './password.service';

const passwords = new PasswordService({ currentPepper: 'authentication-test-pepper-with-32-bytes' });

test('successful legacy login upgrades with an old-hash condition and preserves the login response', async () => {
  const candidatePassword = 'Synthetic legacy login password';
  const legacyHash = await bcrypt.hash(candidatePassword, 4);
  const updateConditions: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user',
        email: 'synthetic@example.test',
        passwordHash: legacyHash,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        memberships: [{ communityId: 'community', role: {}, profile: null }],
      }),
      updateMany: async (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updateConditions.push(input.where);
        return { count: 1 };
      },
    },
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    passwords,
  );
  const internals = service as unknown as {
    communitySettings: () => Promise<Record<string, unknown>>;
    createSessionResponse: () => Promise<Record<string, unknown>>;
  };
  internals.communitySettings = async () => ({ twoFactorEnabled: false });
  internals.createSessionResponse = async () => ({ authenticated: true });

  const response = await service.login('synthetic@example.test', candidatePassword);

  assert.deepEqual(response, { authenticated: true });
  assert.deepEqual(updateConditions, [{ id: 'user', passwordHash: legacyHash }]);
});

test('failed legacy login does not attempt a hash upgrade', async () => {
  const legacyHash = await bcrypt.hash('Synthetic expected password', 4);
  let updateCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user',
        email: 'synthetic@example.test',
        passwordHash: legacyHash,
        memberships: [{ communityId: 'community' }],
      }),
      updateMany: async () => {
        updateCalled = true;
      },
    },
  };
  const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, passwords);

  await assert.rejects(service.login('synthetic@example.test', 'Incorrect synthetic password'));
  assert.equal(updateCalled, false);
});

test('inactive legacy account verification does not persist an upgrade', async () => {
  const candidatePassword = 'Synthetic inactive password';
  const legacyHash = await bcrypt.hash(candidatePassword, 4);
  let updateCalled = false;
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user',
        email: 'inactive@example.test',
        passwordHash: legacyHash,
        memberships: [],
      }),
      updateMany: async () => {
        updateCalled = true;
      },
    },
  };
  const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, passwords);

  await assert.rejects(service.login('inactive@example.test', candidatePassword));
  assert.equal(updateCalled, false);
});
