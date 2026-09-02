import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { UpdaterAgentClient } from '../system-updates/updater-agent.client';

test('API client negotiates with a standalone updater over its real Unix socket', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'pe-community-api-updater-local-'));
  const deploymentRoot = join(root, 'deployment');
  const stateDir = join(root, 'state');
  const backupRoot = join(root, 'backups');
  const runtimeDir = join(root, 'runtime');
  const socketPath = join(runtimeDir, 'updater.sock');
  const secret = 'integration-secret-'.repeat(3);
  await Promise.all([
    mkdir(join(deploymentRoot, 'deploy'), { recursive: true, mode: 0o700 }),
    mkdir(stateDir, { recursive: true, mode: 0o700 }),
    mkdir(backupRoot, { recursive: true, mode: 0o700 }),
    mkdir(runtimeDir, { recursive: true, mode: 0o750 }),
  ]);
  await Promise.all([
    writeFile(
      join(deploymentRoot, 'docker-compose.prod.yml'),
      'services: {}\n',
      { mode: 0o600 },
    ),
    writeFile(join(deploymentRoot, '.env'), 'PE_COMMUNITY_VERSION="v1.0.0"\n', {
      mode: 0o600,
    }),
    writeFile(join(deploymentRoot, 'deploy/Caddyfile'), ':80 {}\n', {
      mode: 0o600,
    }),
  ]);
  await chmod(runtimeDir, 0o750);

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'apps/updater/src/server.ts'],
    {
      cwd: resolve(import.meta.dirname, '../../../..'),
      env: {
        ...process.env,
        PE_UPDATER_DEPLOYMENT_ROOT: deploymentRoot,
        PE_UPDATER_STATE_DIR: stateDir,
        PE_UPDATER_BACKUP_ROOT: backupRoot,
        PE_UPDATER_SOCKET: socketPath,
        PE_UPDATER_SHARED_SECRET: secret,
        PE_UPDATER_MINIMUM_FREE_BYTES: String(1024 ** 3),
        PE_UPDATER_API_HEALTH_URL: 'http://127.0.0.1:1/api/v1/health',
        PE_UPDATER_WEB_HEALTH_URL: 'http://127.0.0.1:1/login',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.resume();
  child.stderr?.resume();
  context.after(async () => {
    await stop(child);
    await rm(root, { recursive: true, force: true });
  });
  await waitForSocket(socketPath, child);

  const originalSocket = process.env.PE_UPDATER_SOCKET;
  const originalSecret = process.env.PE_UPDATER_SHARED_SECRET;
  process.env.PE_UPDATER_SOCKET = socketPath;
  process.env.PE_UPDATER_SHARED_SECRET = secret;
  try {
    const client = new UpdaterAgentClient();
    assert.equal(client.available(), true);
    assert.deepEqual(await client.status(), {
      agentVersion: '1.4.0',
      protocolVersion: 2,
      topology: 'single-host',
    });
  } finally {
    restoreEnvironment('PE_UPDATER_SOCKET', originalSocket);
    restoreEnvironment('PE_UPDATER_SHARED_SECRET', originalSecret);
  }
});

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
}

async function waitForSocket(socketPath: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`Updater exited with code ${child.exitCode}.`);
    try {
      if ((await stat(socketPath)).isSocket() && (await probe(socketPath)))
        return;
    } catch {
      // The child may still be loading TypeScript.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error('Updater socket was not created.');
}

function probe(socketPath: string) {
  return new Promise<boolean>((resolveProbe) => {
    const outgoing = request(
      { socketPath, path: '/v1/status', method: 'GET', timeout: 250 },
      (response) => {
        response.resume();
        response.on('end', () => resolveProbe(true));
      },
    );
    outgoing.on('timeout', () => {
      outgoing.destroy();
      resolveProbe(false);
    });
    outgoing.on('error', () => resolveProbe(false));
    outgoing.end();
  });
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
