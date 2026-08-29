import { BadRequestException, Injectable, Logger, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MembershipStatus, Prisma } from '@prisma/client';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSIONS, getSystemRolePermissions, normalizeSystemRole } from '../rbac/permissions';
import {
  avatarPublicUrl,
  avatarUploadDir,
  avatarUploadExtension,
  hasValidAvatarSignature,
  maxAvatarUploadSize,
  type AvatarUploadFile,
} from '../uploads';
import { EmailService } from '../email/email.service';
import { PasswordService } from '../security/password.service';
import { RegistrationSubmissionService } from '../registration/registration-submission.service';
import { LoginStreakService } from './login-streak.service';
import { profileLinkDtoSelect, safeProfileLinkResponses } from '../profile-links/profile-links.service';
import { RegisterDto } from './register.dto';
import { AuditLogService, AuditRequestContext } from '../audit/audit-log.service';
import { SecurityActivityService } from './security-activity.service';
import { PasskeyChallengeService } from './passkey-challenge.service';
import { realtimeSessionRegistry } from './realtime-session-registry';

export type RequestUser = {
  id: string;
  email: string;
  name: string;
  communityId: string;
  community: {
    defaultLanguage: string;
    timezone: string;
  };
  role: string;
  permissions: string[];
  sessionId: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
  forcePasswordChange?: boolean;
};

