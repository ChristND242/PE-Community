import { ConflictException, Injectable, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, SystemUpdateRunStatus } from '@prisma/client';
import { AuditLogService, type AuditRequestContext } from '../audit/audit-log.service';
import type { RequestUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS } from '../rbac/permissions';
import { ReleaseDiscoveryService } from './release-discovery.service';
import { UpdaterAgentClient, type AgentEvent, type AgentRun } from './updater-agent.client';

const TERMINAL: SystemUpdateRunStatus[] = ['COMPLETED', 'FAILED', 'MANUAL_INTERVENTION_REQUIRED', 'CANCELLED'];

@Injectable()
export class SystemUpdatesService implements OnModuleInit, OnModuleDestroy {
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly releases: ReleaseDiscoveryService,
    private readonly agent: UpdaterAgentClient,
    private readonly audit: AuditLogService,
  ) {}

  onModuleInit() {
    this.reconciliationTimer = setInterval(() => void this.reconcileActiveRuns(), 5_000);
    this.reconciliationTimer.unref();
    void this.reconcileActiveRuns();
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  async overview(communityId: string, user: RequestUser) {
    const canViewHistory = user.permissions.includes(PERMISSIONS.systemUpdateHistory);
    const [release, activeRun, recentRuns] = await Promise.all([
      this.releases.latestFor(communityId, user),
      this.prisma.systemUpdateRun.findFirst({ where: { communityId, status: { notIn: TERMINAL } }, orderBy: { createdAt: 'desc' } }),
      canViewHistory ? this.history(communityId, 1, 10) : Promise.resolve(emptyHistory()),
    ]);
    return { release, activeRun: activeRun ? publicRun(activeRun) : null, history: recentRuns, canViewHistory, updaterConfigured: this.agent.available() };
  }

  check(communityId: string, user: RequestUser, context?: AuditRequestContext) {
    return this.releases.check(communityId, user, context);
  }

  async install(communityId: string, user: RequestUser, input: Record<string, unknown>, context?: AuditRequestContext) {
    const version = strictVersion(input.version);
    const idempotencyKey = strictIdempotencyKey(input.idempotencyKey);
    const duplicate = await this.prisma.systemUpdateRun.findUnique({ where: { idempotencyKey } });
    if (duplicate) {
      if (duplicate.communityId !== communityId || duplicate.initiatedByUserId !== user.id) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
      return publicRun(duplicate);
    }
    const active = await this.prisma.systemUpdateRun.findFirst({ where: { communityId, status: { notIn: TERMINAL } }, select: { id: true } });
    if (active) throw new ConflictException({ code: 'UPDATE_IN_PROGRESS', runId: active.id });
    const release = await this.releases.latestFor(communityId, user);
    if (release.status !== 'UPDATE_AVAILABLE' || release.latestVersion !== version) throw new ConflictException({ code: 'TARGET_RELEASE_NOT_INSTALLABLE' });
    const agentRun = await this.agent.install(version, idempotencyKey);
    const run = await this.upsertAgentRun(communityId, user, context?.sourceIp, agentRun);
    await this.audit.recordBestEffort({ communityId, actorUserId: user.id, actorRole: user.role, category: 'SYSTEM', action: 'system.update.started', outcome: 'SUCCESS', severity: 'HIGH', targetType: 'SystemUpdateRun', targetId: run.id, requestContext: context, metadata: { installedVersion: run.installedVersion, targetVersion: run.targetVersion, runId: run.id } });
    return publicRun(run);
  }

  async run(communityId: string, id: string, after = 0) {
    const existing = await this.prisma.systemUpdateRun.findFirst({ where: { id, communityId } });
    if (!existing) throw new NotFoundException('Update run not found.');
    if (!TERMINAL.includes(existing.status)) {
      const agentState = await this.agent.run(id, Math.max(after, existing.lastSequence));
      await this.upsertAgentRun(communityId, null, existing.sourceIp, agentState.run, agentState.events);
    }
    const run = await this.prisma.systemUpdateRun.findUniqueOrThrow({ where: { id } });
    const events = await this.prisma.systemUpdateLog.findMany({ where: { runId: id, sequence: { gt: Math.max(0, after) } }, orderBy: { sequence: 'asc' }, take: 500 });
    return { run: publicRun(run), events: events.map(publicEvent) };
  }

  async cancel(communityId: string, id: string) {
    const existing = await this.prisma.systemUpdateRun.findFirst({ where: { id, communityId } });
    if (!existing) throw new NotFoundException('Update run not found.');
    await this.agent.cancel(id);
    return this.run(communityId, id);
  }

  async history(communityId: string, page: number, pageSize: number) {
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Math.trunc(pageSize) || 10));
    const [items, total] = await Promise.all([
      this.prisma.systemUpdateRun.findMany({ where: { communityId }, orderBy: { createdAt: 'desc' }, skip: (safePage - 1) * safePageSize, take: safePageSize, include: { initiatedBy: { select: { id: true, name: true } } } }),
      this.prisma.systemUpdateRun.count({ where: { communityId } }),
    ]);
    return { items: items.map((run) => ({ ...publicRun(run), initiatedBy: run.initiatedBy })), pagination: { page: safePage, pageSize: safePageSize, total, totalPages: Math.max(1, Math.ceil(total / safePageSize)) } };
  }

  private async reconcileActiveRuns() {
    if (!this.agent.available()) return;
    const activeRuns = await this.prisma.systemUpdateRun.findMany({ where: { status: { notIn: TERMINAL } }, take: 20 });
    for (const active of activeRuns) {
      try {
        const state = await this.agent.run(active.id, active.lastSequence);
        await this.upsertAgentRun(active.communityId, null, active.sourceIp, state.run, state.events);
      } catch {
        // The host agent may be unavailable while the application is restarting.
      }
    }
  }

  private async upsertAgentRun(communityId: string, user: RequestUser | null, sourceIp: string | null | undefined, agentRun: AgentRun, events: AgentEvent[] = []) {
    const status = runStatus(agentRun.status);
    const phase = runStatus(agentRun.phase);
    const previous = await this.prisma.systemUpdateRun.findUnique({ where: { id: agentRun.id }, select: { status: true } });
    const run = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.systemUpdateRun.upsert({ where: { id: agentRun.id }, create: {
        id: agentRun.id, communityId, initiatedByUserId: user?.id, initiatorRole: user?.role ?? 'system', sourceIp,
        idempotencyKey: agentRun.idempotencyKey, installedVersion: agentRun.installedVersion, targetVersion: agentRun.targetVersion,
        status, phase, createdAt: new Date(agentRun.createdAt), startedAt: dateOrNull(agentRun.startedAt), completedAt: dateOrNull(agentRun.completedAt),
        failureCode: agentRun.failureCode, failureSummary: agentRun.failureSummary, rollbackStatus: agentRun.rollbackStatus,
        releaseMetadataSnapshot: agentReleaseMetadata(agentRun), lastSequence: agentRun.lastSequence,
      }, update: {
        status, phase, startedAt: dateOrNull(agentRun.startedAt), completedAt: dateOrNull(agentRun.completedAt), failureCode: agentRun.failureCode,
        failureSummary: agentRun.failureSummary, rollbackStatus: agentRun.rollbackStatus, releaseMetadataSnapshot: agentReleaseMetadata(agentRun), lastSequence: agentRun.lastSequence,
      } });
      for (const event of events) {
        await tx.systemUpdateLog.upsert({ where: { runId_sequence: { runId: agentRun.id, sequence: event.sequence } }, create: { runId: agentRun.id, sequence: event.sequence, timestamp: new Date(event.timestamp), level: safeLogValue(event.level, 16), phase: runStatus(event.phase), eventCode: safeLogValue(event.eventCode, 100), message: safeLogValue(event.message, 2_000) }, update: {} });
      }
      return stored;
    });
    if (previous && previous.status !== status && TERMINAL.includes(status)) {
      await this.auditTerminal(run);
      await this.pruneHistory(run.communityId);
    }
    return run;
  }

  private async pruneHistory(communityId: string) {
    const expiredRuns = await this.prisma.systemUpdateRun.findMany({
      where: { communityId, status: { in: TERMINAL } },
      orderBy: { createdAt: 'desc' },
      skip: 200,
      select: { id: true },
    });
    if (expiredRuns.length) {
      await this.prisma.systemUpdateRun.deleteMany({
        where: { id: { in: expiredRuns.map((run) => run.id) } },
      });
    }
    const expiredChecks = await this.prisma.systemUpdateCheck.findMany({
      where: { communityId },
      orderBy: { checkedAt: 'desc' },
      skip: 500,
      select: { id: true },
    });
    if (expiredChecks.length) {
      await this.prisma.systemUpdateCheck.deleteMany({
        where: { id: { in: expiredChecks.map((check) => check.id) } },
      });
    }
  }

  private auditTerminal(run: { id: string; communityId: string; initiatedByUserId: string | null; initiatorRole: string; installedVersion: string; targetVersion: string; status: SystemUpdateRunStatus; rollbackStatus: string; failureCode: string | null }) {
    const action = run.failureCode?.startsWith('PROVENANCE_') || run.failureCode?.startsWith('MANIFEST_') ? 'system.update.provenance_verification_failed' : run.status === 'COMPLETED' ? 'system.update.completed' : run.rollbackStatus === 'COMPLETED' ? 'system.update.rolled_back' : run.status === 'MANUAL_INTERVENTION_REQUIRED' ? 'system.update.manual_intervention_required' : 'system.update.failed';
    return this.audit.recordBestEffort({ communityId: run.communityId, actorUserId: run.initiatedByUserId, actorRole: run.initiatorRole, category: 'SYSTEM', action, outcome: run.status === 'COMPLETED' ? 'SUCCESS' : 'FAILURE', severity: run.status === 'COMPLETED' ? 'INFO' : 'CRITICAL', targetType: 'SystemUpdateRun', targetId: run.id, reason: run.failureCode ?? undefined, metadata: { runId: run.id, installedVersion: run.installedVersion, targetVersion: run.targetVersion, status: run.status, rollbackStatus: run.rollbackStatus } });
  }
}

