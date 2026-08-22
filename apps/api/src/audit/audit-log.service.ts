import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const AUDIT_CATEGORIES = [
  'AUTHENTICATION',
  'AUTHORIZATION',
  'MEMBERS',
  'ROLES',
  'COMMUNITY',
  'SECURITY',
  'EMAIL',
  'NOTIFICATIONS',
  'TASK_BOARDS',
  'AUTOMATIONS',
  'EVENTS',
  'DOCUMENTS',
  'ANNOUNCEMENTS',
  'REGISTRATION',
  'CHAT',
  'SYSTEM',
] as const;

export const AUDIT_OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED', 'DEFERRED', 'PARTIAL'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
export type AuditSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
export type AuditActorType = 'USER' | 'SYSTEM' | 'WORKER' | 'API' | 'UNKNOWN';

export type AuditRequestContext = {
  requestId?: string;
  correlationId?: string;
  sourceIp?: string;
  userAgent?: string;
  route?: string;
  httpMethod?: string;
  httpStatus?: number;
  service?: string;
  jobId?: string;
  jobName?: string;
};

export type AuditRecordInput = {
  communityId: string;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorLabel?: string;
  actorRole?: string;
  category: AuditCategory;
  action: string;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  reason?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  requestContext?: AuditRequestContext;
  metadata?: Record<string, unknown>;
};

