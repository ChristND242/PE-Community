import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../security/password.service';
import type { AuditRequestContext } from '../audit/audit-log.service';
import { EmailChangeRateLimitService } from './email-change-rate-limit.service';
import { SecurityActivityService } from './security-activity.service';
import { realtimeSessionRegistry } from './realtime-session-registry';

export const EMAIL_CHANGE_EXPIRES_MINUTES = 45;
const emailUnavailableResponse = { code: 'EMAIL_UNAVAILABLE', message: 'This email address cannot be used.' };
const invalidTokenMessage = 'Invalid or expired email verification link.';

@Injectable()
export class EmailChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly email: EmailService,
    private readonly rateLimits: EmailChangeRateLimitService,
    private readonly securityActivity: SecurityActivityService,
  ) {}

  async status(userId: string) {
    await this.expireRequests({ activeUserId: userId });
    const [user, request] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerifiedAt: true } }),
      this.prisma.emailChangeRequest.findFirst({
        where: {
          userId,
          activeUserId: userId,
          verifiedAt: null,
          cancelledAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      currentEmail: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      pending: request && normalizeEmail(request.normalizedNewEmail) !== normalizeEmail(user.email) ? {
        requestId: request.id,
        maskedNewEmail: maskEmail(request.normalizedNewEmail),
        expiresAt: request.expiresAt,
        canResendAt: new Date(request.updatedAt.getTime() + 5 * 60 * 1000),
      } : null,
    };
  }

  async sendPrimaryVerification(userId: string, communityId: string, ipAddress: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true };
    const activeEmailChange = await this.prisma.emailChangeRequest.findFirst({
      where: { userId, activeUserId: userId, verifiedAt: null, cancelledAt: null },
    });
    if (activeEmailChange && normalizeEmail(activeEmailChange.normalizedNewEmail) !== normalizeEmail(user.email)) {
      throw new BadRequestException('Complete or cancel the pending email change before verifying the current address.');
    }
    const availability = await this.email.passwordResetAvailable(communityId);
    if (!availability.available) throw new BadRequestException('Email delivery is not configured.');
    await this.rateLimits.reserve(userId, ipAddress);
    const { token, requestId, expiresAt } = await this.replacePrimaryVerificationRequest(user, communityId, 'account.email_verification_requested');
    await this.email.queuePrimaryEmailVerification(communityId, user, token);
    return { ok: true, requestId, expiresAt };
  }

  async queueRegistrationApproval(
    communityId: string,
    user: { id: string; email: string; name: string; emailVerifiedAt: Date | null },
  ) {
    if (user.emailVerifiedAt) {
      await this.email.queueRegistrationApprovedEmail(communityId, user, null);
      return { verificationRequired: false };
    }
    const { token } = await this.replacePrimaryVerificationRequest(user, communityId, 'account.email_verification_queued');
    await this.email.queueRegistrationApprovedEmail(communityId, user, token);
    return { verificationRequired: true };
  }

  async verifyPrimary(rawToken: unknown) {
    const token = requiredString(rawToken);
    if (!token || token.length > 256) throw new BadRequestException(invalidTokenMessage);
    const request = await this.prisma.emailChangeRequest.findUnique({
      where: { tokenHash: hashEmailChangeToken(token) },
      include: { user: { include: { memberships: { where: { status: 'ACTIVE' }, include: { role: true } } } } },
    });
    const normalizedEmail = request ? normalizeEmail(request.normalizedNewEmail) : '';
    if (
      !request
      || request.currentEmail !== request.normalizedNewEmail
      || normalizeEmail(request.user.email) !== normalizedEmail
      || request.user.emailVerifiedAt
      || request.verifiedAt
      || request.cancelledAt
      || request.expiresAt <= new Date()
    ) {
      throw new BadRequestException(invalidTokenMessage);
    }
    const membership = request.user.memberships[0];
    if (!membership) throw new BadRequestException(invalidTokenMessage);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailChangeRequest.updateMany({
        where: {
          id: request.id,
          userId: request.userId,
          tokenHash: request.tokenHash,
          currentEmail: normalizedEmail,
          normalizedNewEmail: normalizedEmail,
          verifiedAt: null,
          cancelledAt: null,
          expiresAt: { gt: now },
          activeUserId: request.userId,
        },
        data: { verifiedAt: now, activeUserId: null, activeNewEmail: null },
      });
      if (consumed.count !== 1) throw new BadRequestException(invalidTokenMessage);
      await tx.user.update({
        where: { id: request.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.auditLog.create({
        data: {
          communityId: membership.communityId,
          actorUserId: request.userId,
          action: 'account.email_verified',
          targetType: 'User',
          targetId: request.userId,
          metadata: { requestId: request.id },
        },
      });
    });
    return { ok: true, role: membership.role.key };
  }

  async request(userId: string, communityId: string, input: Record<string, unknown>, ipAddress: string) {
    const currentPassword = requiredString(input.currentPassword);
    const normalizedNewEmail = normalizeEmail(input.newEmail);
    if (!currentPassword) throw new BadRequestException({ code: 'INVALID_CREDENTIALS', message: 'Unable to verify current credentials.' });
    if (!isValidEmail(normalizedNewEmail)) throw new BadRequestException('A valid email address is required.');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, passwordHash: true },
    });
    const passwordResult = await this.passwords.verifyWithoutUpgrade(user.passwordHash, currentPassword);
    if (!passwordResult) {
      await this.auditFailure(communityId, userId, 'INVALID_CREDENTIALS');
      throw new BadRequestException({ code: 'INVALID_CREDENTIALS', message: 'Unable to verify current credentials.' });
    }
    if (normalizeEmail(user.email) === normalizedNewEmail) throw new BadRequestException(emailUnavailableResponse);
    await this.expireRequests({
      OR: [{ activeUserId: userId }, { activeNewEmail: normalizedNewEmail }],
    });
    await this.ensureEmailAvailable(userId, normalizedNewEmail);

    const availability = await this.email.passwordResetAvailable(communityId);
    if (!availability.available) throw new BadRequestException('Email delivery is not configured.');
    try {
      await this.rateLimits.reserve(userId, ipAddress);
    } catch (error) {
      await this.auditFailure(communityId, userId, 'RATE_LIMITED');
      throw error;
    }
    const token = createEmailChangeToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_EXPIRES_MINUTES * 60 * 1000);
    let request;
    try {
      request = await this.prisma.$transaction(async (tx) => {
        await tx.emailChangeRequest.updateMany({
          where: { userId, activeUserId: userId, verifiedAt: null, cancelledAt: null },
          data: { cancelledAt: now, activeUserId: null, activeNewEmail: null },
        });
        const created = await tx.emailChangeRequest.create({
          data: {
            userId,
            currentEmail: normalizeEmail(user.email),
            normalizedNewEmail,
            tokenHash: hashEmailChangeToken(token),
            expiresAt,
            activeUserId: userId,
            activeNewEmail: normalizedNewEmail,
          },
        });
        await tx.auditLog.create({
          data: {
            communityId,
            actorUserId: userId,
            action: 'account.email_change_requested',
            targetType: 'EmailChangeRequest',
            targetId: created.id,
            metadata: { oldEmail: maskEmail(user.email), newEmail: maskEmail(normalizedNewEmail) },
          },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException(emailUnavailableResponse);
      throw error;
    }

    await Promise.all([
      this.email.queueEmailChangeVerification(communityId, user, normalizedNewEmail, token),
      this.email.queueEmailChangeRequestNotice(communityId, user, normalizedNewEmail),
    ]);
    return {
      requestId: request.id,
      maskedNewEmail: maskEmail(normalizedNewEmail),
      expiresAt: request.expiresAt,
      canResendAt: new Date(request.updatedAt.getTime() + 5 * 60 * 1000),
    };
  }

  async resend(userId: string, communityId: string, ipAddress: string) {
    const request = await this.activeRequest(userId);
    try {
      await this.rateLimits.reserve(userId, ipAddress);
    } catch (error) {
      await this.auditFailure(communityId, userId, 'RATE_LIMITED');
      throw error;
    }
    const token = createEmailChangeToken();
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_EXPIRES_MINUTES * 60 * 1000);
    const { updated, user } = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailChangeRequest.updateMany({
        where: {
          id: request.id,
          userId,
          activeUserId: userId,
          verifiedAt: null,
          cancelledAt: null,
        },
        data: { tokenHash: hashEmailChangeToken(token), expiresAt },
      });
      if (claimed.count !== 1) throw new BadRequestException('No pending email change request was found.');
      const [updated, user] = await Promise.all([
        tx.emailChangeRequest.findUniqueOrThrow({ where: { id: request.id } }),
        tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, email: true, name: true },
        }),
      ]);
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId: userId,
          action: 'account.email_change_verification_resent',
          targetType: 'EmailChangeRequest',
          targetId: request.id,
          metadata: { newEmail: maskEmail(request.normalizedNewEmail) },
        },
      });
      return { updated, user };
    });
    await this.email.queueEmailChangeVerification(communityId, user, request.normalizedNewEmail, token);
    return {
      requestId: updated.id,
      maskedNewEmail: maskEmail(updated.normalizedNewEmail),
      expiresAt: updated.expiresAt,
      canResendAt: new Date(updated.updatedAt.getTime() + 5 * 60 * 1000),
    };
  }

  async cancel(userId: string, communityId: string) {
    const request = await this.activeRequest(userId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.emailChangeRequest.updateMany({
        where: {
          id: request.id,
          userId,
          activeUserId: userId,
          verifiedAt: null,
          cancelledAt: null,
        },
        data: { cancelledAt: now, activeUserId: null, activeNewEmail: null },
      });
      if (cancelled.count !== 1) throw new BadRequestException('No pending email change request was found.');
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId: userId,
          action: 'account.email_change_cancelled',
          targetType: 'EmailChangeRequest',
          targetId: request.id,
          metadata: { newEmail: maskEmail(request.normalizedNewEmail) },
        },
      });
    });
    return { ok: true };
  }

  async verify(
    userId: string,
    communityId: string,
    rawToken: unknown,
    currentSessionTokenHash: string,
    requestContext?: AuditRequestContext,
  ) {
    const token = requiredString(rawToken);
    if (!token || token.length > 256) throw new BadRequestException(invalidTokenMessage);
    const request = await this.prisma.emailChangeRequest.findUnique({
      where: { tokenHash: hashEmailChangeToken(token) },
    });
    if (!request || request.userId !== userId || request.verifiedAt || request.cancelledAt || request.expiresAt <= new Date()) {
      throw new BadRequestException(invalidTokenMessage);
    }

    const now = new Date();
    const currentSession = await this.prisma.session.findUnique({
      where: { tokenHash: currentSessionTokenHash },
      select: { id: true },
    });
    let result: { oldEmail: string; newEmail: string; userName: string; revokedSessionCount: number };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.emailChangeRequest.updateMany({
          where: {
            id: request.id,
            userId,
            tokenHash: request.tokenHash,
            activeUserId: userId,
            activeNewEmail: request.normalizedNewEmail,
            verifiedAt: null,
            cancelledAt: null,
            expiresAt: { gt: now },
          },
          data: { verifiedAt: now, activeUserId: null, activeNewEmail: null },
        });
        if (consumed.count !== 1) throw new BadRequestException(invalidTokenMessage);
        const unavailable = await tx.user.findFirst({
          where: { email: { equals: request.normalizedNewEmail, mode: 'insensitive' }, id: { not: userId } },
          select: { id: true },
        });
        if (unavailable) throw new ConflictException(emailUnavailableResponse);
        const user = await tx.user.update({
          where: { id: userId },
          data: { email: request.normalizedNewEmail, emailVerifiedAt: now },
          select: { name: true },
        });
        const revoked = await tx.session.deleteMany({
          where: { userId, tokenHash: { not: currentSessionTokenHash } },
        });
        await tx.auditLog.create({
          data: {
            communityId,
            actorUserId: userId,
            action: 'account.email_changed',
            targetType: 'User',
            targetId: userId,
            metadata: {
              requestId: request.id,
              oldEmail: maskEmail(request.currentEmail),
              newEmail: maskEmail(request.normalizedNewEmail),
              revokedSessionCount: revoked.count,
            },
          },
        });
        return {
          oldEmail: request.currentEmail,
          newEmail: request.normalizedNewEmail,
          userName: user.name,
          revokedSessionCount: revoked.count,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException(emailUnavailableResponse);
      throw error;
    }
    realtimeSessionRegistry.revokeUser(userId, currentSession?.id);

    try {
      await this.email.queueEmailChangeCompleted(
        communityId,
        { id: userId, name: result.userName },
        result.oldEmail,
        result.newEmail,
      );
    } catch {
      await this.auditFailure(communityId, userId, 'COMPLETION_NOTIFICATION_FAILED').catch(() => undefined);
    }
    await this.securityActivity.recordBestEffort({
      communityId,
      userId,
      eventType: 'EMAIL_CHANGED',
      context: requestContext,
      notify: true,
      notificationEmail: result.oldEmail,
    });
    return {
      ok: true,
      email: result.newEmail,
      revokedSessionCount: result.revokedSessionCount,
    };
  }

  private async activeRequest(userId: string) {
    const request = await this.prisma.emailChangeRequest.findFirst({
      where: { userId, activeUserId: userId, verifiedAt: null, cancelledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!request || request.currentEmail === request.normalizedNewEmail) throw new BadRequestException('No pending email change request was found.');
    return request;
  }

  private async replacePrimaryVerificationRequest(
    user: { id: string; email: string; name: string },
    communityId: string,
    auditAction: string,
  ) {
    const token = createEmailChangeToken();
    const normalizedEmail = normalizeEmail(user.email);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_EXPIRES_MINUTES * 60 * 1000);
    const request = await this.prisma.$transaction(async (tx) => {
      await tx.emailChangeRequest.updateMany({
        where: {
          userId: user.id,
          activeUserId: user.id,
          verifiedAt: null,
          cancelledAt: null,
        },
        data: { cancelledAt: now, activeUserId: null, activeNewEmail: null },
      });
      const created = await tx.emailChangeRequest.create({
        data: {
          userId: user.id,
          currentEmail: normalizedEmail,
          normalizedNewEmail: normalizedEmail,
          tokenHash: hashEmailChangeToken(token),
          expiresAt,
          activeUserId: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId: user.id,
          action: auditAction,
          targetType: 'EmailChangeRequest',
          targetId: created.id,
          metadata: { requestId: created.id },
        },
      });
      return created;
    });
    return { token, requestId: request.id, expiresAt: request.expiresAt };
  }

  private async ensureEmailAvailable(userId: string, normalizedNewEmail: string) {
    const [user, request] = await Promise.all([
      this.prisma.user.findFirst({
        where: { email: { equals: normalizedNewEmail, mode: 'insensitive' }, id: { not: userId } },
        select: { id: true },
      }),
      this.prisma.emailChangeRequest.findFirst({
        where: {
          activeNewEmail: normalizedNewEmail,
          userId: { not: userId },
          verifiedAt: null,
          cancelledAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (user || request) throw new ConflictException(emailUnavailableResponse);
  }

  private expireRequests(where: Prisma.EmailChangeRequestWhereInput) {
    return this.prisma.emailChangeRequest.updateMany({
      where: {
        AND: [
          where,
          {
            activeUserId: { not: null },
            verifiedAt: null,
            cancelledAt: null,
            expiresAt: { lte: new Date() },
          },
        ],
      },
      data: { cancelledAt: new Date(), activeUserId: null, activeNewEmail: null },
    });
  }

  private auditFailure(communityId: string, userId: string, reason: string) {
    return this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId: userId,
        action: reason === 'RATE_LIMITED' ? 'account.email_change_rate_limited' : 'account.email_change_failed',
        targetType: 'User',
        targetId: userId,
        metadata: { reason },
      },
    });
  }
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createEmailChangeToken() {
  return randomBytes(32).toString('base64url');
}

export function hashEmailChangeToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function maskEmail(value: string) {
  const [local, domain] = normalizeEmail(value).split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

function requiredString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
