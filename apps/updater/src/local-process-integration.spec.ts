import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';
import { UPDATER_PROTOCOL_VERSION } from './domain.js';
import { updaterSignature } from './ipc-auth.js';

const secretA = 'a'.repeat(48);
const secretB = 'b'.repeat(48);

test('standalone updater enforces real Unix IPC security across restart and secret rotation', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'pe-community-updater-local-'));
  const deploymentRoot = join(root, 'deployment');
  const stateDir = join(root, 'state');
  const backupRoot = join(root, 'backups');
  const runtimeDir = join(root, 'runtime');
  const socketPath = join(runtimeDir, 'updater.sock');
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
  const interruptedRunId = randomUUID();
  await mkdir(join(stateDir, 'runs'), { mode: 0o700 });
  await writeFile(
    join(stateDir, 'runs', `${interruptedRunId}.json`),
    `${JSON.stringify({
      id: interruptedRunId,
      idempotencyKey: `restart-${randomUUID()}`,
      installedVersion: 'v1.0.0',
      targetVersion: 'v1.1.0',
      status: 'RUNNING',
      phase: 'PULLING',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      failureCode: null,
      failureSummary: null,
      rollbackStatus: 'AVAILABLE',
      releaseMetadataSnapshot: null,
      provenanceResults: [],
      lastSequence: 0,
      cancellationRequested: false,
    })}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    join(stateDir, 'update.lock'),
    `${JSON.stringify({ runId: interruptedRunId, pid: 999_999 })}\n`,
    { mode: 0o600 },
  );

  let child: ChildProcess | null = null;
  context.after(async () => {
    if (child) await stop(child);
    await rm(root, { recursive: true, force: true });
  });

  child = start({
    deploymentRoot,
    stateDir,
    backupRoot,
    socketPath,
    current: secretA,
  });
  await waitForSocket(socketPath, child);
  const socket = await stat(socketPath);
  const parent = await stat(runtimeDir);
  assert.equal(socket.isSocket(), true);
  assert.equal(socket.mode & 0o777, 0o660);
  assert.equal(parent.mode & 0o002, 0);

  const recovered = await call(
    socketPath,
    signedRequest(secretA, 'GET', `/v1/runs/${interruptedRunId}?after=0`),
  );
  assert.equal(recovered.status, 200);
  assert.equal(
    (recovered.value.run as Record<string, unknown>).status,
    'FAILED',
  );
  assert.equal(
    (recovered.value.run as Record<string, unknown>).failureCode,
    'AGENT_RESTART_SAFE_TO_RETRY',
  );
  assert.equal(
    Array.isArray(recovered.value.events) && recovered.value.events.length > 0,
    true,
  );
  await assert.rejects(() => stat(join(stateDir, 'update.lock')), /ENOENT/);

  const accepted = signedRequest(secretA, 'GET', '/v1/status');
  assert.deepEqual(await call(socketPath, accepted), {
    status: 200,
    value: {
      agentVersion: '1.4.0',
      protocolVersion: 2,
      topology: 'single-host',
    },
  });
  assert.equal(
    (await call(socketPath, accepted)).status,
    401,
    'nonce replay must fail',
  );
  assert.equal(
    (await call(socketPath, signedRequest('x'.repeat(48), 'GET', '/v1/status')))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        socketPath,
        signedRequest(
          secretA,
          'GET',
          '/v1/status',
          undefined,
          Date.now() - 31_000,
        ),
      )
    ).status,
    401,
  );

  const malformed = Buffer.from('{not-json');
  const malformedRequest = signedRequest(
    secretA,
    'POST',
    '/v1/install',
    malformed,
  );
  assert.deepEqual(await call(socketPath, malformedRequest), {
    status: 400,
    value: { code: 'INVALID_JSON' },
  });
  assert.deepEqual(
    await call(
      socketPath,
      signedRequest(
        secretA,
        'POST',
        '/v1/install',
        Buffer.from('{"version":"bad","idempotencyKey":"valid-key-123456"}'),
      ),
    ),
    { status: 400, value: { code: 'INVALID_VERSION' } },
  );

  await stop(child);
  child = start({
    deploymentRoot,
    stateDir,
    backupRoot,
    socketPath,
    current: secretB,
    previous: secretA,
  });
  await waitForSocket(socketPath, child);
  assert.equal(
    (await call(socketPath, accepted)).status,
    401,
    'replay cache must survive process restart',
  );
  assert.equal(
    (await call(socketPath, signedRequest(secretA, 'GET', '/v1/status')))
      .status,
    200,
  );
  assert.equal(
    (await call(socketPath, signedRequest(secretB, 'GET', '/v1/status')))
      .status,
    200,
  );

  await stop(child);
  child = start({
    deploymentRoot,
    stateDir,
    backupRoot,
    socketPath,
    current: secretB,
  });
  await waitForSocket(socketPath, child);
  assert.equal(
    (await call(socketPath, signedRequest(secretA, 'GET', '/v1/status')))
      .status,
    401,
  );
  assert.equal(
    (await call(socketPath, signedRequest(secretB, 'GET', '/v1/status')))
      .status,
    200,
  );
});

function start(input: {
  deploymentRoot: string;
  stateDir: string;
  backupRoot: string;
  socketPath: string;
  current: string;
  previous?: string;
}) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PE_UPDATER_DEPLOYMENT_ROOT: input.deploymentRoot,
      PE_UPDATER_STATE_DIR: input.stateDir,
      PE_UPDATER_BACKUP_ROOT: input.backupRoot,
      PE_UPDATER_SOCKET: input.socketPath,
      PE_UPDATER_SHARED_SECRET: input.current,
      PE_UPDATER_SHARED_SECRET_PREVIOUS: input.previous ?? '',
      PE_UPDATER_MINIMUM_FREE_BYTES: String(1024 ** 3),
      PE_UPDATER_API_HEALTH_URL: 'http://127.0.0.1:1/api/v1/health',
      PE_UPDATER_WEB_HEALTH_URL: 'http://127.0.0.1:1/login',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolveStop) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5_000);
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

function signedRequest(
  secret: string,
  method: 'GET' | 'POST',
  path: string,
  payload = Buffer.alloc(0),
  timestamp = Date.now(),
) {
  const nonce = randomBytes(32).toString('hex');
  const contentDigest = createHash('sha256').update(payload).digest('hex');
  const metadata = {
    protocol: String(UPDATER_PROTOCOL_VERSION),
    method,
    path,
    timestamp: String(timestamp),
    nonce,
    contentDigest,
  };
  return {
    method,
    path,
    payload,
    headers: {
      'content-type': 'application/json',
      'content-length': String(payload.length),
      'x-updater-protocol': metadata.protocol,
      'x-updater-timestamp': metadata.timestamp,
      'x-updater-nonce': nonce,
      'x-updater-content-sha256': contentDigest,
      'x-updater-signature': updaterSignature(secret, metadata),
    },
  };
}

function call(
  socketPath: string,
  signed: ReturnType<typeof signedRequest>,
): Promise<{ status: number; value: Record<string, unknown> }> {
  return new Promise((resolveCall, reject) => {
    const outgoing = request(
      {
        socketPath,
        method: signed.method,
        path: signed.path,
        headers: signed.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolveCall({
            status: response.statusCode ?? 0,
            value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
              string,
              unknown
            >,
          });
        });
      },
    );
    outgoing.on('error', reject);
    if (signed.payload.length) outgoing.write(signed.payload);
    outgoing.end();
  });
}