const MAX_METADATA_BYTES = 16_384;
const MAX_METADATA_KEYS = 64;
const MAX_NESTING_DEPTH = 4;
const MAX_STRING_LENGTH = 500;
const sensitiveKey = /password|passwordhash|token|accesstoken|refreshtoken|secret|apikey|privatekey|authorization|cookie|smtp.?password|turnstile.?secret|encryption.?key/i;
const approvedMetadataKeys = new Set([
  'actionUrl', 'added', 'alreadyRevoked', 'announcementId', 'applyMode', 'archiveReason', 'archivedAt',
  'automationRunId', 'boardId', 'boardName', 'campaignId', 'changed', 'changedById', 'channel',
  'codeCount', 'communityId', 'completed', 'createdRules', 'date', 'dedupeEnabled', 'deliveryChannels',
  'deviceType', 'emailAvailable', 'emailCampaignId', 'emailQueued', 'enabled', 'eventId', 'eventTitle',
  'expirationDate', 'failed', 'field', 'fingerprint', 'from', 'hostname', 'includeDeepLink', 'itemCount',
  'jobId', 'jobName', 'key', 'keyId', 'kind', 'linkIds', 'locale', 'memberId', 'memberUserId',
  'metadataVersion', 'mode', 'name', 'notificationId', 'permission', 'platform', 'position', 'presetId',
  'presetRuleId', 'previousRoleId', 'previousStatus', 'previousVersion', 'reason', 'recipientCount', 'reminderDate',
  'removed', 'requestId', 'restoredById', 'restoredVersion', 'retryOfRunId', 'roleId', 'roleKey', 'ruleCount',
  'ruleId', 'ruleName', 'ruleType', 'safeReason', 'sent', 'skippedDuplicates', 'source', 'stageLabel',
  'stageOffsetDays', 'status', 'subjectUserId', 'targetMemberId', 'targetMemberName', 'taskCount', 'taskId',
  'taskTitle', 'templateFallbackUsed', 'templateId', 'templateKey', 'templateName', 'templateVersion', 'timezone',
  'title', 'to', 'type', 'updatedFields', 'validationValid', 'version', 'visibility', 'years',
]);

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditRecordInput) {
    const audit = sanitizeAuditMetadata({
      category: input.category,
      outcome: input.outcome ?? 'SUCCESS',
      severity: input.severity ?? severityForOutcome(input.outcome ?? 'SUCCESS'),
      actorType: input.actorType ?? (input.actorUserId ? 'USER' : 'SYSTEM'),
      actorLabel: input.actorLabel,
      actorRole: input.actorRole,
      targetLabel: input.targetLabel,
      reason: input.reason,
      changes: input.changes,
      requestContext: input.requestContext,
    });
    const metadata = sanitizeAuditMetadata({ ...input.metadata, audit });
    return this.prisma.auditLog.create({
      data: {
        communityId: cleanSingleLine(input.communityId, 128),
        actorUserId: input.actorUserId ?? null,
        action: cleanSingleLine(input.action, 160),
        targetType: cleanSingleLine(input.targetType, 100),
        targetId: cleanSingleLine(input.targetId, 160),
        metadata,
      },
    });
  }

  async recordBestEffort(input: AuditRecordInput) {
    try {
      return await this.record(input);
    } catch (error) {
      this.logger.warn(`Audit event could not be recorded: ${cleanSingleLine(input.action, 160)}.`);
      return null;
    }
  }

  async list(communityId: string, query: Record<string, unknown>) {
    const page = boundedInt(query.page, 1, 100_000, 1);
    const pageSize = boundedInt(query.pageSize, 10, 50, 20);
    const timezone = await this.communityTimezone(communityId);
    const where = await this.listWhere(communityId, query, timezone);
    const [items, total, actionGroups, targetGroups, actorRows] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({ by: ['action'], where: { communityId }, _count: { _all: true }, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.groupBy({ by: ['targetType'], where: { communityId }, _count: { _all: true }, orderBy: { targetType: 'asc' } }),
      this.prisma.auditLog.findMany({ where: { communityId, actorUserId: { not: null } }, distinct: ['actorUserId'], select: { actorUserId: true } }),
    ]);
    const actorIds = actorRows.flatMap((row) => row.actorUserId ? [row.actorUserId] : []);
    const actors = await this.actorMap(communityId, Array.from(new Set([...actorIds, ...items.flatMap((item) => item.actorUserId ? [item.actorUserId] : [])])));
    const categories = Array.from(new Set(actionGroups.map((group) => categoryForAction(group.action))));
    return {
      items: items.map((item) => auditSummary(item, actors.get(item.actorUserId ?? ''))),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      filters: {
        categories,
        actions: actionGroups.map((group) => ({ value: group.action, count: group._count._all })),
        targetTypes: targetGroups.map((group) => ({ value: group.targetType, count: group._count._all })),
        actors: actorIds.map((id) => actors.get(id)).filter(isPresent).map((actor) => ({ id: actor.id, name: actor.name, email: actor.email })),
      },
      timezone,
    };
  }

  async detail(communityId: string, auditLogId: string) {
    const item = await this.prisma.auditLog.findFirst({ where: { id: auditLogId, communityId } });
    if (!item) throw new NotFoundException('Audit log not found.');
    const actors = await this.actorMap(communityId, item.actorUserId ? [item.actorUserId] : []);
    return auditDetail(item, actors.get(item.actorUserId ?? ''), communityId);
  }

  private async communityTimezone(communityId: string) {
    const settings = await this.prisma.communitySettings.findUnique({ where: { communityId }, select: { timezone: true } });
    return validTimezone(settings?.timezone) ? settings!.timezone : 'UTC';
  }

  private async listWhere(communityId: string, query: Record<string, unknown>, timezone: string): Promise<Prisma.AuditLogWhereInput> {
    const AND: Prisma.AuditLogWhereInput[] = [];
    const category = enumValue(query.category, AUDIT_CATEGORIES);
    const outcome = enumValue(query.outcome, AUDIT_OUTCOMES);
    const action = queryString(query.action, 160);
    const actorId = queryString(query.actorId, 128);
    const targetType = queryString(query.targetType, 100);
    const search = queryString(query.search, 120);
    if (category) AND.push(categoryWhere(category));
    if (outcome) AND.push(outcomeWhere(outcome));
    if (action) AND.push({ action });
    if (actorId) AND.push({ actorUserId: actorId });
    if (targetType) AND.push({ targetType });
    const date = auditDateRange(query, timezone);
    if (date) AND.push({ createdAt: date });
    if (search) {
      const matchingActors = await this.prisma.user.findMany({
        where: {
          memberships: { some: { communityId } },
          OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }],
        },
        select: { id: true },
        take: 50,
      });
      AND.push({
        OR: [
          { action: { contains: search, mode: 'insensitive' } },
          { targetType: { contains: search, mode: 'insensitive' } },
          { targetId: { contains: search, mode: 'insensitive' } },
          ...(matchingActors.length ? [{ actorUserId: { in: matchingActors.map((actor) => actor.id) } } as Prisma.AuditLogWhereInput] : []),
          { metadata: { path: ['requestId'], equals: search } },
          { metadata: { path: ['correlationId'], equals: search } },
          { metadata: { path: ['jobId'], equals: search } },
          { metadata: { path: ['audit', 'requestContext', 'requestId'], equals: search } },
          { metadata: { path: ['audit', 'requestContext', 'correlationId'], equals: search } },
        ],
      });
    }
    return { communityId, ...(AND.length ? { AND } : {}) };
  }

  private async actorMap(communityId: string, actorIds: string[]) {
    if (!actorIds.length) return new Map<string, AuditActor>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds }, memberships: { some: { communityId } } },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          where: { communityId },
          take: 1,
          select: {
            role: { select: { key: true } },
            profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
          },
        },
      },
    });
    return new Map(users.map((user) => {
      const membership = user.memberships[0];
      return [user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        currentRole: membership?.role.key ?? null,
        avatarUrl: membership?.profile?.avatarUrl ?? null,
        dicebearStyle: membership?.profile?.dicebearStyle ?? null,
        dicebearSeed: membership?.profile?.dicebearSeed ?? null,
      }];
    }));
  }
}

