import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../admin/admin.service';
import { PasswordService } from './password.service';

const passwordService = new PasswordService({ currentPepper: 'registration-test-pepper-with-32-bytes' });

test('registration approval fails closed when no secure password hash exists', async () => {
  let transactionCalled = false;
  const prisma = {
    registrationApplication: {
      findFirst: async () => registrationApplication(null),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  };
  const service = adminService(prisma);

  await assert.rejects(
    service.review('community', 'application', 'actor', 'APPROVED'),
    BadRequestException,
  );
  assert.equal(transactionCalled, false);
});

test('registration approval accepts legacy bcrypt format and clears the retained hash', async () => {
  const legacyHash = `$2a$12$${'a'.repeat(53)}`;
  const updates: Array<Record<string, unknown>> = [];
  const tx = registrationTransaction(updates);
  const prisma = {
    registrationApplication: { findFirst: async () => registrationApplication(legacyHash) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };
  const service = adminService(prisma);

  await service.review('community', 'application', 'actor', 'APPROVED');

  assert.deepEqual(updates[0], {
    status: 'APPROVED',
    reviewedAt: updates[0].reviewedAt,
    reviewedBy: 'actor',
    passwordHash: null,
  });
  assert.equal((tx.user.create as { lastCreate?: { passwordHash?: string } }).lastCreate?.passwordHash, legacyHash);
});

test('registration rejection clears the retained password hash', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const tx = registrationTransaction(updates);
  const prisma = {
    registrationApplication: { findFirst: async () => registrationApplication(`$2a$12$${'a'.repeat(53)}`) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  };

  await adminService(prisma).review('community', 'application', 'actor', 'REJECTED');
  assert.equal(updates[0].passwordHash, null);
});

function adminService(prisma: object) {
  return new AdminService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    passwordService,
    {} as never,
    { queueRegistrationApproval: async () => undefined } as never,
  );
}

function registrationApplication(passwordHash: string | null) {
  return {
    id: 'application',
    communityId: 'community',
    email: 'synthetic@example.test',
    normalizedEmail: 'synthetic@example.test',
    name: 'Synthetic Applicant',
    sex: null,
    note: 'Synthetic test application',
    passwordHash,
    status: 'PENDING' as const,
    submissionAttemptCount: 1,
    lastSubmissionAttemptAt: new Date(0),
    lastReminderQueuedAt: null,
    lastSecurityNoticeQueuedAt: null,
    lastNotificationSuppressedAt: null,
    lastNotificationSuppressionReason: null,
    lastIpHash: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: new Date(0),
    inviteLinkId: null,
  };
}

function registrationTransaction(updates: Array<Record<string, unknown>>) {
  const userCreate = async (input: { data: { passwordHash?: string } }) => {
    userCreate.lastCreate = input.data;
    return { id: 'user' };
  };
  userCreate.lastCreate = undefined as { passwordHash?: string } | undefined;

  return {
    registrationApplication: {
      updateMany: async (input: { where: { id?: string }; data: Record<string, unknown> }) => {
        if (input.where.id === 'application') {
          updates.push(input.data);
          return { count: 1 };
        }
        return { count: 0 };
      },
      update: async (input: { data: Record<string, unknown> }) => {
        return { ...registrationApplication(null), ...input.data };
      },
      findUniqueOrThrow: async () => registrationApplication(null),
    },
    role: { findUniqueOrThrow: async () => ({ id: 'role' }) },
    user: { findFirst: async () => null, create: userCreate, update: async () => ({ id: 'user' }) },
    membership: { upsert: async () => ({ id: 'membership' }) },
    memberProfile: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    auditLog: { create: async () => ({}) },
  };
}
