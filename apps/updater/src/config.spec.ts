import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadConfig } from './config.js';

test('updater configuration rejects symlinked canonical deployment files', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'pe-updater-config-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const deployment = join(root, 'deployment');
  const state = join(root, 'state');
  const backups = join(root, 'backups');
  const runtime = join(root, 'run');
  await Promise.all([
    mkdir(deployment),
    mkdir(state),
    mkdir(backups),
    mkdir(runtime),
    mkdir(join(deployment, 'deploy')),
  ]);
  await Promise.all([
    writeFile(join(deployment, '.env'), 'PE_COMMUNITY_VERSION=v1.0.0\n'),
    writeFile(join(deployment, 'deploy', 'Caddyfile'), ''),
    writeFile(join(root, 'compose-real.yml'), 'services: {}\n'),
  ]);
  await symlink(
    join(root, 'compose-real.yml'),
    join(deployment, 'docker-compose.prod.yml'),
  );

  assert.throws(
    () =>
      loadConfig({
        PE_UPDATER_DEPLOYMENT_ROOT: deployment,
        PE_UPDATER_STATE_DIR: state,
        PE_UPDATER_BACKUP_ROOT: backups,
        PE_UPDATER_SOCKET: join(runtime, 'updater.sock'),
        PE_UPDATER_SHARED_SECRET: 'a'.repeat(32),
      }),
    /Unsafe updater file/,
  );
});
