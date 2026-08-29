import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AuditLogService, type AuditRequestContext } from '../audit/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type RequestUser } from './auth.service';
import { PasskeyChallengeService } from './passkey-challenge.service';
import { assertPasskeyRequestOrigin, loadPasskeyConfig } from './passkey-config';
import { StepUpService } from './step-up.service';
import { SecurityActivityService } from './security-activity.service';

const MAX_PASSKEY_NAME_LENGTH = 80;

export type PasskeyResponse = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
};

@Injectable()
export class PasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: PasskeyChallengeService,
    private readonly auth: AuthService,
    private readonly auditLogs: AuditLogService,
    private readonly stepUp: StepUpService,
    private readonly securityActivity: SecurityActivityService,
  ) {}

  assertRequestOrigin(origin: string | undefined) {
    let config;
    try {
      config = loadPasskeyConfig();
    } catch {
      throw new ServiceUnavailableException('Passkey enrollment is not configured.');
    }
    try {
      assertPasskeyRequestOrigin(origin, config);
    } catch {
      throw new ForbiddenException('Invalid passkey request origin.');
    }
  }

  async list(userId: string): Promise<PasskeyResponse[]> {
    const credentials = await this.prisma.passkeyCredential.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        deviceType: true,
        backedUp: true,
      },
    });
    return credentials.map(passkeyResponse);
  }

  async authenticationOptions(sourceIp: string) {
    await this.challenges.enforceRateLimit('authentication-options', sourceIp, 20, 5 * 60);
    const config = loadPasskeyConfig();
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: 'required',
    });
    const attemptId = await this.challenges.createAuthenticationAttempt(options.challenge);
    return { attemptId, options };
  }

  async verifyAuthentication(sourceIp: string, input: Record<string, unknown>, requestContext?: AuditRequestContext) {
    await this.challenges.enforceRateLimit('authentication-verify', sourceIp, 30, 5 * 60);
    const attemptId = stringValue(input.attemptId);
    const response = authenticationResponse(input.response);
    if (!attemptId || !response) throw authenticationFailed();

    const attempt = await this.challenges.consumeAuthenticationAttempt(attemptId);
    if (!attempt) throw authenticationFailed();

    const { credential, membership } = await this.verifyAuthenticationCredential(
      response,
      attempt.challenge,
      requestContext,
    );

    let session;
    try {
      session = await this.auth.createPasskeySession(credential.userId, requestContext);
    } catch {
      throw authenticationFailed();
    }
    await this.auditLogs.recordBestEffort({
      communityId: membership.communityId,
      actorUserId: credential.userId,
      actorRole: membership.role.key,
      category: 'AUTHENTICATION',
      action: 'auth.login.succeeded',
      targetType: 'User',
      targetId: credential.userId,
      requestContext,
      metadata: { mode: 'PASSKEY' },
    });
    return session;
  }

  async stepUpOptions(user: RequestUser) {
    await this.challenges.enforceRateLimit('step-up-options', `${user.id}:${user.sessionId}`, 12, 5 * 60);
    const config = loadPasskeyConfig();
    const credentials = await this.prisma.passkeyCredential.findMany({
      where: { userId: user.id, revokedAt: null },
      select: { credentialId: true, transports: true },
    });
    if (!credentials.length) throw authenticationFailed();
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      userVerification: 'required',
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
    });
    const attemptId = await this.challenges.createStepUpAttempt({
      challenge: options.challenge,
      userId: user.id,
      sessionId: user.sessionId,
    });
    return { attemptId, options };
  }

  async verifyStepUp(user: RequestUser, input: Record<string, unknown>, requestContext?: AuditRequestContext) {
    await this.challenges.enforceRateLimit('step-up-verify', `${user.id}:${user.sessionId}`, 20, 5 * 60);
    const attemptId = stringValue(input.attemptId);
    const response = authenticationResponse(input.response);
    if (!attemptId || !response) {
      await this.stepUp.recordPasskeyFailure(user, requestContext);
      throw authenticationFailed();
    }
    const attempt = await this.challenges.consumeStepUpAttempt(attemptId, user.id, user.sessionId);
    if (!attempt) {
      await this.stepUp.recordPasskeyFailure(user, requestContext, 'ATTEMPT_REJECTED');
      throw authenticationFailed();
    }
    try {
      await this.verifyAuthenticationCredential(response, attempt.challenge, requestContext, user);
    } catch {
      throw authenticationFailed();
    }
    return { verified: true };
  }

  async registrationOptions(user: RequestUser) {
    await this.challenges.enforceRateLimit('registration-options', `${user.id}:${user.sessionId}`, 10, 5 * 60);
    const config = loadPasskeyConfig();
    const [account, credentials] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, email: true, name: true } }),
      this.prisma.passkeyCredential.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      }),
    ]);
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userID: Buffer.from(account.id, 'utf8'),
      userName: account.email,
      userDisplayName: account.name,
      attestationType: 'none',
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
    });
    const attemptId = await this.challenges.createRegistrationAttempt({
      challenge: options.challenge,
      userId: user.id,
      sessionId: user.sessionId,
      webauthnUserId: options.user.id,
    });
    return { attemptId, options };
  }

  async verifyRegistration(user: RequestUser, input: Record<string, unknown>, requestContext?: AuditRequestContext): Promise<PasskeyResponse> {
    await this.challenges.enforceRateLimit('registration-verify', `${user.id}:${user.sessionId}`, 20, 5 * 60);
    const attemptId = stringValue(input.attemptId);
    const response = registrationResponse(input.response);
    if (!attemptId || !response) throw new BadRequestException('Invalid passkey registration response.');
    const attempt = await this.challenges.consumeRegistrationAttempt(attemptId, user.id, user.sessionId);
    if (!attempt) throw new BadRequestException('Passkey setup expired or was already used. Please try again.');

    const config = loadPasskeyConfig();
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: attempt.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        requireUserPresence: true,
        requireUserVerification: true,
      });
    } catch {
      throw new BadRequestException('Passkey verification failed. Please try again.');
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey verification failed. Please try again.');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const duplicate = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: credential.id },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('This passkey is already registered.');
    const activeCount = await this.prisma.passkeyCredential.count({ where: { userId: user.id, revokedAt: null } });
    const name = passkeyName(input.name, activeCount + 1);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const passkey = await tx.passkeyCredential.create({
          data: {
            userId: user.id,
            credentialId: credential.id,
            webauthnUserId: attempt.webauthnUserId,
            publicKey: Buffer.from(credential.publicKey),
            counter: BigInt(credential.counter),
            transports: credential.transports ?? [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            name,
          },
          select: { id: true, name: true, createdAt: true, lastUsedAt: true, deviceType: true, backedUp: true },
        });
        await tx.auditLog.create({
          data: {
            communityId: user.communityId,
            actorUserId: user.id,
            action: 'auth.passkey.registered',
            targetType: 'PasskeyCredential',
            targetId: passkey.id,
            metadata: { name: passkey.name, deviceType: passkey.deviceType, backedUp: passkey.backedUp },
          },
        });
        return passkey;
      });
      await this.securityActivity.recordBestEffort({ communityId: user.communityId, userId: user.id, eventType: 'PASSKEY_ADDED', context: requestContext, sessionId: user.sessionId, metadata: { passkeyName: created.name }, notify: true });
      return passkeyResponse(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This passkey is already registered.');
      }
      throw error;
    }
  }

  async rename(user: RequestUser, id: string, input: Record<string, unknown>): Promise<PasskeyResponse> {
    await this.challenges.enforceRateLimit('rename', `${user.id}:${user.sessionId}`, 20, 5 * 60);
    const name = requiredPasskeyName(input.name);
    const credential = await this.ownedCredential(user.id, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const passkey = await tx.passkeyCredential.update({
        where: { id: credential.id },
        data: { name },
        select: { id: true, name: true, createdAt: true, lastUsedAt: true, deviceType: true, backedUp: true },
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'auth.passkey.renamed',
          targetType: 'PasskeyCredential',
          targetId: passkey.id,
          metadata: { name: passkey.name },
        },
      });
      return passkey;
    });
    return passkeyResponse(updated);
  }

  async remove(user: RequestUser, id: string, requestContext?: AuditRequestContext) {
    await this.challenges.enforceRateLimit('remove', `${user.id}:${user.sessionId}`, 10, 5 * 60);
    const credential = await this.ownedCredential(user.id, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.passkeyCredential.update({ where: { id: credential.id }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'auth.passkey.removed',
          targetType: 'PasskeyCredential',
          targetId: credential.id,
          metadata: { name: credential.name },
        },
      });
    });
    await this.securityActivity.recordBestEffort({ communityId: user.communityId, userId: user.id, eventType: 'PASSKEY_REMOVED', context: requestContext, sessionId: user.sessionId, metadata: { passkeyName: credential.name }, notify: true });
    return { removed: true };
  }

  private async ownedCredential(userId: string, id: string) {
    const credential = await this.prisma.passkeyCredential.findFirst({
      where: { id, userId, revokedAt: null },
      select: { id: true, name: true },
    });
    if (!credential) throw new NotFoundException('Passkey not found.');
    return credential;
  }

  private async verifyAuthenticationCredential(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    requestContext?: AuditRequestContext,
    expectedUser?: RequestUser,
  ) {
    const credential = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { role: true },
            },
          },
        },
      },
    });
    if (!credential
      || credential.revokedAt
      || credential.user.memberships.length === 0
      || credential.user.twoFactorReenrollmentRequired
      || (expectedUser && credential.userId !== expectedUser.id)) {
      if (expectedUser) await this.stepUp.recordPasskeyFailure(expectedUser, requestContext, 'CREDENTIAL_REJECTED');
      throw authenticationFailed();
    }
    if (response.response.userHandle && !sameUserHandle(response.response.userHandle, credential.webauthnUserId)) {
      await this.recordAssertionFailure(credential, requestContext, 'USER_HANDLE_MISMATCH', expectedUser);
      throw authenticationFailed();
    }

    const config = loadPasskeyConfig();
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.counter),
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
        requireUserVerification: true,
      });
    } catch {
      await this.recordAssertionFailure(credential, requestContext, 'ASSERTION_REJECTED', expectedUser);
      throw authenticationFailed();
    }
    if (!verification.verified || !verification.authenticationInfo.userVerified) {
      await this.recordAssertionFailure(credential, requestContext, 'ASSERTION_REJECTED', expectedUser);
      throw authenticationFailed();
    }

    const { newCounter, credentialDeviceType, credentialBackedUp } = verification.authenticationInfo;
    const updated = await this.prisma.passkeyCredential.updateMany({
      where: { id: credential.id, revokedAt: null, counter: credential.counter },
      data: {
        counter: BigInt(newCounter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      await this.recordAssertionFailure(credential, requestContext, 'COUNTER_CONFLICT', expectedUser);
      throw authenticationFailed();
    }
    return { credential, membership: credential.user.memberships[0] };
  }

  private recordAssertionFailure(
    credential: { userId: string; user: { memberships: Array<{ communityId: string; role: { key: string } }> } },
    requestContext: AuditRequestContext | undefined,
    reason: string,
    expectedUser?: RequestUser,
  ) {
    return expectedUser
      ? this.stepUp.recordPasskeyFailure(expectedUser, requestContext, reason)
      : this.recordAuthenticationFailure(credential, requestContext, reason);
  }

  private async recordAuthenticationFailure(
    credential: { userId: string; user: { memberships: Array<{ communityId: string; role: { key: string } }> } },
    requestContext: AuditRequestContext | undefined,
    reason: string,
  ) {
    const membership = credential.user.memberships[0];
    if (!membership) return;
    await this.auditLogs.recordBestEffort({
      communityId: membership.communityId,
      actorUserId: credential.userId,
      actorRole: membership.role.key,
      category: 'AUTHENTICATION',
      action: 'auth.login.failed',
      outcome: 'FAILURE',
      severity: 'WARNING',
      targetType: 'User',
      targetId: credential.userId,
      reason,
      requestContext,
      metadata: { mode: 'PASSKEY' },
    });
    await this.securityActivity.recordFailedLogin({
      communityId: membership.communityId,
      userId: credential.userId,
      context: requestContext,
      authenticationMethod: 'PASSKEY',
    });
  }
}

function registrationResponse(value: unknown): RegistrationResponseJSON | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Partial<RegistrationResponseJSON>;
  if (typeof response.id !== 'string' || typeof response.rawId !== 'string' || response.type !== 'public-key') return null;
  if (!response.response || typeof response.response.clientDataJSON !== 'string' || typeof response.response.attestationObject !== 'string') return null;
  if (!response.clientExtensionResults || typeof response.clientExtensionResults !== 'object') return null;
  return response as RegistrationResponseJSON;
}

