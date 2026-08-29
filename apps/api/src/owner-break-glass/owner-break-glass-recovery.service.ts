import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit/audit-log.service';
import { EmailService } from '../email/email.service';
import { realtimeSessionRegistry } from '../auth/realtime-session-registry';
import { PrismaService } from '../prisma/prisma.service';

export const OWNER_MFA_BREAK_GLASS_ACTION = 'auth.owner_mfa_break_glass_reset';
export const OWNER_MFA_BREAK_GLASS_FAILED_ACTION = 'auth.owner_mfa_break_glass_failed';

export type OwnerBreakGlassPreview = {
  userId: string;
  email: string;
  name: string;
  communityId: string;
  communityName: string;
  membershipId: string;
  role: 'owner';
  twoFactorEnabled: boolean;
  reenrollmentRequired: boolean;
  activeSessionCount: number;
  recoveryCodeCount: number;
  trustedMfaDeviceCount: 0;
};

export type OwnerBreakGlassResult = OwnerBreakGlassPreview & {
  auditLogId: string;
  revokedSessionCount: number;
  revokedRecoveryCodeCount: number;
  notificationQueued: boolean;
  notificationWarning?: string;
};

export class OwnerBreakGlassRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerBreakGlassRecoveryError';
  }
}

@Injectable()
export class OwnerBreakGlassRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly email: EmailService,
  ) {}

  async inspect(email: string): Promise<OwnerBreakGlassPreview> {
    return inspectOwner(this.prisma, normalizeOwnerEmail(email));
  }

  async recover(email: string): Promise<OwnerBreakGlassResult> {
    const normalizedEmail = normalizeOwnerEmail(email);
    const preview = await inspectOwner(this.prisma, normalizedEmail);
    let transactionResult: { auditLogId: string; revokedSessionCount: number; revokedRecoveryCodeCount: number };

    try {
      transactionResult = await this.prisma.$transaction(async (tx) => {
        const owner = await ownerForUpdate(tx, normalizedEmail);
        const sessions = await tx.session.deleteMany({ where: { userId: owner.userId } });
        const recoveryCodes = await tx.userTwoFactorBackupCode.deleteMany({ where: { userId: owner.userId } });
        await tx.user.update({
          where: { id: owner.userId },
          data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorConfirmedAt: null,
            twoFactorReenrollmentRequired: true,
          },
        });
        const audit = await tx.auditLog.create({
          data: {
            communityId: owner.communityId,
            actorUserId: null,
            action: OWNER_MFA_BREAK_GLASS_ACTION,
            targetType: 'User',
            targetId: owner.userId,
            metadata: breakGlassAuditMetadata(owner.email, sessions.count, recoveryCodes.count),
          },
        });
        return {
          auditLogId: audit.id,
          revokedSessionCount: sessions.count,
          revokedRecoveryCodeCount: recoveryCodes.count,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      realtimeSessionRegistry.revokeUser(preview.userId);
    } catch (error) {
      await this.recordFailedAttempt(preview, 'SECURITY_MUTATION_FAILED');
      throw new OwnerBreakGlassRecoveryError('Owner 2FA recovery could not be completed safely. No security state was changed.');
    }

    let notificationQueued = false;
    let notificationWarning: string | undefined;
    try {
      await this.email.queueOwnerMfaRecoveryEmail(preview.communityId, {
        id: preview.userId,
        email: preview.email,
        name: preview.name,
      });
      notificationQueued = true;
    } catch {
      notificationWarning = 'The security notification could not be queued; review email configuration.';
    }

    return { ...preview, ...transactionResult, notificationQueued, notificationWarning };
  }

  async recordFailedAttempt(preview: OwnerBreakGlassPreview, reason: 'SECRET_VERIFICATION_FAILED' | 'CONFIRMATION_ABORTED' | 'SECURITY_MUTATION_FAILED') {
    await this.auditLogs.recordBestEffort({
      communityId: preview.communityId,
      actorType: 'SYSTEM',
      actorLabel: 'Server CLI',
      category: 'SECURITY',
      action: OWNER_MFA_BREAK_GLASS_FAILED_ACTION,
      outcome: reason === 'CONFIRMATION_ABORTED' ? 'DENIED' : 'FAILURE',
      severity: 'HIGH',
      targetType: 'User',
      targetId: preview.userId,
      targetLabel: preview.email,
      reason,
      requestContext: { service: 'owner-disable-2fa-cli' },
      metadata: { source: 'CLI' },
    });
  }
}

export function normalizeOwnerEmail(email: string) {
  return email.trim().toLowerCase();
}

async function inspectOwner(prisma: PrismaService, email: string): Promise<OwnerBreakGlassPreview> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorReenrollmentRequired: true,
      memberships: {
        where: { role: { key: 'owner' } },
        select: { id: true, status: true, communityId: true, community: { select: { name: true } }, role: { select: { key: true } } },
      },
    },
  });
  if (!user) throw new OwnerBreakGlassRecoveryError('No exact Owner account was found for that email address.');
  if (user.memberships.length !== 1) {
    throw new OwnerBreakGlassRecoveryError(user.memberships.length === 0
      ? 'The exact account is not an Owner.'
      : 'The one-owned-community invariant is violated; recovery was aborted.');
  }
  const membership = user.memberships[0];
  if (membership.role.key !== 'owner' || membership.status !== MembershipStatus.ACTIVE) {
    throw new OwnerBreakGlassRecoveryError('The exact account does not have an active protected Owner membership.');
  }
  if (!user.twoFactorEnabled && !user.twoFactorSecret && !user.twoFactorReenrollmentRequired) {
    throw new OwnerBreakGlassRecoveryError('Owner 2FA is already disabled and no re-enrollment recovery is pending.');
  }
  const [activeSessionCount, recoveryCodeCount] = await Promise.all([
    prisma.session.count({ where: { userId: user.id } }),
    prisma.userTwoFactorBackupCode.count({ where: { userId: user.id, usedAt: null } }),
  ]);
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    communityId: membership.communityId,
    communityName: membership.community.name,
    membershipId: membership.id,
    role: 'owner',
    twoFactorEnabled: user.twoFactorEnabled,
    reenrollmentRequired: user.twoFactorReenrollmentRequired,
    activeSessionCount,
    recoveryCodeCount,
    trustedMfaDeviceCount: 0,
  };
}