type AuditActor = {
  id: string;
  name: string;
  email: string;
  currentRole: string | null;
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
};
type AuditRow = { id: string; communityId: string; actorUserId: string | null; action: string; targetType: string; targetId: string; metadata: Prisma.JsonValue | null; createdAt: Date };

function auditSummary(item: AuditRow, actor?: AuditActor) {
  const metadata = objectValue(item.metadata);
  return {
    id: item.id,
    action: item.action,
    category: recordedCategory(metadata) ?? categoryForAction(item.action),
    outcome: recordedOutcome(metadata) ?? outcomeForAction(item.action),
    severity: recordedSeverity(metadata) ?? severityForOutcome(recordedOutcome(metadata) ?? outcomeForAction(item.action)),
    actor: actor ? { id: actor.id, name: actor.name, email: actor.email, type: 'USER', avatarUrl: actor.avatarUrl, dicebearStyle: actor.dicebearStyle, dicebearSeed: actor.dicebearSeed } : systemActor(metadata),
    target: { type: item.targetType, id: item.targetId, label: targetLabel(metadata, item.targetType, item.targetId) },
    createdAt: item.createdAt.toISOString(),
  };
}

function auditDetail(item: AuditRow, actor: AuditActor | undefined, communityId: string) {
  const metadata = objectValue(item.metadata);
  const audit = objectValue(metadata.audit);
  const summary = auditSummary(item, actor);
  return {
    ...summary,
    communityId,
    reason: stringOrNull(audit.reason) ?? stringOrNull(metadata.safeReason) ?? stringOrNull(metadata.reason),
    actor: actor
      ? { id: actor.id, name: stringOrNull(audit.actorLabel) ?? actor.name, email: actor.email, type: stringOrNull(audit.actorType) ?? 'USER', recordedRole: stringOrNull(audit.actorRole), currentRole: actor.currentRole, avatarUrl: actor.avatarUrl, dicebearStyle: actor.dicebearStyle, dicebearSeed: actor.dicebearSeed }
      : systemActor(metadata),
    target: { ...summary.target, recordedLabel: stringOrNull(audit.targetLabel) },
    changes: auditChanges(audit.changes ?? metadata.changes, metadata),
    requestContext: requestContext(audit.requestContext, metadata),
    metadata: approvedMetadata(metadata),
  };
}

export function sanitizeAuditMetadata(value: Record<string, unknown>): Prisma.InputJsonObject {
  const sanitized = sanitizeObject(value, 0);
  let result = sanitized;
  while (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_METADATA_BYTES && Object.keys(result).length) {
    const key = Object.keys(result).at(-1)!;
    delete result[key];
  }
  return result as Prisma.InputJsonObject;
}

