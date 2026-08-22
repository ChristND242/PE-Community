import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { AuditLogService, categoryForAction, outcomeForAction, sanitizeAuditMetadata } from '../audit/audit-log.service';

test('audit metadata strips secret fields and neutralizes line breaks', () => {
  const metadata = sanitizeAuditMetadata({
    requestId: 'request-1\r\nforged-entry',
    password: 'must-not-survive',
    accessToken: 'must-not-survive',
    nested: { safe: 'retained', privateKey: 'must-not-survive' },
  }) as Record<string, unknown>;

  assert.equal(metadata.requestId, 'request-1 forged-entry');
  assert.equal(metadata.password, undefined);
  assert.equal(metadata.accessToken, undefined);
  assert.deepEqual(metadata.nested, { safe: 'retained' });
});

test('audit list always scopes records and facets to the active community', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const prisma = {
    communitySettings: { findUnique: async () => ({ timezone: 'UTC' }) },
    auditLog: {
      findMany: async (args: Record<string, unknown>) => { calls.push(args); return []; },
      count: async (args: Record<string, unknown>) => { calls.push(args); return 0; },
      groupBy: async (args: Record<string, unknown>) => { calls.push(args); return []; },
    },
    user: { findMany: async () => [] },
  };

  const result = await new AuditLogService(prisma as never).list('community-a', { page: 2, pageSize: 10, category: 'MEMBERS' });

  assert.equal(result.pagination.page, 2);
  assert.ok(calls.length >= 4);
  assert.ok(calls.every((call) => JSON.stringify(call).includes('community-a')));
  assert.equal(JSON.stringify(calls).includes('community-b'), false);
});

test('audit detail cannot read a record from another community', async () => {
  const prisma = { auditLog: { findFirst: async (args: { where: Record<string, unknown> }) => {
    assert.deepEqual(args.where, { id: 'log-1', communityId: 'community-a' });
    return null;
  } } };

  await assert.rejects(new AuditLogService(prisma as never).detail('community-a', 'log-1'), NotFoundException);
});

test('audit list resolves current user avatars in one community-scoped batch with safe fallbacks', async () => {
  const userQueries: Array<Record<string, unknown>> = [];
  const createdAt = new Date('2026-08-08T00:00:00.000Z');
  const items = [
    { id: 'uploaded-log', communityId: 'community-a', actorUserId: 'uploaded-user', action: 'member.updated', targetType: 'Membership', targetId: 'member-1', metadata: {}, createdAt },
    { id: 'generated-log', communityId: 'community-a', actorUserId: 'generated-user', action: 'member.updated', targetType: 'Membership', targetId: 'member-2', metadata: {}, createdAt },
    { id: 'deleted-log', communityId: 'community-a', actorUserId: 'deleted-user', action: 'member.updated', targetType: 'Membership', targetId: 'member-3', metadata: { audit: { actorType: 'USER', actorLabel: 'Former member' } }, createdAt },
    { id: 'worker-log', communityId: 'community-a', actorUserId: null, action: 'automation.run.completed', targetType: 'AutomationRun', targetId: 'run-1', metadata: { audit: { actorType: 'WORKER', actorLabel: 'Worker' } }, createdAt },
  ];
  const prisma = {
    communitySettings: { findUnique: async () => ({ timezone: 'UTC' }) },
    auditLog: {
      findMany: async (args: { select?: { actorUserId?: boolean } }) => args.select?.actorUserId
        ? [{ actorUserId: 'uploaded-user' }, { actorUserId: 'generated-user' }, { actorUserId: 'deleted-user' }]
        : items,
      count: async () => items.length,
      groupBy: async () => [],
    },
    user: { findMany: async (args: Record<string, unknown>) => {
      userQueries.push(args);
      return [
        { id: 'uploaded-user', name: 'Uploaded User', email: 'uploaded@example.test', memberships: [{ role: { key: 'MEMBER' }, profile: { avatarUrl: '/media/avatar.webp', dicebearStyle: null, dicebearSeed: null } }] },
        { id: 'generated-user', name: 'Generated User', email: 'generated@example.test', memberships: [{ role: { key: 'ADMIN' }, profile: { avatarUrl: null, dicebearStyle: 'notionists', dicebearSeed: 'generated-seed' } }] },
      ];
    } },
  };

  const result = await new AuditLogService(prisma as never).list('community-a', {});

  assert.equal(userQueries.length, 1);
  assert.deepEqual((userQueries[0].where as { memberships: unknown }).memberships, { some: { communityId: 'community-a' } });
  assert.deepEqual((userQueries[0].select as { memberships: unknown }).memberships, {
    where: { communityId: 'community-a' },
    take: 1,
    select: {
      role: { select: { key: true } },
      profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
    },
  });
  assert.deepEqual(result.items[0].actor, { id: 'uploaded-user', name: 'Uploaded User', email: 'uploaded@example.test', type: 'USER', avatarUrl: '/media/avatar.webp', dicebearStyle: null, dicebearSeed: null });
  assert.deepEqual(result.items[1].actor, { id: 'generated-user', name: 'Generated User', email: 'generated@example.test', type: 'USER', avatarUrl: null, dicebearStyle: 'notionists', dicebearSeed: 'generated-seed' });
  assert.equal(result.items[2].actor.name, 'Former member');
  assert.equal(result.items[2].actor.type, 'USER');
  assert.equal(result.items[3].actor.type, 'WORKER');
  assert.equal('avatarUrl' in result.items[3].actor, false);
});

test('audit classification derives representative categories and outcomes', () => {
  assert.equal(categoryForAction('auth.login.failed'), 'AUTHENTICATION');
  assert.equal(categoryForAction('task.board.automation.updated'), 'AUTOMATIONS');
  assert.equal(categoryForAction('member.suspended'), 'MEMBERS');
  assert.equal(outcomeForAction('roles.permission.denied'), 'DENIED');
  assert.equal(outcomeForAction('registration.rejected'), 'FAILURE');
});

test('audit workspace exposes read routes only and migration adds query indexes', () => {
  const root = join(__dirname, '../../../..');
  const controller = readFileSync(join(root, 'apps/api/src/admin/admin.controller.ts'), 'utf8');
  const migration = readFileSync(join(root, 'prisma/migrations/20260805000000_audit_log_query_indexes/migration.sql'), 'utf8');
  assert.match(controller, /@Get\('audit-logs'\)/);
  assert.match(controller, /@Get\('audit-logs\/:auditLogId'\)/);
  assert.doesNotMatch(controller, /@(Post|Patch|Put|Delete)\('audit-logs/);
  assert.match(migration, /AuditLog_communityId_createdAt_idx/);
  assert.match(migration, /AuditLog_communityId_actorUserId_createdAt_idx/);
});