export const SESSION_WARNING_AFTER_MS = 15 * 60 * 1000;
export const SESSION_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
export const SESSION_WARNING_DURATION_MS = SESSION_IDLE_TIMEOUT_MS - SESSION_WARNING_AFTER_MS;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionActivityStatus = {
  status: 'active';
  serverNow: string;
  lastActivityAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  warningAfterSeconds: number;
  idleTimeoutSeconds: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private invalidPasswordHash?: Promise<string>;
  cookieName = process.env.SESSION_COOKIE_NAME ?? 'pe_session';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly loginStreaks: LoginStreakService,
    private readonly passwords: PasswordService,
    private readonly registrations: RegistrationSubmissionService,
    private readonly securityActivity: SecurityActivityService,
    @Optional() private readonly auditLogs?: AuditLogService,
    @Optional() private readonly authenticationLimits?: PasskeyChallengeService,
  ) {}

  async register(input: RegisterDto, ipAddress: string) {
    const sex = normalizeSex(input.sex);
    if (sex !== 'M' && sex !== 'F') throw new BadRequestException('Please select your sex');
    const invite = await this.validInviteLink(input.inviteToken, input.communityId);
    const communityId = input.communityId ?? invite?.communityId ?? 'seed-community';
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId } });
    const settings = await this.communitySettings(community.id);
    if (settings.registrationApprovalMode === 'invite_link' && !invite) {
      throw new BadRequestException('Invalid or expired invitation link.');
    }
    return this.registrations.submit(
      { ...input, sex },
      { communityId: community.id, inviteLinkId: invite?.id, ipAddress },
    );
  }

  async registrationSecurity(communityId?: string, inviteToken?: string) {
    const invite = await this.validInviteLink(inviteToken, communityId);
    return this.registrations.publicConfig(invite?.communityId ?? communityId);
  }

  async inviteStatus(token: string | undefined, communityId?: string) {
    return { valid: Boolean(await this.validInviteLink(token, communityId)) };
  }

  async login(email: string, password: string, requestContext?: AuditRequestContext) {
    const normalizedEmail = stringValue(email)?.toLowerCase() ?? '';
    const candidatePassword = typeof password === 'string' ? password : '';
    await this.enforceAuthenticationLimits('password-login', normalizedEmail, requestContext?.sourceIp, 10, 5 * 60);
    const user = normalizedEmail ? await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { memberships: { include: { role: true, profile: true }, where: { status: MembershipStatus.ACTIVE } } },
    }) : null;
    const passwordResult = user
      ? await this.passwords.verify(user.passwordHash, candidatePassword)
      : await this.verifyUnknownAccountPassword(candidatePassword);
    if (!user || !passwordResult?.valid || user.memberships.length === 0) {
      const membership = user?.memberships[0];
      if (user && membership) await this.auditLogs?.recordBestEffort({
        communityId: membership.communityId,
        actorUserId: user.id,
        actorRole: membership.role.key,
        category: 'AUTHENTICATION',
        action: 'auth.login.failed',
        outcome: 'FAILURE',
        severity: 'WARNING',
        targetType: 'User',
        targetId: user.id,
        reason: 'INVALID_CREDENTIALS',
        requestContext,
      });
      if (user && membership) await this.securityActivity.recordFailedLogin({
        communityId: membership.communityId,
        userId: user.id,
        context: requestContext,
        authenticationMethod: 'PASSWORD',
      });
      throw new UnauthorizedException('Invalid credentials or inactive membership.');
    }
    await this.persistPasswordUpgrade(user.id, user.passwordHash, passwordResult);
    if (user.twoFactorReenrollmentRequired) {
      const ownerMemberships = user.memberships.filter((entry) => entry.role.key === 'owner');
      if (ownerMemberships.length !== 1) throw new UnauthorizedException('Invalid credentials or inactive membership.');
      const membership = ownerMemberships[0];
      const reenrollmentToken = await this.jwt.signAsync(
        { purpose: 'owner-2fa-reenrollment', sub: user.id, communityId: membership.communityId },
        { expiresIn: '15m' },
      );
      return { twoFactorReenrollmentRequired: true, reenrollmentToken, user: { email: user.email } };
    }
    const membership = user.memberships[0];
    const communitySettings = await this.communitySettings(membership.communityId);
    if (communitySettings.twoFactorEnabled && user.twoFactorEnabled && user.twoFactorSecret) {
      const challengeToken = await this.jwt.signAsync({ purpose: '2fa-login', sub: user.id, communityId: membership.communityId }, { expiresIn: '5m' });
      return { twoFactorRequired: true, challengeToken, user: { email: user.email } };
    }
    const response = await this.createSessionResponse(user.id, requestContext, 'PASSWORD');
    await this.auditLogs?.recordBestEffort({
      communityId: membership.communityId,
      actorUserId: user.id,
      actorRole: membership.role.key,
      category: 'AUTHENTICATION',
      action: 'auth.login.succeeded',
      targetType: 'User',
      targetId: user.id,
      requestContext,
    });
    return response;
  }

  private async validInviteLink(token: unknown, communityId?: string) {
    const value = normalizeInviteToken(token);
    if (!value) return null;
    const invite = await this.prisma.communityInviteLink.findUnique({ where: { tokenHash: hashInviteToken(value) } });
    if (!invite || (communityId && invite.communityId !== communityId) || invite.revokedAt) return null;
    if (invite.expiresAt && invite.expiresAt <= new Date()) return null;
    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return null;
    return invite;
  }

  passwordResetStatus() {
    return this.email.passwordResetAvailable();
  }

  async forgotPassword(input: Record<string, unknown>, requestContext?: AuditRequestContext) {
    const email = stringValue(input.email)?.toLowerCase();
    if (!email) return { ok: true };
    await this.enforceAuthenticationLimits('forgot-password', email, requestContext?.sourceIp, 5, 15 * 60);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { status: MembershipStatus.ACTIVE }, include: { community: true } } },
    });
    if (!user || user.memberships.length === 0) return { ok: true };
    const membership = user.memberships[0];
    const status = await this.email.passwordResetAvailable(membership.communityId);
    await this.prisma.auditLog.create({
      data: { communityId: membership.communityId, actorUserId: user.id, action: 'auth.password_reset.requested', targetType: 'User', targetId: user.id, metadata: { emailQueued: status.available } },
    });
    if (!status.available) return { ok: true };
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      },
    });
    await this.email.queuePasswordResetEmail(membership.communityId, user, token);
    return { ok: true };
  }

  async resetPassword(input: Record<string, unknown>, requestContext?: AuditRequestContext) {
    const token = stringValue(input.token);
    const newPassword = stringValue(input.newPassword);
    if (!token || !newPassword || newPassword.length < 8) throw new BadRequestException('Invalid or expired reset link.');
    await this.enforceAuthenticationLimits('reset-password', token, requestContext?.sourceIp, 10, 15 * 60);
    const reset = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: { where: { status: MembershipStatus.ACTIVE } } } } } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw new BadRequestException('Invalid or expired reset link.');
    const passwordHash = await this.passwords.hash(newPassword);
    const communityId = reset.user.memberships[0]?.communityId ?? 'seed-community';
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, passwordChangedAt: new Date(), forcePasswordChange: false },
      });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      await tx.emailChangeRequest.updateMany({
        where: { userId: reset.userId, activeUserId: reset.userId, verifiedAt: null, cancelledAt: null },
        data: { cancelledAt: new Date(), activeUserId: null, activeNewEmail: null },
      });
      await tx.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      await tx.auditLog.create({
        data: { communityId, actorUserId: reset.userId, action: 'auth.password_reset.completed', targetType: 'User', targetId: reset.userId, metadata: {} },
      });
    });
    realtimeSessionRegistry.revokeUser(reset.userId);
    return { ok: true };
  }

  async completeTwoFactorLogin(challengeToken: string | undefined, code: string | undefined, requestContext?: AuditRequestContext) {
    const token = stringValue(challengeToken);
    if (!token) throw new UnauthorizedException('Authentication code is required.');
    await this.enforceAuthenticationLimits('totp-login', token, requestContext?.sourceIp, 8, 5 * 60);
    let payload: { purpose?: string; sub?: string; communityId?: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Two-factor challenge expired.');
    }
    if (payload.purpose !== '2fa-login' || !payload.sub || !payload.communityId) throw new UnauthorizedException('Invalid two-factor challenge.');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: { include: { role: true, profile: true }, where: { communityId: payload.communityId, status: MembershipStatus.ACTIVE } } },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret || user.memberships.length === 0) throw new UnauthorizedException('Invalid two-factor challenge.');
    const totpOk = verifyTotp(user.twoFactorSecret, code);
    const backupOk = totpOk ? false : await this.consumeBackupCode(user.id, code);
    if (!totpOk && !backupOk) {
      await this.auditLogs?.recordBestEffort({ communityId: payload.communityId, actorUserId: user.id, actorRole: user.memberships[0].role.key, category: 'AUTHENTICATION', action: 'auth.login.failed', outcome: 'FAILURE', severity: 'WARNING', targetType: 'User', targetId: user.id, reason: 'INVALID_MFA_CODE', requestContext });
      await this.securityActivity.recordFailedLogin({ communityId: payload.communityId, userId: user.id, context: requestContext, authenticationMethod: 'TOTP' });
      throw new UnauthorizedException('Invalid authentication or backup code.');
    }
    const response = await this.createSessionResponse(user.id, requestContext, backupOk ? 'BACKUP_CODE' : 'TOTP');
    await this.auditLogs?.recordBestEffort({ communityId: payload.communityId, actorUserId: user.id, actorRole: user.memberships[0].role.key, category: 'AUTHENTICATION', action: 'auth.login.succeeded', targetType: 'User', targetId: user.id, requestContext, metadata: { mode: backupOk ? 'BACKUP_CODE' : 'TOTP' } });
    return response;
  }

  async createPasskeySession(userId: string, requestContext?: AuditRequestContext) {
    return this.createSessionResponse(userId, requestContext, 'PASSKEY');
  }

  async logout(cookie?: string) {
    if (!cookie) return { ok: true };
    const sid = await this.sessionIdFromCookie(cookie);
    if (sid) {
      const tokenHash = createHash('sha256').update(sid).digest('hex');
      const session = await this.prisma.session.findUnique({ where: { tokenHash }, select: { id: true } });
      await this.prisma.session.deleteMany({ where: { tokenHash } });
      if (session) realtimeSessionRegistry.revokeSession(session.id);
    }
    return { ok: true };
  }

  async sessionStatus(cookie?: string): Promise<SessionActivityStatus> {
    const tokenHash = await this.sessionTokenHashFromCookie(cookie);
    if (!tokenHash) throw new UnauthorizedException('Authentication required.');
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    await this.assertActiveSession(session);
    return sessionActivityStatus(session!);
  }

  async touchSessionActivity(cookie?: string, requestContext?: AuditRequestContext): Promise<SessionActivityStatus> {
    const tokenHash = await this.sessionTokenHashFromCookie(cookie);
    if (!tokenHash) throw new UnauthorizedException('Authentication required.');
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    await this.assertActiveSession(session);

    const now = new Date();
    const idleExpiresAt = new Date(Math.min(
      session!.expiresAt.getTime(),
      now.getTime() + SESSION_IDLE_TIMEOUT_MS,
    ));
    const updated = await this.prisma.session.updateMany({
      where: {
        id: session!.id,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      data: {
        lastActivityAt: now,
        idleExpiresAt,
        lastSeenIp: requestContext?.sourceIp,
        lastSeenCountryCode: requestContext?.countryCode,
        lastSeenCountryName: requestContext?.countryName,
        userAgent: requestContext?.userAgent,
        browser: requestContext?.browser,
        operatingSystem: requestContext?.operatingSystem,
      },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Session expired.');
    return sessionActivityStatus({ ...session!, lastActivityAt: now, idleExpiresAt });
  }

  async sessionTokenHashFromCookie(cookie?: string) {
    const sid = await this.sessionIdFromCookie(cookie);
    return sid ? createHash('sha256').update(sid).digest('hex') : null;
  }

  async userFromCookie(cookie?: string): Promise<RequestUser> {
    const sid = await this.sessionIdFromCookie(cookie);
    if (!sid) throw new UnauthorizedException('Authentication required.');
    const tokenHash = createHash('sha256').update(sid).digest('hex');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { memberships: { include: { role: true, profile: true }, where: { status: 'ACTIVE' } } } } },
    });
    return this.requestUserFromSession(session);
  }

  async revalidateUserSession(user: RequestUser): Promise<RequestUser> {
    const session = await this.prisma.session.findFirst({
      where: { id: user.sessionId, userId: user.id },
      include: { user: { include: { memberships: { include: { role: true, profile: true }, where: { status: 'ACTIVE' } } } } },
    });
    return this.requestUserFromSession(session);
  }

  private async requestUserFromSession(session: Prisma.SessionGetPayload<{
    include: { user: { include: { memberships: { include: { role: true; profile: true }; where: { status: 'ACTIVE' } } } } };
  }> | null): Promise<RequestUser> {
    const now = new Date();
    if (!session || session.expiresAt <= now || session.idleExpiresAt <= now || session.user.memberships.length === 0) {
      if (session) await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException('Session expired.');
    }
    const membership = session.user.memberships[0];
    const settings = await this.communitySettings(membership.communityId);
    const permissions = await this.rolePermissions(membership.communityId, membership.role.key);
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      communityId: membership.communityId,
      community: communityDefaults(settings),
      role: membership.role.key,
      permissions,
      sessionId: session.id,
      emailVerified: Boolean(session.user.emailVerifiedAt),
      avatarUrl: membership.profile?.avatarUrl ?? null,
      dicebearStyle: membership.profile?.dicebearStyle ?? null,
      dicebearSeed: membership.profile?.dicebearSeed ?? null,
      forcePasswordChange: session.user.forcePasswordChange,
    };
  }

  private async enforceAuthenticationLimits(
    scope: string,
    identifier: string,
    sourceIp: string | undefined,
    identifierLimit: number,
    windowSeconds: number,
  ) {
    if (!this.authenticationLimits) return;
    const ip = sourceIp || 'Unknown';
    await Promise.all([
      this.authenticationLimits.enforceAuthenticationRateLimit(`${scope}:source`, ip, identifierLimit * 3, windowSeconds),
      this.authenticationLimits.enforceAuthenticationRateLimit(`${scope}:identifier`, `${identifier.toLowerCase()}:${ip}`, identifierLimit, windowSeconds),
    ]);
  }

  async twoFactorStatus(userId: string, communityId: string) {
    const [settings, user, backupCodesRemaining] = await Promise.all([
      this.communitySettings(communityId),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorConfirmedAt: true } }),
      this.prisma.userTwoFactorBackupCode.count({ where: { userId, usedAt: null } }),
    ]);
    return {
      platformEnabled: settings.twoFactorEnabled,
      enabled: user.twoFactorEnabled,
      confirmedAt: user.twoFactorConfirmedAt,
      backupCodesRemaining,
    };
  }

  async setupTwoFactor(userId: string, communityId: string) {
    const settings = await this.communitySettings(communityId);
    if (!settings.twoFactorEnabled) throw new BadRequestException('Two-factor authentication is not enabled for this community.');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled. Disable it before starting a new enrollment.');
    }
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'PE Community Management', label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false, twoFactorConfirmedAt: null },
    });
    return { otpauthUrl, qrCodeDataUrl, setupKey: secret };
  }

  async verifyTwoFactorSetup(userId: string, code: string | undefined, communityId?: string, requestContext?: AuditRequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { twoFactorSecret: true } });
    if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, code)) throw new BadRequestException('Invalid authentication code.');
    const confirmedAt = new Date();
    const confirmed = await this.prisma.user.updateMany({
      where: { id: userId, twoFactorSecret: user.twoFactorSecret, twoFactorEnabled: false },
      data: { twoFactorEnabled: true, twoFactorConfirmedAt: confirmedAt, twoFactorReenrollmentRequired: false },
    });
    if (confirmed.count !== 1) throw new BadRequestException('Two-factor setup changed or expired. Please start again.');
    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { twoFactorEnabled: true, twoFactorConfirmedAt: true },
    });
    const backupCodes = await this.replaceBackupCodes(userId);
    if (communityId) await this.securityActivity.recordBestEffort({ communityId, userId, eventType: 'TOTP_ENABLED', context: requestContext, notify: true });
    return { enabled: updated.twoFactorEnabled, confirmedAt: updated.twoFactorConfirmedAt, backupCodes, backupCodesRemaining: backupCodes.length };
  }

  async startOwnerTwoFactorReenrollment(reenrollmentToken: string | undefined, requestContext?: AuditRequestContext) {
    await this.enforceAuthenticationLimits('owner-totp-reenrollment', reenrollmentToken ?? '', requestContext?.sourceIp, 8, 5 * 60);
    const owner = await this.ownerReenrollmentChallenge(reenrollmentToken);
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'PE Community Management', label: owner.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    const updated = await this.prisma.user.updateMany({
      where: { id: owner.id, twoFactorReenrollmentRequired: true },
      data: { twoFactorSecret: secret, twoFactorEnabled: false, twoFactorConfirmedAt: null },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Two-factor re-enrollment challenge expired.');
    return { otpauthUrl, qrCodeDataUrl, setupKey: secret };
  }

  async completeOwnerTwoFactorReenrollment(reenrollmentToken: string | undefined, code: string | undefined, requestContext?: AuditRequestContext) {
    await this.enforceAuthenticationLimits('owner-totp-reenrollment', reenrollmentToken ?? '', requestContext?.sourceIp, 8, 5 * 60);
    const owner = await this.ownerReenrollmentChallenge(reenrollmentToken);
    if (!owner.twoFactorSecret || !verifyTotp(owner.twoFactorSecret, code)) throw new BadRequestException('Invalid authentication code.');
    const backupCodes = generateBackupCodes();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: owner.id, twoFactorReenrollmentRequired: true, twoFactorSecret: owner.twoFactorSecret },
        data: { twoFactorEnabled: true, twoFactorConfirmedAt: new Date(), twoFactorReenrollmentRequired: false },
      });
      if (updated.count !== 1) throw new UnauthorizedException('Two-factor re-enrollment challenge expired.');
      await tx.userTwoFactorBackupCode.deleteMany({ where: { userId: owner.id } });
      await tx.userTwoFactorBackupCode.createMany({
        data: backupCodes.map((backupCode) => ({ userId: owner.id, codeHash: hashBackupCode(backupCode)! })),
      });
      await tx.auditLog.create({
        data: {
          communityId: owner.communityId,
          actorUserId: owner.id,
          action: 'auth.owner_mfa_reenrollment_completed',
          targetType: 'User',
          targetId: owner.id,
          metadata: { codeCount: backupCodes.length },
        },
      });
    });
    await this.securityActivity.recordBestEffort({ communityId: owner.communityId, userId: owner.id, eventType: 'TOTP_REENROLLED', context: requestContext, notify: true });
    const session = await this.createSessionResponse(owner.id, requestContext, 'TOTP');
    return { ...session, backupCodes, backupCodesRemaining: backupCodes.length };
  }

  async disableTwoFactor(userId: string, input: Record<string, unknown>, communityId?: string, requestContext?: AuditRequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true } });
    const password = stringValue(input.password);
    const code = stringValue(input.code);
    const passwordOk = password ? await this.verifyUserPassword(userId, user.passwordHash, password) : false;
    const codeOk = user.twoFactorSecret ? verifyTotp(user.twoFactorSecret, code) : false;
    if (!passwordOk && !codeOk) throw new UnauthorizedException('Password or authentication code is required.');
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorConfirmedAt: null },
    });
    await this.prisma.userTwoFactorBackupCode.deleteMany({ where: { userId } });
    if (communityId) await this.securityActivity.recordBestEffort({ communityId, userId, eventType: 'TOTP_DISABLED', context: requestContext, notify: true });
    return { enabled: false, confirmedAt: null };
  }

  async regenerateBackupCodes(userId: string, communityId: string, input: Record<string, unknown>, requestContext?: AuditRequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true } });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new BadRequestException('Two-factor authentication is not enabled.');
    const password = stringValue(input.password);
    const code = stringValue(input.code);
    const passwordOk = password ? await this.verifyUserPassword(userId, user.passwordHash, password) : false;
    const codeOk = verifyTotp(user.twoFactorSecret, code);
    if (!passwordOk && !codeOk) throw new UnauthorizedException('Password or authentication code is required.');
    const backupCodes = await this.replaceBackupCodes(userId);
    await this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId: userId,
        action: 'RECOVERY_CODES_REGENERATED',
        targetType: 'User',
        targetId: userId,
        metadata: { codeCount: backupCodes.length },
      },
    });
    await this.securityActivity.recordBestEffort({ communityId, userId, eventType: 'BACKUP_CODES_REGENERATED', context: requestContext, notify: true });
    return { backupCodes, backupCodesRemaining: backupCodes.length };
  }

  async changeRequiredPassword(userId: string, input: Record<string, unknown>, communityId?: string, requestContext?: AuditRequestContext) {
    const currentPassword = stringValue(input.currentPassword);
    const newPassword = stringValue(input.newPassword);
    if (!currentPassword || !newPassword || newPassword.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await this.verifyUserPassword(userId, user.passwordHash, currentPassword))) throw new UnauthorizedException('Current password is invalid.');
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, forcePasswordChange: false, passwordChangedAt: new Date() },
      });
      await tx.emailChangeRequest.updateMany({
        where: { userId, activeUserId: userId, verifiedAt: null, cancelledAt: null },
        data: { cancelledAt: new Date(), activeUserId: null, activeNewEmail: null },
      });
    });
    if (communityId) await this.securityActivity.recordBestEffort({ communityId, userId, eventType: 'PASSWORD_CHANGED', context: requestContext, notify: true });
    return { ok: true };
  }

  private async verifyUserPassword(userId: string, storedHash: string, candidatePassword: string) {
    const result = await this.passwords.verify(storedHash, candidatePassword);
    if (result.valid) await this.persistPasswordUpgrade(userId, storedHash, result);
    return result.valid;
  }

  private async verifyUnknownAccountPassword(candidatePassword: string) {
    try {
      this.invalidPasswordHash ??= this.passwords.hash(randomBytes(32).toString('base64url'));
      return await this.passwords.verify(await this.invalidPasswordHash, candidatePassword);
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  private async persistPasswordUpgrade(
    userId: string,
    storedHash: string,
    result: { needsRehash: boolean; upgradedHash?: string },
  ) {
    if (!result.needsRehash) return;
    if (!result.upgradedHash) {
      this.logger.warn(`Password hash upgrade could not be generated for user ${userId}.`);
      return;
    }
    try {
      await this.prisma.user.updateMany({
        where: { id: userId, passwordHash: storedHash },
        data: { passwordHash: result.upgradedHash },
      });
    } catch {
      this.logger.warn(`Password hash upgrade could not be persisted for user ${userId}.`);
    }
  }

  async memberProfile(userId: string, communityId: string) {
    const settings = await this.communitySettings(communityId);
    const membership = await this.prisma.membership.findFirst({
      where: { userId, communityId, status: MembershipStatus.ACTIVE },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } }, role: true, profile: true, profileLinks: { select: profileLinkDtoSelect, orderBy: { position: 'asc' } } },
    });
    if (!membership) throw new NotFoundException('Member profile not found.');
    await this.loginStreaks.ensureAuthenticatedSessionStreak(userId, communityId, settings.timezone);
    const streakBoard = await this.loginStreaks.board(userId, communityId, settings.timezone);
    return { ...membership, profileLinks: safeProfileLinkResponses(membership.profileLinks), streakBoard };
  }

  async updateMemberProfile(userId: string, communityId: string, input: Record<string, unknown>) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, communityId },
      include: { profile: true },
    });
    if (!membership) throw new NotFoundException('Member profile not found.');
    const name = stringValue(input.name);
    const updatedMembership = await this.prisma.$transaction(async (tx) => {
      if (name) await tx.user.update({ where: { id: userId }, data: { name } });
      await tx.memberProfile.upsert({
        where: { membershipId: membership.id },
        update: profileData(input),
        create: { membershipId: membership.id, ...profileData(input) },
      });
      return tx.membership.findUniqueOrThrow({
        where: { id: membership.id },
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } }, role: true, profile: true, profileLinks: { select: profileLinkDtoSelect, orderBy: { position: 'asc' } } },
      });
    });
    return { ...updatedMembership, profileLinks: safeProfileLinkResponses(updatedMembership.profileLinks) };
  }

  async uploadMemberAvatar(userId: string, communityId: string, file?: AvatarUploadFile) {
    if (!file) throw new BadRequestException('Avatar image is required.');
    const extension = avatarUploadExtension(file);
    if (!extension) throw new BadRequestException('Avatar image must be JPEG, PNG, or WebP.');
    if (file.size > maxAvatarUploadSize) throw new BadRequestException('Avatar image must be 5MB or smaller.');
    if (!hasValidAvatarSignature(file)) throw new BadRequestException('Avatar image is invalid.');
    const membership = await this.prisma.membership.findFirst({ where: { userId, communityId } });
    if (!membership) throw new NotFoundException('Member profile not found.');

    const uploadDir = avatarUploadDir();
    await mkdir(uploadDir, { recursive: true });
    const filename = `${membership.id}-${randomUUID()}${extension}`;
    await writeFile(join(uploadDir, filename), file.buffer);
    const avatarUrl = avatarPublicUrl(filename);

    await this.prisma.memberProfile.upsert({
      where: { membershipId: membership.id },
      update: { avatarUrl },
      create: { membershipId: membership.id, avatarUrl },
    });

    return { avatarUrl };
  }

  async notifications(userId: string, communityId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { userId, communityId, status: 'ACTIVE' } });
    if (!membership) throw new NotFoundException('Member profile not found.');
    return {
      notifications: await this.prisma.notification.findMany({
        where: { communityId, OR: [{ userId }, { userId: null }] },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }

  async sidebarCounts(userId: string, communityId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { userId, communityId, status: 'ACTIVE' }, select: { id: true } });
    if (!membership) throw new NotFoundException('Member profile not found.');
    const visibleUnreadWhere = { communityId, readAt: null, OR: [{ userId }, { userId: null }] };
    const [notifications, feed] = await Promise.all([
      this.prisma.notification.count({ where: visibleUnreadWhere }),
      this.prisma.notification.count({ where: { ...visibleUnreadWhere, type: 'ANNOUNCEMENT_PUBLISHED' } }),
    ]);
    return { feed, notifications };
  }

  async markNotificationRead(userId: string, communityId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, communityId, OR: [{ userId }, { userId: null }] },
    });
    if (!notification) throw new NotFoundException('Notification not found.');
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  async notificationPreferences(userId: string, communityId: string) {
    const where = { userId_communityId: { userId, communityId } };
    try {
      return await this.prisma.notificationPreference.upsert({
        where,
        update: {},
        create: { userId, communityId },
      });
    } catch (error) {
      if (!isNotificationPreferenceInitializationRace(error)) throw error;
      return this.prisma.notificationPreference.findUniqueOrThrow({ where });
    }
  }

  updateNotificationPreferences(userId: string, communityId: string, input: Record<string, unknown>) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_communityId: { userId, communityId } },
      update: notificationPreferenceData(input),
      create: { userId, communityId, ...notificationPreferenceData(input) },
    });
  }

  private async sessionIdFromCookie(cookie?: string) {
    if (!cookie) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sid: string }>(cookie);
      return payload.sid;
    } catch {
      return null;
    }
  }

  private async assertActiveSession(session: { id: string; expiresAt: Date; idleExpiresAt: Date } | null) {
    const now = new Date();
    if (session && session.expiresAt > now && session.idleExpiresAt > now) return;
    if (session) await this.prisma.session.deleteMany({ where: { id: session.id } });
    throw new UnauthorizedException('Session expired.');
  }

  private async createSessionResponse(userId: string, requestContext?: AuditRequestContext, authenticationMethod = 'PASSWORD') {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { role: true, profile: true }, where: { status: MembershipStatus.ACTIVE } } },
    });
    if (user.memberships.length === 0) throw new UnauthorizedException('Invalid credentials or inactive membership.');
    const membership = user.memberships[0];
    const settings = await this.communitySettings(membership.communityId);
    await this.loginStreaks.recordSuccessfulLogin(user.id, membership.communityId, settings.timezone);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const deadlines = newSessionDeadlines(now);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: deadlines.absoluteExpiresAt,
        lastActivityAt: now,
        idleExpiresAt: deadlines.idleExpiresAt,
        authenticationMethod,
        createdIp: requestContext?.sourceIp,
        createdCountryCode: requestContext?.countryCode,
        createdCountryName: requestContext?.countryName,
        lastSeenIp: requestContext?.sourceIp,
        lastSeenCountryCode: requestContext?.countryCode,
        lastSeenCountryName: requestContext?.countryName,
        userAgent: requestContext?.userAgent,
        browser: requestContext?.browser,
        operatingSystem: requestContext?.operatingSystem,
      },
    });
    await this.securityActivity.recordBestEffort({
      communityId: membership.communityId,
      userId: user.id,
      eventType: 'LOGIN_NEW_SESSION',
      context: requestContext,
      authenticationMethod,
      sessionId: session.id,
      notify: true,
    });
    const jwtToken = await this.jwt.signAsync({ sid: token, sub: user.id });
    const permissions = await this.rolePermissions(membership.communityId, membership.role.key);
    return {
      jwtToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        communityId: membership.communityId,
        community: communityDefaults(settings),
        role: membership.role.key,
        permissions,
        sessionId: session.id,
        emailVerified: Boolean(user.emailVerifiedAt),
        avatarUrl: membership.profile?.avatarUrl ?? null,
        dicebearStyle: membership.profile?.dicebearStyle ?? null,
        dicebearSeed: membership.profile?.dicebearSeed ?? null,
        forcePasswordChange: user.forcePasswordChange,
      },
    };
  }

  private async communitySettings(communityId: string) {
    const existing = await this.prisma.communitySettings.findUnique({ where: { communityId } });
    if (existing) return existing;
    try {
      return await this.prisma.communitySettings.create({ data: { communityId } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const raced = await this.prisma.communitySettings.findUnique({ where: { communityId } });
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async rolePermissions(communityId: string, roleKey: string) {
    const normalizedRole = normalizeSystemRole(roleKey);
    if (normalizedRole === 'owner') return [...ALL_PERMISSIONS];
    const role = await this.prisma.role.findUnique({
      where: { communityId_key: { communityId, key: normalizedRole } },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) return getSystemRolePermissions(normalizedRole);
    return role.permissions.map((entry) => entry.permission.key);
  }

  private async ownerReenrollmentChallenge(token: string | undefined) {
    const value = stringValue(token);
    if (!value) throw new UnauthorizedException('Two-factor re-enrollment challenge is required.');
    let payload: { purpose?: string; sub?: string; communityId?: string };
    try {
      payload = await this.jwt.verifyAsync(value);
    } catch {
      throw new UnauthorizedException('Two-factor re-enrollment challenge expired.');
    }
    if (payload.purpose !== 'owner-2fa-reenrollment' || !payload.sub || !payload.communityId) {
      throw new UnauthorizedException('Invalid two-factor re-enrollment challenge.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        twoFactorSecret: true,
        twoFactorReenrollmentRequired: true,
        memberships: {
          where: { communityId: payload.communityId, status: MembershipStatus.ACTIVE, role: { key: 'owner' } },
          select: { communityId: true },
        },
      },
    });
    if (!user?.twoFactorReenrollmentRequired || user.memberships.length !== 1) {
      throw new UnauthorizedException('Invalid two-factor re-enrollment challenge.');
    }
    return { id: user.id, email: user.email, twoFactorSecret: user.twoFactorSecret, communityId: user.memberships[0].communityId };
  }

  private async replaceBackupCodes(userId: string) {
    const backupCodes = generateBackupCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.userTwoFactorBackupCode.deleteMany({ where: { userId } });
      await tx.userTwoFactorBackupCode.createMany({
        data: backupCodes.map((code) => ({ userId, codeHash: hashBackupCode(code)! })),
      });
    });
    return backupCodes;
  }

  private async consumeBackupCode(userId: string, code: unknown) {
    const codeHash = hashBackupCode(code);
    if (!codeHash) return false;
    const backupCode = await this.prisma.userTwoFactorBackupCode.findFirst({ where: { userId, codeHash, usedAt: null } });
    if (!backupCode) return false;
    const result = await this.prisma.userTwoFactorBackupCode.updateMany({ where: { id: backupCode.id, usedAt: null }, data: { usedAt: new Date() } });
    return result.count === 1;
  }
}

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function stringList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export function profileData(input: Record<string, unknown>) {
  return {
    title: stringValue(input.title),
    avatarUrl: stringValue(input.avatarUrl),
    sex: normalizeSex(input.sex),
    dicebearStyle: normalizeDicebearStyle(input.dicebearStyle),
    dicebearSeed: dicebearSeedValue(input.dicebearSeed),
    bio: stringValue(input.bio),
    birthdate: dateOnlyValue(input.birthdate),
    passportExpiresAt: dateOnlyValue(input.passportExpiresAt),
    location: stringValue(input.location),
    interests: stringList(input.interests),
    skills: stringList(input.skills),
  };
}

export function defaultDicebearProfile(userId: string, sex?: string | null) {
  const normalizedSex = normalizeSex(sex);
  return {
    sex: normalizedSex,
    dicebearStyle: normalizedSex === 'F' ? 'notionists' : normalizedSex === 'M' ? 'lorelei-neutral' : 'notionists',
    dicebearSeed: userId,
  };
}

export function normalizeSex(value: unknown) {
  const raw = stringValue(value)?.toUpperCase();
  if (!raw) return undefined;
  return raw === 'M' || raw === 'F' ? raw : null;
}

export function normalizeDicebearStyle(value: unknown) {
  const raw = stringValue(value);
  return raw && ['lorelei-neutral', 'notionists', 'personas'].includes(raw) ? raw : undefined;
}

function dicebearSeedValue(value: unknown) {
  const raw = stringValue(value);
  return raw ? raw.slice(0, 128) : undefined;
}

function communityDefaults(settings: { defaultLanguage: string; timezone: string }) {
  return {
    defaultLanguage: settings.defaultLanguage,
    timezone: settings.timezone,
  };
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function dateOnlyValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function notificationPreferenceData(input: Record<string, unknown>) {
  return {
    announcementNotifications: booleanValue(input.announcementNotifications),
    eventNotifications: booleanValue(input.eventNotifications),
    birthdayReminderNotifications: booleanValue(input.birthdayReminderNotifications),
    passportExpirationRemindersEnabled: booleanValue(input.passportExpirationRemindersEnabled),
  };
}

function verifyTotp(secret: string, code: unknown) {
  const token = stringValue(code)?.replace(/\s/g, '');
  return Boolean(token && /^\d{6}$/.test(token) && verifySync({ token, secret }).valid);
}

function generateBackupCodes() {
  return Array.from({ length: 10 }, () => randomBytes(6).toString('hex').toUpperCase().replace(/(.{4})(?=.)/g, '$1-'));
}

function normalizeBackupCode(code: unknown) {
  return stringValue(code)?.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function hashBackupCode(code: unknown) {
  const normalized = normalizeBackupCode(code);
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function normalizeInviteToken(token: unknown) {
  return stringValue(token);
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(normalizeInviteToken(token) ?? '').digest('hex');
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isNotificationPreferenceInitializationRace(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (error.meta?.modelName !== 'NotificationPreference') return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.length === 2 && target.includes('userId') && target.includes('communityId');
  }
  return target === 'NotificationPreference_userId_communityId_key' || target === 'userId_communityId';
}

function sessionActivityStatus(session: {
  lastActivityAt: Date;
  idleExpiresAt: Date;
  expiresAt: Date;
}): SessionActivityStatus {
  return {
    status: 'active',
    serverNow: new Date().toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    idleExpiresAt: session.idleExpiresAt.toISOString(),
    absoluteExpiresAt: session.expiresAt.toISOString(),
    warningAfterSeconds: SESSION_WARNING_AFTER_MS / 1000,
    idleTimeoutSeconds: SESSION_IDLE_TIMEOUT_MS / 1000,
  };
}

export function newSessionDeadlines(now: Date) {
  return {
    idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_TIMEOUT_MS),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
  };
}