function runStatus(value: string) {
  if (!Object.values(SystemUpdateRunStatus).includes(value as SystemUpdateRunStatus)) throw new Error('Invalid updater state.');
  return value as SystemUpdateRunStatus;
}
function strictVersion(value: unknown) { if (typeof value !== 'string' || !/^v\d+\.\d+\.\d+$/.test(value)) throw new ConflictException({ code: 'INVALID_VERSION' }); return value; }
function strictIdempotencyKey(value: unknown) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw new ConflictException({ code: 'INVALID_IDEMPOTENCY_KEY' }); return value; }
function dateOrNull(value: string | null) { return value ? new Date(value) : null; }
function agentReleaseMetadata(run: AgentRun): Prisma.InputJsonValue { return { manifest: run.releaseMetadataSnapshot as Prisma.InputJsonValue, provenanceResults: (run.provenanceResults ?? []) as Prisma.InputJsonValue }; }
function safeLogValue(value: unknown, max: number) { return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, max); }
function publicRun(run: { id: string; installedVersion: string; targetVersion: string; status: SystemUpdateRunStatus; phase: SystemUpdateRunStatus; createdAt: Date; startedAt: Date | null; completedAt: Date | null; failureCode: string | null; failureSummary: string | null; rollbackStatus: string; releaseMetadataSnapshot: Prisma.JsonValue | null; lastSequence: number }) { return { id: run.id, installedVersion: run.installedVersion, targetVersion: run.targetVersion, status: run.status, phase: run.phase, createdAt: run.createdAt.toISOString(), startedAt: run.startedAt?.toISOString() ?? null, completedAt: run.completedAt?.toISOString() ?? null, failureCode: run.failureCode, failureSummary: run.failureSummary, rollbackStatus: run.rollbackStatus, provenanceResults: provenanceResults(run.releaseMetadataSnapshot), lastSequence: run.lastSequence }; }
function provenanceResults(value: Prisma.JsonValue | null) { if (!value || Array.isArray(value) || typeof value !== 'object') return []; const results = value.provenanceResults; if (!Array.isArray(results)) return []; return results.filter((item): item is Prisma.JsonObject => Boolean(item && typeof item === 'object' && !Array.isArray(item) && ['manifest', 'api', 'web', 'worker'].includes(String(item.service)) && item.result === 'VERIFIED')).map((item) => ({ service: String(item.service), result: 'VERIFIED' as const })); }
function publicEvent(event: { sequence: number; timestamp: Date; level: string; phase: SystemUpdateRunStatus; eventCode: string; message: string }) { return { sequence: event.sequence, timestamp: event.timestamp.toISOString(), level: event.level, phase: event.phase, eventCode: event.eventCode, message: event.message }; }
function emptyHistory() { return { items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }; }
