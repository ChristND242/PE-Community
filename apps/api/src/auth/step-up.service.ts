import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditLogService, type AuditRequestContext } from '../audit/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../security/password.service';
import type { RequestUser } from './auth.service';
import { PasskeyChallengeService } from './passkey-challenge.service';

export const STEP_UP_AUTH_TTL_MS = 5 * 60 * 1000;
export type StepUpMethod = 'PASSKEY' | 'PASSWORD';

@Injectable()
export class StepUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly challenges: PasskeyChallengeService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async status(user: RequestUser) {
    const now = new Date();
    const [session, passkeyCount] = await Promise.all([
      this.prisma.session.findFirst({
        where: { id: user.sessionId, userId: user.id, expiresAt: { gt: now }, idleExpiresAt: { gt: now } },
        select: { stepUpAuthenticatedAt: true, stepUpMethod: true },
      }),
      this.prisma.passkeyCredential.count({ where: { userId: user.id, revokedAt: null } }),
    ]);
    if (!session) throw new UnauthorizedException('Authentication required.');
    const expiresAt = session.stepUpAuthenticatedAt
      ? new Date(session.stepUpAuthenticatedAt.getTime() + STEP_UP_AUTH_TTL_MS)
      : null;
    return {
      required: !expiresAt || expiresAt <= new Date(),
      expiresAt: expiresAt?.toISOString() ?? null,
      passkeyAvailable: passkeyCount > 0,
    };
  }

  async verifyPassword(user: RequestUser, currentPassword: unknown, sourceIp: string, requestContext?: AuditRequestContext) {
    await this.challenges.enforceRateLimit('step-up-password', `${user.id}:${user.sessionId}:${sourceIp}`, 8, 5 * 60);
    const password = typeof currentPassword === 'string' ? currentPassword : '';
    const account = await this.prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!account || !password || !(await this.passwords.verifyWithoutUpgrade(account.passwordHash, password))) {
      await this.audit(user, 'auth.step_up.password.failed', 'FAILURE', requestContext, 'INVALID_PROOF');
      throw new ForbiddenException({ code: 'STEP_UP_FAILED', message: 'Unable to verify your identity.' });
    }
    await this.markAuthenticated(user, 'PASSWORD', requestContext);
    return this.status(user);
  }

  async markAuthenticated(user: RequestUser, method: StepUpMethod, requestContext?: AuditRequestContext) {
    const authenticatedAt = new Date();
    const updated = await this.prisma.session.updateMany({
      where: { id: user.sessionId, userId: user.id, expiresAt: { gt: authenticatedAt }, idleExpiresAt: { gt: authenticatedAt } },
      data: { stepUpAuthenticatedAt: authenticatedAt, stepUpMethod: method },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Authentication required.');
    await this.audit(user, `auth.step_up.${method.toLowerCase()}.succeeded`, 'SUCCESS', requestContext);
  }

  async requireRecent(user: RequestUser, acceptedMethods: StepUpMethod[] = ['PASSKEY', 'PASSWORD']) {
    const now = new Date();
    const threshold = new Date(now.getTime() - STEP_UP_AUTH_TTL_MS);
    const session = await this.prisma.session.findFirst({
      where: {
        id: user.sessionId,
        userId: user.id,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
        stepUpAuthenticatedAt: { gt: threshold },
        stepUpMethod: { in: acceptedMethods },
      },
      select: { id: true },
    });
    if (!session) {
      throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'Verify your identity to continue.' });
    }
  }

  async recordPasskeyFailure(user: RequestUser, requestContext?: AuditRequestContext, reason = 'INVALID_PROOF') {
    await this.audit(user, 'auth.step_up.passkey.failed', 'FAILURE', requestContext, reason);
  }

  private audit(
    user: RequestUser,
    action: string,
    outcome: 'SUCCESS' | 'FAILURE',
    requestContext?: AuditRequestContext,
    reason?: string,
  ) {
    return this.auditLogs.recordBestEffort({
      communityId: user.communityId,
      actorUserId: user.id,
      actorRole: user.role,
      category: 'AUTHENTICATION',
      action,
      outcome,
      severity: outcome === 'SUCCESS' ? 'INFO' : 'WARNING',
      targetType: 'Session',
      targetId: user.sessionId,
      requestContext,
      reason,
      metadata: { mode: action.includes('passkey') ? 'PASSKEY' : 'PASSWORD' },
    });
  }
}
