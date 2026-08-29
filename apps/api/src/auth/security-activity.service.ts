import { BadRequestException, Injectable, NotFoundException, Optional, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseSecurityRetentionDays } from '@pe/shared';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditRequestContext } from '../audit/audit-log.service';
import type { RequestUser } from './auth.service';
import { PasskeyChallengeService } from './passkey-challenge.service';
import { realtimeSessionRegistry } from './realtime-session-registry';
import {
  createSecurityActivityCsv,
  resolveSecurityExportRange,
  SECURITY_ACTIVITY_EXPORT_MAX_ROWS,
  securityExportFilename,
  SecurityExportValidationError,
} from './security-activity-export';

const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const FAILED_LOGIN_ALERT_THRESHOLD = 5;
const FAILED_LOGIN_EMAIL_COOLDOWN_MS = 60 * 60 * 1000;

export type SecurityEventType =
  | 'LOGIN_NEW_SESSION'
  | 'LOGIN_FAILED'
  | 'LOGIN_FAILED_ALERT'
  | 'PASSWORD_CHANGED'
  | 'EMAIL_CHANGED'
  | 'TOTP_ENABLED'
  | 'TOTP_DISABLED'
  | 'TOTP_REENROLLED'
  | 'BACKUP_CODES_REGENERATED'
  | 'PASSKEY_ADDED'
  | 'PASSKEY_REMOVED'
  | 'SESSION_REVOKED'
  | 'OTHER_SESSIONS_REVOKED'
  | 'SECURITY_ACTIVITY_EXPORTED'
  | 'ACCOUNT_ROLE_CHANGED'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'ACCOUNT_PASSWORD_RESET'
  | 'ACCOUNT_TOTP_RESET';

type RecordSecurityEventInput = {
  communityId: string;
  userId: string;
  eventType: SecurityEventType;
  result?: 'SUCCESS' | 'FAILURE';
  context?: AuditRequestContext;
  authenticationMethod?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
  notify?: boolean;
  notificationEmail?: string;
  dedupeKey?: string;
};

@Injectable()
export class SecurityActivityService {
  private readonly retentionDays = parseSecurityRetentionDays('SECURITY_EVENT_RETENTION_DAYS', process.env.SECURITY_EVENT_RETENTION_DAYS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Optional() private readonly authenticationLimits?: PasskeyChallengeService,
  ) {}

  async record(input: RecordSecurityEventInput) {
    const event = await this.prisma.securityEvent.create({
      data: {
        communityId: input.communityId,
        userId: input.userId,
        eventType: input.eventType,
        result: input.result ?? 'SUCCESS',
        ipAddress: contextValue(input.context?.sourceIp, 'Unknown', 64),
        countryCode: contextValue(input.context?.countryCode, '', 2) || null,
        countryName: contextValue(input.context?.countryName, 'Unknown', 100),
        browser: contextValue(input.context?.browser, 'Unknown', 80),
        operatingSystem: contextValue(input.context?.operatingSystem, 'Unknown', 80),
        authenticationMethod: contextValue(input.authenticationMethod, '', 40) || null,
        sessionId: contextValue(input.sessionId, '', 128) || null,
        metadata: safeSecurityMetadata(input.metadata),
        dedupeKey: input.dedupeKey,
      },
    });
    if (input.notify) await this.queueNotification(event.id, input.notificationEmail);
    return event;
  }

  async recordBestEffort(input: RecordSecurityEventInput) {
    try {
      return await this.record(input);
    } catch {
      return null;
    }
  }

