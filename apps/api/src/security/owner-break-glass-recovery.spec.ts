import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { MembershipStatus } from '@prisma/client';
import {
  OWNER_MFA_BREAK_GLASS_ACTION,
  OwnerBreakGlassRecoveryService,
} from '../owner-break-glass/owner-break-glass-recovery.service';

test('recovery atomically resets MFA, revokes sessions/codes, requires re-enrollment, and audits', async () => {
  const harness = serviceHarness();
  const result = await harness.service.recover(' OWNER@EXAMPLE.COM ');

  assert.equal(harness.transactionCalls, 1);
  assert.deepEqual(harness.deletedSessionWhere, { userId: 'owner-id' });
  assert.deepEqual(harness.deletedRecoveryWhere, { userId: 'owner-id' });
  assert.deepEqual(harness.userUpdate, {
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorConfirmedAt: null,
    twoFactorReenrollmentRequired: true,
  });
  assert.equal(harness.auditData.action, OWNER_MFA_BREAK_GLASS_ACTION);
  const auditMetadata = harness.auditData.metadata as { audit: { severity: string; actorType: string; reason: string } };
  assert.equal(auditMetadata.audit.severity, 'HIGH');
  assert.equal(auditMetadata.audit.actorType, 'SYSTEM');
  assert.equal(auditMetadata.audit.reason, 'SERVER_BREAK_GLASS_RECOVERY');
  assert.equal(result.notificationQueued, true);
  assert.equal(harness.emailCalls, 1);
  assert.deepEqual([...new Set(harness.touchedDelegateNames)].sort(), ['auditLog', 'session', 'user', 'userTwoFactorBackupCode']);

  const serializedAudit = JSON.stringify(harness.auditData);
  assert.doesNotMatch(serializedAudit, /totp-secret|recovery-code-value|session-token|break-glass-secret|password/i);
});

test('non-Owner, missing Owner, and violated one-owner invariant abort before transaction', async () => {
  for (const memberships of [[], [ownerMembership(), ownerMembership('second-community')]]) {
    const harness = serviceHarness({ memberships });
    await assert.rejects(harness.service.inspect('owner@example.com'), /not an Owner|invariant is violated/);
    assert.equal(harness.transactionCalls, 0);
  }

  const missing = serviceHarness({ user: null });
  await assert.rejects(missing.service.inspect('unknown@example.com'), /No exact Owner account/);
  assert.equal(missing.transactionCalls, 0);
});

test('inactive Owner and normally disabled 2FA abort before mutation', async () => {
  const inactive = serviceHarness({ memberships: [{ ...ownerMembership(), status: MembershipStatus.SUSPENDED }] });
  await assert.rejects(inactive.service.inspect('owner@example.com'), /active protected Owner/);

  const disabled = serviceHarness({ twoFactorEnabled: false, twoFactorSecret: null, reenrollmentRequired: false });
  await assert.rejects(disabled.service.inspect('owner@example.com'), /already disabled/);
});

test('critical transaction failure aborts safely and records a failed event', async () => {
  const harness = serviceHarness({ transactionFailure: true });
  await assert.rejects(harness.service.recover('owner@example.com'), /No security state was changed/);
  assert.equal(harness.failedAuditCalls, 1);
  assert.equal(harness.emailCalls, 0);
});

test('email failure does not roll back completed recovery', async () => {
  const harness = serviceHarness({ emailFailure: true });
  const result = await harness.service.recover('owner@example.com');
  assert.equal(harness.transactionCalls, 1);
  assert.equal(result.notificationQueued, false);
  assert.match(result.notificationWarning ?? '', /could not be queued/);
});

test('source contract has no remote break-glass controller or UI action', async () => {
  const [authController, adminController, loginPage] = await Promise.all([
    readFile(resolve(__dirname, '../auth/auth.controller.ts'), 'utf8'),
    readFile(resolve(__dirname, '../admin/admin.controller.ts'), 'utf8'),
    readFile(resolve(__dirname, '../../../web/app/login/page.tsx'), 'utf8'),
  ]);
  const remoteSurface = `${authController}\n${adminController}`;
  assert.doesNotMatch(remoteSurface, /owner[^\n]*(disable|reset)[^\n]*2fa|break.?glass/i);
  assert.doesNotMatch(loginPage, /owner:disable-2fa|OWNER_BREAK_GLASS_SECRET|RESET OWNER 2FA/);
});

function ownerMembership(communityId = 'community-id') {
  return {
    id: `membership-${communityId}`,
    status: MembershipStatus.ACTIVE,
    communityId,
    community: { name: 'Operations' },
    role: { key: 'owner' },
  };
}

function serviceHarness(options: {
  user?: Record<string, unknown> | null;
  memberships?: ReturnType<typeof ownerMembership>[];
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  reenrollmentRequired?: boolean;
  transactionFailure?: boolean;
  emailFailure?: boolean;
} = {}) {
  const touchedDelegateNames: string[] = [];
  let transactionCalls = 0;
  let emailCalls = 0;
  let failedAuditCalls = 0;
  let deletedSessionWhere: unknown;
  let deletedRecoveryWhere: unknown;
  let userUpdate: unknown;
  let auditData: Record<string, unknown> = {};
  const user = options.user === null ? null : {
    id: 'owner-id',
    email: 'owner@example.com',
    name: 'Owner',
    twoFactorEnabled: options.twoFactorEnabled ?? true,
    twoFactorSecret: options.twoFactorSecret === undefined ? 'totp-secret' : options.twoFactorSecret,
    twoFactorReenrollmentRequired: options.reenrollmentRequired ?? false,
    memberships: options.memberships ?? [ownerMembership()],
    ...(options.user ?? {}),
  };
  const tx = {
    user: {
      async findUnique() { touchedDelegateNames.push('user'); return user; },
      async update(input: { data: unknown }) { touchedDelegateNames.push('user'); userUpdate = input.data; return user; },
    },
    session: {
      async deleteMany(input: { where: unknown }) { touchedDelegateNames.push('session'); deletedSessionWhere = input.where; return { count: 2 }; },
    },
    userTwoFactorBackupCode: {
      async deleteMany(input: { where: unknown }) { touchedDelegateNames.push('userTwoFactorBackupCode'); deletedRecoveryWhere = input.where; return { count: 5 }; },
    },
    auditLog: {
      async create(input: { data: Record<string, unknown> }) { touchedDelegateNames.push('auditLog'); auditData = input.data; return { id: 'audit-id' }; },
    },
  };
  const prisma = {
    user: { async findUnique() { return user; } },
    session: { async count() { return 2; } },
    userTwoFactorBackupCode: { async count() { return 5; } },
    async $transaction(callback: (client: typeof tx) => Promise<unknown>) {
      transactionCalls += 1;
      if (options.transactionFailure) throw new Error('synthetic transaction failure');
      return callback(tx);
    },
  };
  const audit = { async recordBestEffort() { failedAuditCalls += 1; } };
  const email = {
    async queueOwnerMfaRecoveryEmail() {
      emailCalls += 1;
      if (options.emailFailure) throw new Error('synthetic email failure');
    },
  };
  const service = new OwnerBreakGlassRecoveryService(prisma as never, audit as never, email as never);
  return {
    service,
    touchedDelegateNames,
    get transactionCalls() { return transactionCalls; },
    get emailCalls() { return emailCalls; },
    get failedAuditCalls() { return failedAuditCalls; },
    get deletedSessionWhere() { return deletedSessionWhere; },
    get deletedRecoveryWhere() { return deletedRecoveryWhere; },
    get userUpdate() { return userUpdate; },
    get auditData() { return auditData; },
  };
}