function sanitizeObject(value: Record<string, unknown>, depth: number): Record<string, Prisma.InputJsonValue> {
  if (depth >= MAX_NESTING_DEPTH) return {};
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
    const key = cleanSingleLine(rawKey, 80);
    if (!key || sensitiveKey.test(key)) continue;
    const sanitized = sanitizeValue(rawValue, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeValue(value: unknown, depth: number): Prisma.InputJsonValue | undefined {
  if (value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return cleanSingleLine(value, MAX_STRING_LENGTH);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).flatMap((item) => {
    const sanitized = sanitizeValue(item, depth + 1);
    return sanitized === undefined ? [] : [sanitized];
  });
  if (typeof value === 'object' && depth < MAX_NESTING_DEPTH) return sanitizeObject(value as Record<string, unknown>, depth);
  return undefined;
}

function cleanSingleLine(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function categoryForAction(action: string): AuditCategory {
  const prefix = action.toLowerCase();
  if (prefix.startsWith('auth.')) return 'AUTHENTICATION';
  if (prefix.startsWith('roles.permission.denied') || prefix.startsWith('authorization.')) return 'AUTHORIZATION';
  if (prefix.startsWith('member.')) return 'MEMBERS';
  if (prefix.startsWith('role.') || prefix.startsWith('roles.') || prefix.startsWith('permission.')) return 'ROLES';
  if (prefix.startsWith('settings.') || prefix.startsWith('community.')) return 'COMMUNITY';
  if (prefix.startsWith('security.') || prefix.startsWith('audit.')) return 'SECURITY';
  if (prefix.startsWith('email.')) return 'EMAIL';
  if (prefix.startsWith('notification.') || prefix.startsWith('reminders.')) return 'NOTIFICATIONS';
  if (prefix.startsWith('automation.') || prefix.includes('.automation.')) return 'AUTOMATIONS';
  if (prefix.startsWith('task.board') || prefix.startsWith('event.task_template')) return 'TASK_BOARDS';
  if (prefix.startsWith('event.')) return 'EVENTS';
  if (prefix.startsWith('document.') || prefix.includes('attachment')) return 'DOCUMENTS';
  if (prefix.startsWith('announcement.')) return 'ANNOUNCEMENTS';
  if (prefix.startsWith('registration.')) return 'REGISTRATION';
  if (prefix.startsWith('chat.')) return 'CHAT';
  return 'SYSTEM';
}

export function outcomeForAction(action: string): AuditOutcome {
  const normalized = action.toLowerCase();
  if (normalized.includes('.denied') || normalized.includes('rate_limited')) return 'DENIED';
  if (normalized.includes('.failed') || normalized.includes('.rejected')) return 'FAILURE';
  if (normalized.includes('.suppressed') || normalized.includes('.deferred')) return 'DEFERRED';
  if (normalized.includes('.partial')) return 'PARTIAL';
  return 'SUCCESS';
}

function severityForOutcome(outcome: AuditOutcome): AuditSeverity {
  if (outcome === 'DENIED') return 'HIGH';
  if (outcome === 'FAILURE' || outcome === 'PARTIAL') return 'WARNING';
  return 'INFO';
}

function categoryWhere(category: AuditCategory): Prisma.AuditLogWhereInput {
  const prefixes: Record<AuditCategory, string[]> = {
    AUTHENTICATION: ['auth.'], AUTHORIZATION: ['authorization.', 'roles.permission.denied'], MEMBERS: ['member.'], ROLES: ['role.', 'roles.', 'permission.'],
    COMMUNITY: ['settings.', 'community.'], SECURITY: ['security.', 'audit.'], EMAIL: ['email.'], NOTIFICATIONS: ['notification.', 'reminders.'],
    TASK_BOARDS: ['task.board', 'event.task_template'], AUTOMATIONS: ['automation.', 'task.board.automation.'], EVENTS: ['event.'], DOCUMENTS: ['document.'],
    ANNOUNCEMENTS: ['announcement.'], REGISTRATION: ['registration.'], CHAT: ['chat.'], SYSTEM: ['installation.', 'system.'],
  };
  return { OR: prefixes[category].map((prefix) => ({ action: { startsWith: prefix, mode: 'insensitive' } })) };
}

function outcomeWhere(outcome: AuditOutcome): Prisma.AuditLogWhereInput {
  const denied = [{ action: { contains: '.denied', mode: 'insensitive' as const } }, { action: { contains: 'rate_limited', mode: 'insensitive' as const } }];
  const failed = [{ action: { contains: '.failed', mode: 'insensitive' as const } }, { action: { contains: '.rejected', mode: 'insensitive' as const } }];
  const deferred = [{ action: { contains: '.suppressed', mode: 'insensitive' as const } }, { action: { contains: '.deferred', mode: 'insensitive' as const } }];
  const partial = [{ action: { contains: '.partial', mode: 'insensitive' as const } }];
  if (outcome === 'DENIED') return { OR: denied };
  if (outcome === 'FAILURE') return { OR: failed };
  if (outcome === 'DEFERRED') return { OR: deferred };
  if (outcome === 'PARTIAL') return { OR: partial };
  return { NOT: [...denied, ...failed, ...deferred, ...partial] };
}

function auditDateRange(query: Record<string, unknown>, timezone: string): { gte?: Date; lte?: Date; lt?: Date } | null {
  const range = queryString(query.range, 20) ?? '30d';
  const now = new Date();
  if (range === 'all') return null;
  if (range === 'custom') {
    const from = dateOnly(query.from, timezone);
    const to = dateOnly(query.to, timezone, true);
    if (!from && !to) throw new BadRequestException('Custom audit range requires a start or end date.');
    return { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
  }
  const duration: Record<string, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, '90d': 90 * 86_400_000 };
  if (!duration[range]) throw new BadRequestException('Invalid audit date range.');
  return { gte: new Date(now.getTime() - duration[range]), lte: now };
}

function dateOnly(value: unknown, timezone: string, nextDay = false) {
  const text = queryString(value, 10);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)));
  return zonedDateTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), timezone);
}

