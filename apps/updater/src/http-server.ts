import { createHash, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, rm } from 'node:fs/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { UpdaterConfig } from './config.js';
import { signedRequestMetadataValid, updaterSignatureMatches } from './ipc-auth.js';
import { ReplayNonceStore } from './nonce-store.js';
import { AgentError, UpdaterAgent } from './updater.js';

export function createUpdaterHttpServer(
  config: UpdaterConfig,
  agent: UpdaterAgent,
) {
  const nonces = new ReplayNonceStore(config.stateDir);
  return createServer(async (request, response) => {
    try {
      const secrets = [config.sharedSecret, config.previousSharedSecret].filter(
        (value): value is string => Boolean(value),
      );
      if (!(await authenticated(request, secrets, nonces)))
        return json(response, 401, { code: 'UNAUTHORIZED' });
      const url = new URL(request.url ?? '/', 'http://updater.local');
      if (request.method === 'GET' && url.pathname === '/v1/status')
        return json(response, 200, await agent.status());
      if (request.method === 'POST' && url.pathname === '/v1/check')
        return json(response, 200, await agent.check());
      if (request.method === 'POST' && url.pathname === '/v1/install') {
        const input = await body(request, contentDigest(request));
        return json(
          response,
          202,
          await agent.install({
            version: input.version,
            idempotencyKey: input.idempotencyKey,
          }),
        );
      }
      const runMatch = url.pathname.match(/^\/v1\/runs\/([a-f0-9-]{36})$/);
      if (request.method === 'GET' && runMatch)
        return json(
          response,
          200,
          await agent.run(
            runMatch[1],
            Number(url.searchParams.get('after') ?? 0),
          ),
        );
      const cancelMatch = url.pathname.match(
        /^\/v1\/runs\/([a-f0-9-]{36})\/cancel$/,
      );
      if (request.method === 'POST' && cancelMatch)
        return json(response, 200, await agent.cancel(cancelMatch[1]));
      return json(response, 404, { code: 'NOT_FOUND' });
    } catch (error) {
      const status = error instanceof AgentError ? error.status : 500;
      return json(response, status, {
        code: error instanceof AgentError ? error.code : 'UPDATER_ERROR',
      });
    }
  });
}

export async function listenUpdaterSocket(server: Server, socketPath: string) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  await chmod(socketPath, 0o660);
}

async function authenticated(
  request: IncomingMessage,
  secrets: readonly string[],
  nonces: ReplayNonceStore,
) {
  const protocol = request.headers['x-updater-protocol'];
  const timestamp = request.headers['x-updater-timestamp'];
  const nonce = request.headers['x-updater-nonce'];
  const signature = request.headers['x-updater-signature'];
  const digest = request.headers['x-updater-content-sha256'];
  if (
    typeof protocol !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof nonce !== 'string' ||
    typeof signature !== 'string' ||
    typeof digest !== 'string'
  )
    return false;
  const signedRequest = {
    protocol,
    method: request.method ?? '',
    path: request.url ?? '',
    timestamp,
    nonce,
    contentDigest: digest,
  };
  if (
    !signedRequestMetadataValid(signedRequest) ||
    !updaterSignatureMatches(secrets, signedRequest, signature)
  )
    return false;
  try {
    await nonces.consume(nonce, Number(timestamp));
    return true;
  } catch {
    return false;
  }
}

function contentDigest(request: IncomingMessage) {
  const digest = request.headers['x-updater-content-sha256'];
  if (typeof digest !== 'string') throw new AgentError('UNAUTHORIZED', 401);
  return digest;
}

async function body(request: IncomingMessage, expectedDigest: string) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 16_384) throw new AgentError('REQUEST_TOO_LARGE', 413);
    chunks.push(buffer);
  }
  const payload = Buffer.concat(chunks);
  const actualDigest = createHash('sha256').update(payload).digest();
  const suppliedDigest = Buffer.from(expectedDigest, 'hex');
  if (
    suppliedDigest.length !== actualDigest.length ||
    !timingSafeEqual(suppliedDigest, actualDigest)
  )
    throw new AgentError('REQUEST_DIGEST_MISMATCH', 401);
  try {
    return JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new AgentError('INVALID_JSON', 400);
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

export async function removeStaleSocket(socketPath: string) {
  let socket;
  try {
    socket = await lstat(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!socket.isSocket() || socket.isSymbolicLink())
    throw new Error('Unsafe updater socket path.');
  const active = await new Promise<boolean>((resolve, reject) => {
    const probe = httpRequest(
      { socketPath, path: '/v1/status', method: 'GET', timeout: 1_000 },
      (response) => {
        response.resume();
        response.on('end', () => resolve(true));
      },
    );
    probe.on('timeout', () => {
      probe.destroy();
      resolve(true);
    });
    probe.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') resolve(false);
      else reject(error);
    });
    probe.end();
  });
  if (active) throw new Error('PE Community updater is already running.');
  await rm(socketPath);
}