async function ownerForUpdate(tx: Prisma.TransactionClient, email: string) {
  const user = await tx.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      memberships: {
        where: { role: { key: 'owner' } },
        select: { id: true, communityId: true, status: true, role: { select: { key: true } } },
      },
    },
  });
  if (!user || user.memberships.length !== 1) throw new OwnerBreakGlassRecoveryError('Owner validation changed before recovery could complete.');
  const membership = user.memberships[0];
  if (membership.status !== MembershipStatus.ACTIVE || membership.role.key !== 'owner') {
    throw new OwnerBreakGlassRecoveryError('Owner validation changed before recovery could complete.');
  }
  return { userId: user.id, email: user.email, communityId: membership.communityId };
}

function breakGlassAuditMetadata(email: string, revokedSessions: number, revokedRecoveryCodes: number): Prisma.InputJsonObject {
  return {
    source: 'CLI',
    revokedSessions,
    revokedRecoveryCodes,
    trustedMfaDevicesRevoked: 0,
    audit: {
      category: 'SECURITY',
      outcome: 'SUCCESS',
      severity: 'HIGH',
      actorType: 'SYSTEM',
      actorLabel: 'Server CLI',
      targetLabel: email,
      reason: 'SERVER_BREAK_GLASS_RECOVERY',
      changes: {
        mfaEnrollment: { to: 'RESET' },
        sessions: { to: 'REVOKED' },
        recoveryCodes: { to: 'REVOKED' },
        trustedMfaDevices: { to: 'NOT_SUPPORTED' },
        mfaReenrollment: { to: 'REQUIRED' },
      },
      requestContext: { service: 'owner-disable-2fa-cli' },
    },
  };
}