function zonedDateTimeToUtc(year: number, month: number, day: number, timezone: string) {
  let result = new Date(Date.UTC(year, month - 1, day));
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(result);
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
    const observed = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    const desired = Date.UTC(year, month - 1, day);
    result = new Date(result.getTime() + desired - observed);
  }
  return result;
}

function validTimezone(value?: string | null) {
  if (!value) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); return true; } catch { return false; }
}

function boundedInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function queryString(value: unknown, maxLength: number) {
  const result = cleanSingleLine(value, maxLength);
  return result || null;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  const candidate = queryString(value, 80);
  return candidate && values.includes(candidate as T[number]) ? candidate as T[number] : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? cleanSingleLine(value, MAX_STRING_LENGTH) : null;
}

function recordedCategory(metadata: Record<string, unknown>) {
  return enumValue(objectValue(metadata.audit).category, AUDIT_CATEGORIES);
}

function recordedOutcome(metadata: Record<string, unknown>) {
  return enumValue(objectValue(metadata.audit).outcome, AUDIT_OUTCOMES);
}

function recordedSeverity(metadata: Record<string, unknown>): AuditSeverity | null {
  const value = stringOrNull(objectValue(metadata.audit).severity);
  return value && ['INFO', 'WARNING', 'HIGH', 'CRITICAL'].includes(value) ? value as AuditSeverity : null;
}

function systemActor(metadata: Record<string, unknown>) {
  const audit = objectValue(metadata.audit);
  return { id: null, name: stringOrNull(audit.actorLabel) ?? 'System', email: null, type: stringOrNull(audit.actorType) ?? 'SYSTEM', recordedRole: stringOrNull(audit.actorRole), currentRole: null };
}

function targetLabel(metadata: Record<string, unknown>, targetType: string, targetId: string) {
  const audit = objectValue(metadata.audit);
  for (const candidate of [audit.targetLabel, metadata.targetMemberName, metadata.boardName, metadata.eventTitle, metadata.taskTitle, metadata.templateName, metadata.title, metadata.name]) {
    const value = stringOrNull(candidate);
    if (value) return value;
  }
  return `${targetType} ${targetId}`;
}

function auditChanges(value: unknown, metadata: Record<string, unknown>) {
  const changes = objectValue(value);
  const rows = Object.entries(changes).flatMap(([field, raw]) => {
    const change = objectValue(raw);
    if (!('from' in change) && !('to' in change)) return [];
    return [{ field: cleanSingleLine(field, 80), from: displayValue(change.from), to: displayValue(change.to) }];
  }).slice(0, 20);
  if (rows.length) return rows;
  if ('from' in metadata || 'to' in metadata) return [{ field: 'status', from: displayValue(metadata.from), to: displayValue(metadata.to) }];
  return [];
}

function requestContext(value: unknown, metadata: Record<string, unknown>) {
  const context = objectValue(value);
  const keys = ['requestId', 'correlationId', 'jobId', 'jobName', 'sourceIp', 'userAgent', 'route', 'httpMethod', 'httpStatus', 'service'] as const;
  return keys.flatMap((key) => {
    const raw = context[key] ?? metadata[key];
    const shown = displayValue(raw);
    return shown === null ? [] : [{ key, value: shown }];
  });
}

function approvedMetadata(metadata: Record<string, unknown>) {
  return Object.entries(metadata).flatMap(([key, value]) => {
    if (key === 'audit' || sensitiveKey.test(key) || !approvedMetadataKeys.has(key)) return [];
    const shown = displayValue(value);
    return shown === null ? [] : [{ key, value: shown }];
  }).slice(0, 40);
}

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return cleanSingleLine(value, MAX_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => displayValue(item)).filter(isPresent).join(', ').slice(0, MAX_STRING_LENGTH);
  if (typeof value === 'object') {
    const safe = sanitizeAuditMetadata(value as Record<string, unknown>);
    return cleanSingleLine(JSON.stringify(safe), MAX_STRING_LENGTH) || null;
  }
  return null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
