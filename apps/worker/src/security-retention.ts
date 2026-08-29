import { parseSecurityRetentionDays } from '@pe/shared';

const DAY_MS = 24 * 60 * 60 * 1_000;
export const SECURITY_RETENTION_BATCH_SIZE = 500;
export const SECURITY_RETENTION_MAX_BATCHES = 20;

type RetentionPrisma = {
  securityEvent: {
    findMany(input: object): Promise<Array<{ id: string }>>;
    deleteMany(input: object): Promise<{ count: number }>;
  };
  session: {
    findMany(input: object): Promise<Array<{ id: string }>>;
    deleteMany(input: object): Promise<{ count: number }>;
  };
};

export type SecurityRetentionResult = {
  securityEventsDeleted: number;
  expiredSessionsDeleted: number;
  durationMs: number;
};

export async function runSecurityRetentionCleanup(
  prisma: RetentionPrisma,
  options: { now?: Date; eventRetentionDays?: number; sessionRetentionDays?: number } = {},
): Promise<SecurityRetentionResult> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const eventRetentionDays = options.eventRetentionDays
    ?? parseSecurityRetentionDays('SECURITY_EVENT_RETENTION_DAYS', process.env.SECURITY_EVENT_RETENTION_DAYS);
  const sessionRetentionDays = options.sessionRetentionDays
    ?? parseSecurityRetentionDays('SESSION_SECURITY_METADATA_RETENTION_DAYS', process.env.SESSION_SECURITY_METADATA_RETENTION_DAYS);
  const eventCutoff = new Date(now.getTime() - eventRetentionDays * DAY_MS);
  const sessionCutoff = new Date(now.getTime() - sessionRetentionDays * DAY_MS);

  const securityEventsDeleted = await deleteInBatches(
    () => prisma.securityEvent.findMany({
      where: { occurredAt: { lt: eventCutoff } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: SECURITY_RETENTION_BATCH_SIZE,
      select: { id: true },
    }),
    (ids) => prisma.securityEvent.deleteMany({ where: { id: { in: ids }, occurredAt: { lt: eventCutoff } } }),
  );
  const expiredSessionsDeleted = await deleteInBatches(
    () => prisma.session.findMany({
      where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { idleExpiresAt: { lt: sessionCutoff } }] },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: SECURITY_RETENTION_BATCH_SIZE,
      select: { id: true },
    }),
    (ids) => prisma.session.deleteMany({
      where: {
        id: { in: ids },
        OR: [{ expiresAt: { lt: sessionCutoff } }, { idleExpiresAt: { lt: sessionCutoff } }],
      },
    }),
  );

  return { securityEventsDeleted, expiredSessionsDeleted, durationMs: Date.now() - startedAt };
}

async function deleteInBatches(
  selectIds: () => Promise<Array<{ id: string }>>,
  remove: (ids: string[]) => Promise<{ count: number }>,
) {
  let deleted = 0;
  for (let batch = 0; batch < SECURITY_RETENTION_MAX_BATCHES; batch += 1) {
    const rows = await selectIds();
    if (!rows.length) break;
    const result = await remove(rows.map((row) => row.id));
    deleted += result.count;
    if (rows.length < SECURITY_RETENTION_BATCH_SIZE) break;
  }
  return deleted;
}
