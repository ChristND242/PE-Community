import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { normalizeEmailLocale } from '@pe/shared';
import { MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../security/password.service';
import { CaptchaVerificationService } from './captcha-verification.service';
import { RegistrationNotificationQueueService } from './registration-notification-queue.service';
import { RegistrationRateLimitService } from './registration-rate-limit.service';
import { RegistrationSettingsService } from './registration-settings.service';
import {
  normalizeEmail,
  RegistrationNoticeCategory,
  RegistrationSubmissionDecision,
} from './registration.types';

export const registrationPublicResult = {
  status: 'received',
  message: 'If this address is eligible, your registration request has been received. Check your email for further instructions.',
} as const;

type RegistrationInput = {
  name: string;
  email: string;
  password: string;
  note?: string;
  sex: 'M' | 'F';
  captchaToken?: string;
};

type SubmissionContext = {
  communityId: string;
  inviteLinkId?: string;
  ipAddress: string;
};

@Injectable()
export class RegistrationSubmissionService {
  private readonly logger = new Logger(RegistrationSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rateLimits: RegistrationRateLimitService,
    private readonly captcha: CaptchaVerificationService,
    private readonly registrationSettings: RegistrationSettingsService,
    private readonly notificationQueue: RegistrationNotificationQueueService,
  ) {}

  publicConfig(communityId?: string) {
    return this.registrationSettings.publicConfig(communityId);
  }

  async submit(input: RegistrationInput, context: SubmissionContext) {
    const normalizedEmail = normalizeEmail(input.email);
    const settings = await this.registrationSettings.settings(context.communityId);
    const ipLimit = await this.rateLimits.consumeIp(
      context.communityId,
      context.ipAddress,
      settings.registrationIpLimit,
      settings.registrationIpWindowMinutes,
    );
    const ipHash = this.rateLimits.hashReference(context.ipAddress);
    const emailHash = this.rateLimits.hashReference(normalizedEmail);
    if (!ipLimit.allowed) {
      if (ipLimit.firstBlocked) {
        await this.safeAudit(context.communityId, 'registration.rate_limited', {
          emailReference: emailHash,
          ipReference: ipHash,
        });
      }
      throw new RegistrationRateLimitException(ipLimit.retryAfterSeconds);
    }

    const captchaSettings = await this.registrationSettings.captchaSettings(context.communityId);
    try {
      const captchaResult = await this.captcha.verify(captchaSettings, input.captchaToken, context.ipAddress);
      if (captchaResult.provider !== 'DISABLED') {
        await this.safeAudit(context.communityId, 'registration.captcha_verified', {
          provider: captchaResult.provider,
          emailReference: emailHash,
          ipReference: ipHash,
        });
      }
    } catch (error) {
      await this.safeAudit(context.communityId, 'registration.captcha_failed', {
        provider: captchaSettings.provider,
        emailReference: emailHash,
        ipReference: ipHash,
      });
      throw error;
    }

    // Hashing before the account-state branch keeps accepted paths similar and
    // ensures no submission can accidentally persist the plaintext password.
    const passwordHash = await this.passwords.hash(input.password);
    const decision = await this.decide(input, context, normalizedEmail, passwordHash, emailHash, ipHash);
    await this.queueNotice(
      decision,
      input,
      context.communityId,
      normalizedEmail,
      settings.registrationNotificationCooldownHours,
      settings.registrationGlobalEmailDailyLimit,
      normalizeEmailLocale(settings.defaultLanguage),
    );
    return registrationPublicResult;
  }

  private async decide(
    input: RegistrationInput,
    context: SubmissionContext,
    normalizedEmail: string,
    passwordHash: string,
    emailHash: string,
    ipHash: string,
  ): Promise<RegistrationSubmissionDecision> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [user, activeApplication] = await Promise.all([
          tx.user.findFirst({
            where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
            include: { memberships: { where: { communityId: context.communityId } } },
          }),
          tx.registrationApplication.findFirst({
            where: {
              communityId: context.communityId,
              normalizedEmail,
              status: { in: ['PENDING', 'APPROVED'] },
            },
            orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
          }),
        ]);
        const activeMembership = user?.memberships.find((membership) => membership.status === MembershipStatus.ACTIVE);
        const now = new Date();

        if (activeMembership || activeApplication?.status === 'APPROVED') {
          if (activeApplication) {
            await tx.registrationApplication.update({
              where: { id: activeApplication.id },
              data: {
                status: activeMembership && activeApplication.status === 'PENDING' ? 'SUPERSEDED' : undefined,
                passwordHash: activeMembership && activeApplication.status === 'PENDING' ? null : undefined,
                submissionAttemptCount: { increment: 1 },
                lastSubmissionAttemptAt: now,
                lastIpHash: ipHash,
              },
            });
          }
          await tx.auditLog.create({
            data: {
              communityId: context.communityId,
              action: 'registration.duplicate_attempt',
              targetType: 'RegistrationApplication',
              targetId: activeApplication?.id ?? emailHash,
              metadata: {
                decision: 'existing_account',
                emailReference: emailHash,
                ipReference: ipHash,
              },
            },
          });
          return { kind: 'existing_account', applicationId: activeApplication?.id, notification: 'REGISTRATION_EXISTING_ACCOUNT_NOTICE' };
        }

        if (activeApplication?.status === 'PENDING') {
          await tx.registrationApplication.update({
            where: { id: activeApplication.id },
            data: {
              submissionAttemptCount: { increment: 1 },
              lastSubmissionAttemptAt: now,
              lastIpHash: ipHash,
            },
          });
          await tx.auditLog.create({
            data: {
              communityId: context.communityId,
              action: 'registration.duplicate_attempt',
              targetType: 'RegistrationApplication',
              targetId: activeApplication.id,
              metadata: { decision: 'pending_exists', emailReference: emailHash, ipReference: ipHash },
            },
          });
          return { kind: 'pending_exists', applicationId: activeApplication.id, notification: 'REGISTRATION_PENDING_REMINDER' };
        }

        if (user) {
          await tx.auditLog.create({
            data: {
              communityId: context.communityId,
              action: 'registration.duplicate_attempt',
              targetType: 'RegistrationApplication',
              targetId: emailHash,
              metadata: { decision: 'policy_guidance', emailReference: emailHash, ipReference: ipHash },
            },
          });
          return { kind: 'policy_guidance', notification: 'REGISTRATION_POLICY_GUIDANCE' };
        }

        const application = await tx.registrationApplication.create({
          data: {
            communityId: context.communityId,
            inviteLinkId: context.inviteLinkId,
            email: normalizedEmail,
            normalizedEmail,
            name: input.name.trim(),
            sex: input.sex,
            note: input.note?.trim() || (context.inviteLinkId ? 'Submitted from invitation link.' : 'Submitted from public registration.'),
            passwordHash,
            lastIpHash: ipHash,
          },
        });
        const communitySettings = await tx.communitySettings.findUnique({ where: { communityId: context.communityId } });
        if (communitySettings?.adminInAppAlertsEnabled && communitySettings.registrationReviewAlertsEnabled) {
          const admins = await tx.membership.findMany({
            where: { communityId: context.communityId, status: MembershipStatus.ACTIVE, role: { key: { in: ['owner', 'admin'] } } },
            select: { userId: true },
          });
          if (admins.length) {
            await tx.notification.createMany({
              data: admins.map((admin) => ({
                communityId: context.communityId,
                userId: admin.userId,
                type: 'REGISTRATION_SUBMITTED',
                title: 'New registration',
                body: 'A registration is waiting for review.',
                metadata: {
                  registrationId: application.id,
                  communityId: context.communityId,
                  applicantName: input.name.trim(),
                } as Prisma.InputJsonObject,
                dedupeKey: `REGISTRATION_SUBMITTED:${application.id}:${admin.userId}`,
              })),
              skipDuplicates: true,
            });
          }
        }
        if (context.inviteLinkId) {
          await tx.communityInviteLink.update({
            where: { id: context.inviteLinkId },
            data: { useCount: { increment: 1 }, lastUsedAt: now },
          });
        }
        await tx.auditLog.create({
          data: {
            communityId: context.communityId,
            action: 'registration.submitted',
            targetType: 'RegistrationApplication',
            targetId: application.id,
            metadata: { decision: 'created', emailReference: emailHash, ipReference: ipHash },
          },
        });
        return { kind: 'created', applicationId: application.id, notification: 'REGISTRATION_ACKNOWLEDGEMENT' };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const canonical = await this.prisma.registrationApplication.update({
        where: {
          id: (await this.prisma.registrationApplication.findFirstOrThrow({
            where: { communityId: context.communityId, normalizedEmail, status: { in: ['PENDING', 'APPROVED'] } },
            select: { id: true },
          })).id,
        },
        data: {
          submissionAttemptCount: { increment: 1 },
          lastSubmissionAttemptAt: new Date(),
          lastIpHash: ipHash,
        },
      });
      await this.safeAudit(context.communityId, 'registration.duplicate_attempt', {
        decision: 'concurrent_pending_exists',
        applicationId: canonical.id,
        emailReference: emailHash,
        ipReference: ipHash,
      });
      return canonical.status === 'APPROVED'
        ? { kind: 'existing_account', applicationId: canonical.id, notification: 'REGISTRATION_EXISTING_ACCOUNT_NOTICE' }
        : { kind: 'pending_exists', applicationId: canonical.id, notification: 'REGISTRATION_PENDING_REMINDER' };
    }
  }

  private async queueNotice(
    decision: RegistrationSubmissionDecision,
    input: RegistrationInput,
    communityId: string,
    normalizedEmail: string,
    cooldownHours: number,
    dailyLimit: number,
    locale: 'en' | 'fr',
  ) {
    const reservation = await this.rateLimits.reserveNotice(communityId, normalizedEmail, cooldownHours, dailyLimit);
    if (!reservation.allowed) {
      if (decision.applicationId) {
        await this.prisma.registrationApplication.update({
          where: { id: decision.applicationId },
          data: {
            lastNotificationSuppressedAt: new Date(),
            lastNotificationSuppressionReason: reservation.reason,
          },
        });
      }
      await this.safeAudit(communityId, 'registration.notification_suppressed', {
        applicationId: decision.applicationId,
        category: decision.notification,
        reason: reservation.reason,
        emailReference: this.rateLimits.hashReference(normalizedEmail),
      });
      return;
    }

    const emailReference = this.rateLimits.hashReference(normalizedEmail);
    const bucket = Math.floor(Date.now() / (cooldownHours * 60 * 60 * 1000));
    const noticeKey = `registration-notice-${decision.notification}-${communityId}-${emailReference}-${bucket}`;
    const data = {
      category: decision.notification,
      communityId,
      applicationId: decision.applicationId,
      recipientEmail: normalizedEmail,
      recipientName: input.name.trim(),
      emailReference,
      noticeKey,
      locale,
    };
    try {
      await this.notificationQueue.enqueue(data);
      if (decision.applicationId) {
        await this.prisma.registrationApplication.update({
          where: { id: decision.applicationId },
          data: decision.notification === 'REGISTRATION_PENDING_REMINDER'
            ? { lastReminderQueuedAt: new Date(), lastNotificationSuppressionReason: null }
            : decision.notification === 'REGISTRATION_EXISTING_ACCOUNT_NOTICE'
              ? { lastSecurityNoticeQueuedAt: new Date(), lastNotificationSuppressionReason: null }
              : { lastNotificationSuppressionReason: null },
        });
      }
      await this.safeAudit(communityId, noticeAuditAction(decision.notification), {
        applicationId: decision.applicationId,
        category: decision.notification,
        emailReference,
      });
    } catch (error) {
      this.logger.error(`Registration notification enqueue failed category=${decision.notification} error=${safeErrorName(error)}`);
      await this.safeAudit(communityId, 'registration.notification_suppressed', {
        applicationId: decision.applicationId,
        category: decision.notification,
        reason: 'QUEUE_UNAVAILABLE',
        emailReference,
      });
    }
  }

  private safeAudit(communityId: string, action: string, metadata: Prisma.InputJsonObject) {
    const targetId = typeof metadata.applicationId === 'string'
      ? metadata.applicationId
      : typeof metadata.emailReference === 'string'
        ? metadata.emailReference
        : communityId;
    return this.prisma.auditLog.create({
      data: { communityId, action, targetType: 'RegistrationApplication', targetId, metadata },
    }).catch((error) => {
      this.logger.warn(`Registration audit write failed action=${action} error=${safeErrorName(error)}`);
      return null;
    });
  }

}

export class RegistrationRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({
      code: 'REGISTRATION_RATE_LIMITED',
      message: 'Too many registration attempts. Please wait before trying again.',
      retryAfterSeconds,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

function noticeAuditAction(category: RegistrationNoticeCategory) {
  if (category === 'REGISTRATION_PENDING_REMINDER') return 'registration.pending_reminder_queued';
  if (category === 'REGISTRATION_EXISTING_ACCOUNT_NOTICE') return 'registration.existing_account_notice_queued';
  return 'registration.notification_queued';
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError';
}
