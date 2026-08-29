import type { Prisma } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const SECURITY_ACTIVITY_EXPORT_MAX_ROWS = 10_000;
export const SECURITY_ACTIVITY_EXPORT_RANGES = [7, 30, 90, 180] as const;

export type SecurityActivityExportRow = {
  eventType: string;
  result: string;
  occurredAt: Date;
  ipAddress: string;
  countryName: string;
  browser: string;
  operatingSystem: string;
  authenticationMethod: string | null;
  sessionId: string | null;
  metadata: Prisma.JsonValue | null;
};

export class SecurityExportValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SecurityExportValidationError';
  }
}

export function resolveSecurityExportRange(input: {
  range: unknown;
  from: unknown;
  to: unknown;
  retentionDays: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const range = typeof input.range === 'string' ? input.range : '';
  if (SECURITY_ACTIVITY_EXPORT_RANGES.map(String).includes(range)) {
    const days = Number(range);
    if (days > input.retentionDays) throw invalidRange('The selected range exceeds retained security history.');
    return { from: new Date(now.getTime() - days * DAY_MS), to: now, label: `${days}-days` };
  }
  if (range !== 'custom') throw invalidRange('Choose a supported security activity timeframe.');
  const from = parseDate(input.from);
  const to = parseDate(input.to);
  if (from.getTime() > to.getTime()) throw invalidRange('The start date must be before the end date.');
  if (to.getTime() > now.getTime()) throw invalidRange('Future dates cannot be exported.');
  if (to.getTime() - from.getTime() > input.retentionDays * DAY_MS) {
    throw invalidRange('The selected range exceeds retained security history.');
  }
  const retentionBoundary = now.getTime() - input.retentionDays * DAY_MS;
  if (from.getTime() < retentionBoundary) throw invalidRange('The start date is outside retained security history.');
  return { from, to, label: 'custom' };
}

export function createSecurityActivityCsv(rows: SecurityActivityExportRow[], currentSessionId: string) {
  const header = [
    'Timestamp (UTC)',
    'Event',
    'Result',
    'Authentication method',
    'Browser',
    'Operating system',
    'IP address',
    'Country',
    'Session context',
    'Description',
  ];
  return [header, ...rows.map((row) => [
    row.occurredAt.toISOString(),
    securityEventName(row.eventType),
    row.result,
    row.authenticationMethod ?? '',
    row.browser,
    row.operatingSystem,
    row.ipAddress,
    row.countryName,
    row.sessionId ? row.sessionId === currentSessionId ? 'Current session' : 'Related session' : '',
    securityEventDescription(row.eventType, row.metadata),
  ])].map((cells) => cells.map(csvCell).join(',')).join('\r\n');
}

export function securityExportFilename(from: Date, to: Date) {
  return `pe-community-security-activity-${datePart(from)}-to-${datePart(to)}.csv`;
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw invalidRange('Both custom dates are required.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw invalidRange('A custom date is invalid.');
  return parsed;
}

function invalidRange(message: string) {
  return new SecurityExportValidationError('SECURITY_EXPORT_INVALID_RANGE', message);
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  const neutralized = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function datePart(value: Date) {
  return value.toISOString().slice(0, 10);
}

function securityEventDescription(eventType: string, metadata: Prisma.JsonValue | null) {
  const descriptions: Record<string, string> = {
    LOGIN_NEW_SESSION: 'A new authenticated session was created.',
    LOGIN_FAILED_ALERT: 'Repeated unsuccessful sign-in attempts were detected.',
    PASSWORD_CHANGED: 'The account password was changed.',
    EMAIL_CHANGED: 'The account email address was changed.',
    TOTP_ENABLED: 'Authenticator-based verification was enabled.',
    TOTP_DISABLED: 'Authenticator-based verification was disabled.',
    TOTP_REENROLLED: 'Authenticator-based verification was re-enrolled.',
    BACKUP_CODES_REGENERATED: 'Backup authentication codes were regenerated.',
    PASSKEY_ADDED: 'A passkey was added.',
    PASSKEY_REMOVED: 'A passkey was removed.',
    SESSION_REVOKED: 'A session was revoked.',
    OTHER_SESSIONS_REVOKED: 'Other sessions were revoked.',
    ACCOUNT_ROLE_CHANGED: 'The account role was changed.',
    ACCOUNT_STATUS_CHANGED: 'The account status was changed.',
    ACCOUNT_PASSWORD_RESET: 'An administrator reset the account password.',
    ACCOUNT_TOTP_RESET: 'An administrator reset authenticator verification.',
    SECURITY_ACTIVITY_EXPORTED: 'Security activity was exported.',
  };
  const base = descriptions[eventType] ?? 'A security-related account event occurred.';
  const passkeyName = jsonString(metadata, 'passkeyName');
  return passkeyName && (eventType === 'PASSKEY_ADDED' || eventType === 'PASSKEY_REMOVED') ? `${base} Passkey: ${passkeyName}` : base;
}

function securityEventName(eventType: string) {
  const names: Record<string, string> = {
    LOGIN_NEW_SESSION: 'New sign-in session',
    LOGIN_FAILED_ALERT: 'Multiple unsuccessful sign-in attempts',
    PASSWORD_CHANGED: 'Password changed',
    EMAIL_CHANGED: 'Email address changed',
    TOTP_ENABLED: 'Two-factor authentication enabled',
    TOTP_DISABLED: 'Two-factor authentication disabled',
    TOTP_REENROLLED: 'Two-factor authentication re-enrolled',
    BACKUP_CODES_REGENERATED: 'Backup codes regenerated',
    PASSKEY_ADDED: 'Passkey added',
    PASSKEY_REMOVED: 'Passkey removed',
    SESSION_REVOKED: 'Session revoked',
    OTHER_SESSIONS_REVOKED: 'Other sessions signed out',
    ACCOUNT_ROLE_CHANGED: 'Account role changed',
    ACCOUNT_STATUS_CHANGED: 'Account status changed',
    ACCOUNT_PASSWORD_RESET: 'Password reset by an administrator',
    ACCOUNT_TOTP_RESET: 'Two-factor authentication reset by an administrator',
    SECURITY_ACTIVITY_EXPORTED: 'Security activity exported',
  };
  return names[eventType] ?? 'Account security activity';
}

function jsonString(value: Prisma.JsonValue | null, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const candidate = (value as Record<string, Prisma.JsonValue>)[key];
  return typeof candidate === 'string' ? candidate.slice(0, 120) : '';
}
