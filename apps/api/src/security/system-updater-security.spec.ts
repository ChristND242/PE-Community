import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compareSystemVersions, currentSystemVersion, normalizeVersion } from '../system-updates/system-version';

test('system version metadata is normalized and rejects unsafe build values', () => {
  assert.deepEqual(currentSystemVersion({ version: 'v1.2.3', sourceCommit: 'a'.repeat(40), buildDate: '2026-08-30T00:00:00Z', channel: 'stable' }), { version: 'v1.2.3', sourceCommit: 'a'.repeat(40), buildDate: '2026-08-30T00:00:00.000Z', channel: 'stable' });
  assert.deepEqual(currentSystemVersion({ version: 'latest;id', sourceCommit: 'bad value', buildDate: 'not-a-date', channel: 'stable' }), { version: 'v0.0.0-dev', sourceCommit: null, buildDate: null, channel: 'development' });
  assert.deepEqual(currentSystemVersion(), { version: 'v0.0.0-dev', sourceCommit: null, buildDate: null, channel: 'development' });
  assert.equal(normalizeVersion('v2.0.1'), 'v2.0.1');
  assert.equal(compareSystemVersions('v1.9.9', 'v2.0.0'), -1);
});

test('release builds embed immutable version, source commit, and timestamp metadata', async () => {
  const [dockerfile, generator, workflow] = await Promise.all([
    readFile(new URL('../../../../apps/api/Dockerfile', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/write-build-metadata.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../../.github/workflows/publish-images.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(dockerfile, /node apps\/api\/scripts\/write-build-metadata\.mjs/);
  assert.match(generator, /APP_VERSION/);
  assert.match(generator, /SOURCE_COMMIT/);
  assert.match(generator, /BUILD_DATE/);
  assert.match(generator, /v0\.0\.0-dev/);
  assert.equal((workflow.match(/APP_VERSION=\$\{\{ needs\.validate\.outputs\.version \}\}/g) ?? []).length, 3);
  assert.equal((workflow.match(/SOURCE_COMMIT=\$\{\{ needs\.validate\.outputs\.source_commit \}\}/g) ?? []).length, 3);
  assert.equal((workflow.match(/BUILD_DATE=\$\{\{ needs\.validate\.outputs\.build_date \}\}/g) ?? []).length, 3);
});

test('update execution is protected by permission and existing recent-auth step-up', async () => {
  const controller = await readFile(new URL('../system-updates/system-updates.controller.ts', import.meta.url), 'utf8');
  assert.match(controller, /PERMISSIONS\.systemUpdateExecute/);
  assert.match(controller, /this\.stepUp\.requireRecent\(user\)/);
  assert.match(controller, /requireOwner/);
  assert.doesNotMatch(controller, /currentPassword|passwordHash|verifyPassword/);
});

test('application deployment does not mount the Docker socket', async () => {
  const compose = await readFile(new URL('../../../../docker-compose.prod.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock|\/run\/docker\.sock/);
  assert.match(compose, /PE_UPDATER_RUNTIME_DIR/);
  assert.match(compose, /\/run\/pe-community-updater:ro/);
});

test('automatic release discovery requires provenance contract while the agent remains authoritative', async () => {
  const source = await readFile(new URL('../system-updates/release-discovery.service.ts', import.meta.url), 'utf8');
  assert.match(source, /strictVersion\(manifest\.releaseTag\) !== version/);
  assert.match(source, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(source, /attestationPolicy !== 'GITHUB_PROVENANCE_REQUIRED'/);
  assert.doesNotMatch(source, /DIGEST_ONLY'\s*\?\s*SystemUpdateCheckStatus\.UPDATE_AVAILABLE/);
});

test('updater IPC signatures bind protocol, operation, nonce, and request body', async () => {
  const [client, server] = await Promise.all([
    readFile(new URL('../system-updates/updater-agent.client.ts', import.meta.url), 'utf8'),
    readFile(
      new URL('../../../../apps/updater/src/http-server.ts', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(client, /createHash\('sha256'\).*payload/);
  assert.match(client, /x-updater-content-sha256/);
  assert.match(client, /x-updater-protocol/);
  assert.match(client, /x-updater-nonce/);
  assert.match(server, /ReplayNonceStore/);
  assert.match(server, /REQUEST_DIGEST_MISMATCH/);
  assert.match(server, /timingSafeEqual\(suppliedDigest, actualDigest\)/);
});

test('community administrators do not receive deployment-wide updater defaults', async () => {
  const [permissions, migration, gateway] = await Promise.all([
    readFile(new URL('../rbac/permissions.ts', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../../../../prisma/migrations/20260901000000_system_updates/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../system-updates/system-updates.gateway.ts', import.meta.url),
      'utf8',
    ),
  ]);
  const adminDefaults = permissions.match(
    /export const ADMIN_PERMISSIONS = \[([\s\S]*?)\] as const/,
  )?.[1];
  assert.ok(adminDefaults);
  assert.doesNotMatch(adminDefaults, /systemUpdate/);
  assert.match(migration, /role\."key" = 'owner'/);
  assert.doesNotMatch(migration, /IN \('owner', 'admin'\)/);
  assert.match(gateway, /user\.role !== 'owner'/);
});