  async recordFailedLogin(input: Omit<RecordSecurityEventInput, 'eventType' | 'result' | 'notify'>) {
    const failure = await this.recordBestEffort({ ...input, eventType: 'LOGIN_FAILED', result: 'FAILURE' });
    if (!failure) return;
    const windowStart = new Date(Date.now() - FAILED_LOGIN_WINDOW_MS);
    const failures = await this.prisma.securityEvent.findMany({
      where: { userId: input.userId, eventType: 'LOGIN_FAILED', occurredAt: { gte: windowStart } },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: { occurredAt: true, ipAddress: true, countryName: true, browser: true, operatingSystem: true },
    });
    if (failures.length < FAILED_LOGIN_ALERT_THRESHOLD) return;
    const bucket = Math.floor(Date.now() / FAILED_LOGIN_EMAIL_COOLDOWN_MS);
    try {
      await this.record({
        ...input,
        eventType: 'LOGIN_FAILED_ALERT',
        result: 'FAILURE',
        notify: true,
        dedupeKey: `failed-login-alert:${input.userId}:${bucket}`,
        metadata: {
          attemptCount: failures.length,
          periodStart: failures.at(-1)?.occurredAt.toISOString(),
          periodEnd: failures[0]?.occurredAt.toISOString(),
          sources: failures.slice(0, 5).map((item) => ({ ipAddress: item.ipAddress, countryName: item.countryName })),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }

  async sessions(user: RequestUser) {
    const now = new Date();
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: now }, idleExpiresAt: { gt: now } },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, createdAt: true, lastActivityAt: true, idleExpiresAt: true, expiresAt: true,
        authenticationMethod: true, createdIp: true, createdCountryName: true,
        lastSeenIp: true, lastSeenCountryName: true, browser: true, operatingSystem: true,
      },
    });
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        current: session.id === user.sessionId,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastActivityAt.toISOString(),
        idleExpiresAt: session.idleExpiresAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        browser: session.browser ?? 'Unknown',
        operatingSystem: session.operatingSystem ?? 'Unknown',
        ipAddress: session.lastSeenIp ?? session.createdIp ?? 'Unknown',
        country: session.lastSeenCountryName ?? session.createdCountryName ?? 'Unknown',
        createdIpAddress: session.createdIp ?? 'Unknown',
        createdCountry: session.createdCountryName ?? 'Unknown',
        authenticationMethod: session.authenticationMethod ?? 'Unknown',
      })),
    };
  }

  async revokeSession(user: RequestUser, sessionId: string, context?: AuditRequestContext) {
    if (sessionId === user.sessionId) throw new BadRequestException('Use Sign out for the current session.');
    const target = await this.prisma.session.findFirst({ where: { id: sessionId, userId: user.id }, select: { id: true } });
    if (!target) throw new NotFoundException('Session not found.');
    const deleted = await this.prisma.session.deleteMany({ where: { id: target.id, userId: user.id } });
    if (!deleted.count) throw new NotFoundException('Session not found.');
    realtimeSessionRegistry.revokeSession(target.id);
    await this.recordBestEffort({ communityId: user.communityId, userId: user.id, eventType: 'SESSION_REVOKED', context, sessionId: target.id, notify: true });
    return { revoked: true };
  }

  async revokeOtherSessions(user: RequestUser, context?: AuditRequestContext) {
    const deleted = await this.prisma.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
    realtimeSessionRegistry.revokeUser(user.id, user.sessionId);
    await this.recordBestEffort({
      communityId: user.communityId,
      userId: user.id,
      eventType: 'OTHER_SESSIONS_REVOKED',
      context,
      sessionId: user.sessionId,
      metadata: { revokedCount: deleted.count },
      notify: true,
    });
    return { revokedCount: deleted.count };
  }

  async activity(user: RequestUser, pageValue: unknown, pageSizeValue: unknown) {
    const page = boundedInteger(pageValue, 1, 100_000, 1);
    const pageSize = boundedInteger(pageSizeValue, 5, 25, 10);
    const where = { userId: user.id, communityId: user.communityId, eventType: { not: 'LOGIN_FAILED' } };
    const [items, total] = await Promise.all([
      this.prisma.securityEvent.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.securityEvent.count({ where }),
    ]);
    return {
      items: items.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        result: event.result,
        occurredAt: event.occurredAt.toISOString(),
        ipAddress: event.ipAddress,
        country: event.countryName,
        browser: event.browser,
        operatingSystem: event.operatingSystem,
        authenticationMethod: event.authenticationMethod,
        metadata: publicSecurityMetadata(event.metadata),
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      retentionDays: this.retentionDays,
    };
  }

  async exportActivity(
    user: RequestUser,
    input: { range?: string; from?: string; to?: string; format?: string },
    context?: AuditRequestContext,
  ) {
    if (this.authenticationLimits) {
      const source = context?.sourceIp || 'Unknown';
      await Promise.all([
        this.authenticationLimits.enforceAuthenticationRateLimit('security-export:session', `${user.id}:${user.sessionId}`, 3, 5 * 60),
        this.authenticationLimits.enforceAuthenticationRateLimit('security-export:source', source, 10, 15 * 60),
      ]);
    }
    if (input.format && input.format !== 'csv') {
      throw new BadRequestException({ code: 'SECURITY_EXPORT_INVALID_FORMAT', message: 'Only CSV security exports are supported.' });
    }
    let timeframe: ReturnType<typeof resolveSecurityExportRange>;
    try {
      timeframe = resolveSecurityExportRange({
        range: input.range,
        from: input.from,
        to: input.to,
        retentionDays: this.retentionDays,
      });
    } catch (error) {
      if (error instanceof SecurityExportValidationError) {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      throw error;
    }
    const rows = await this.prisma.securityEvent.findMany({
      where: {
        userId: user.id,
        communityId: user.communityId,
        eventType: { not: 'LOGIN_FAILED' },
        occurredAt: { gte: timeframe.from, lte: timeframe.to },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: SECURITY_ACTIVITY_EXPORT_MAX_ROWS + 1,
      select: {
        eventType: true,
        result: true,
        occurredAt: true,
        ipAddress: true,
        countryName: true,
        browser: true,
        operatingSystem: true,
        authenticationMethod: true,
        sessionId: true,
        metadata: true,
      },
    });
    if (rows.length > SECURITY_ACTIVITY_EXPORT_MAX_ROWS) {
      throw new PayloadTooLargeException({
        code: 'SECURITY_EXPORT_TOO_LARGE',
        message: 'The export contains too many records. Choose a narrower timeframe.',
      });
    }
    const content = createSecurityActivityCsv(rows, user.sessionId);
    await this.record({
      communityId: user.communityId,
      userId: user.id,
      eventType: 'SECURITY_ACTIVITY_EXPORTED',
      context,
      sessionId: user.sessionId,
      metadata: {
        timeframe: timeframe.label,
        from: timeframe.from.toISOString(),
        to: timeframe.to.toISOString(),
        rowCount: rows.length,
      },
    });
    return {
      content,
      filename: securityExportFilename(timeframe.from, timeframe.to),
      rowCount: rows.length,
    };
  }

  private async queueNotification(eventId: string, recipientEmail?: string) {
    try {
      await this.email.queueSecurityEventEmail(eventId, recipientEmail);
      await this.prisma.securityEvent.updateMany({ where: { id: eventId, emailQueuedAt: null }, data: { emailQueuedAt: new Date() } });
    } catch {
      // The committed security action and event must not depend on mail availability.
    }
  }
}

function contextValue(value: unknown, fallback: string, maximum: number) {
  return typeof value === 'string' && value.trim() ? value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum) : fallback;
}

function safeSecurityMetadata(input?: Record<string, unknown>) {
  if (!input) return undefined;
  const allowed = new Set(['attemptCount', 'periodStart', 'periodEnd', 'sources', 'passkeyName', 'revokedCount', 'role', 'status', 'timeframe', 'from', 'to', 'rowCount']);
  return Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key))) as Prisma.InputJsonObject;
}

function publicSecurityMetadata(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = value as Record<string, Prisma.JsonValue>;
  return Object.fromEntries(['attemptCount', 'passkeyName', 'revokedCount', 'role', 'status'].flatMap((key) => key in metadata ? [[key, metadata[key]]] : []));
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
