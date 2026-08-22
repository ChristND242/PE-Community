export const SESSION_ACTIVITY_CHANNEL = 'pe-community-session-activity';
export const SESSION_ACTIVITY_STORAGE_KEY = 'pe-community-session-activity-message';
export const SESSION_RENEWAL_LOCK_KEY = 'pe-community-session-renewal-lock';
export const LOCAL_ACTIVITY_THROTTLE_MS = 1_000;
export const SERVER_ACTIVITY_THROTTLE_MS = 60_000;
export const RENEWAL_LOCK_MS = 5_000;

export type SessionActivityStatus = {
  status: 'active';
  serverNow: string;
  lastActivityAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  warningAfterSeconds: number;
  idleTimeoutSeconds: number;
};

export type SessionActivityMessage =
  | { type: 'renewed'; idleExpiresAt: number; absoluteExpiresAt: number; serverNow: number; at: number }
  | { type: 'expired'; at: number }
  | { type: 'logout'; at: number };

export function publishSessionActivityMessage(message: SessionActivityMessage) {
  if (typeof window === 'undefined') return;
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(SESSION_ACTIVITY_CHANNEL);
    channel.postMessage(message);
    channel.close();
  }
  try {
    localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, JSON.stringify({ ...message, nonce: crypto.randomUUID() }));
  } catch {
    // BroadcastChannel remains the primary same-origin transport.
  }
}

export function parseSessionActivityMessage(value: unknown): SessionActivityMessage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'renewed'
    && finiteNumber(candidate.idleExpiresAt)
    && finiteNumber(candidate.absoluteExpiresAt)
    && finiteNumber(candidate.serverNow)
    && finiteNumber(candidate.at)) {
    return {
      type: 'renewed',
      idleExpiresAt: candidate.idleExpiresAt,
      absoluteExpiresAt: candidate.absoluteExpiresAt,
      serverNow: candidate.serverNow,
      at: candidate.at,
    };
  }
  if ((candidate.type === 'expired' || candidate.type === 'logout') && finiteNumber(candidate.at)) {
    return { type: candidate.type, at: candidate.at };
  }
  return null;
}

export function acquireSessionRenewalLock(owner: string, now = Date.now()) {
  try {
    const current = JSON.parse(localStorage.getItem(SESSION_RENEWAL_LOCK_KEY) ?? 'null') as { owner?: unknown; expiresAt?: unknown } | null;
    if (current && current.owner !== owner && finiteNumber(current.expiresAt) && current.expiresAt > now) return false;
    localStorage.setItem(SESSION_RENEWAL_LOCK_KEY, JSON.stringify({ owner, expiresAt: now + RENEWAL_LOCK_MS }));
    const confirmed = JSON.parse(localStorage.getItem(SESSION_RENEWAL_LOCK_KEY) ?? 'null') as { owner?: unknown } | null;
    return confirmed?.owner === owner;
  } catch {
    return true;
  }
}

export function releaseSessionRenewalLock(owner: string) {
  try {
    const current = JSON.parse(localStorage.getItem(SESSION_RENEWAL_LOCK_KEY) ?? 'null') as { owner?: unknown } | null;
    if (current?.owner === owner) localStorage.removeItem(SESSION_RENEWAL_LOCK_KEY);
  } catch {
    // A short expiry prevents a failed lock from becoming permanent.
  }
}

export function sessionDeadline(idleExpiresAt: number, absoluteExpiresAt: number) {
  return Math.min(idleExpiresAt, absoluteExpiresAt);
}

export function countdownParts(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return {
    minutes: Math.floor(safeSeconds / 60),
    seconds: safeSeconds % 60,
    text: `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`,
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