function authenticationResponse(value: unknown): AuthenticationResponseJSON | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Partial<AuthenticationResponseJSON>;
  if (typeof response.id !== 'string' || typeof response.rawId !== 'string' || response.type !== 'public-key') return null;
  if (!response.response
    || typeof response.response.clientDataJSON !== 'string'
    || typeof response.response.authenticatorData !== 'string'
    || typeof response.response.signature !== 'string') return null;
  if (!response.clientExtensionResults || typeof response.clientExtensionResults !== 'object') return null;
  return response as AuthenticationResponseJSON;
}

function sameUserHandle(received: string, expected: string) {
  const receivedBytes = Buffer.from(received, 'base64url');
  const expectedBytes = Buffer.from(expected, 'base64url');
  return receivedBytes.length === expectedBytes.length && receivedBytes.equals(expectedBytes);
}

function authenticationFailed() {
  return new UnauthorizedException('Passkey authentication failed.');
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredPasskeyName(value: unknown) {
  const name = stringValue(value).replace(/\s+/g, ' ').slice(0, MAX_PASSKEY_NAME_LENGTH);
  if (!name) throw new BadRequestException('Passkey name is required.');
  return name;
}

function passkeyName(value: unknown, position: number) {
  const supplied = stringValue(value).replace(/\s+/g, ' ').slice(0, MAX_PASSKEY_NAME_LENGTH);
  return supplied || (position === 1 ? 'Passkey' : `Passkey ${position}`);
}

function passkeyResponse(value: { id: string; name: string; createdAt: Date; lastUsedAt: Date | null; deviceType: string; backedUp: boolean }): PasskeyResponse {
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt.toISOString(),
    lastUsedAt: value.lastUsedAt?.toISOString() ?? null,
    deviceType: value.deviceType,
    backedUp: value.backedUp,
  };
}
