import { createHash, createHmac, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type AgentMethod = 'GET' | 'POST';
const UPDATER_PROTOCOL_VERSION = 2;

@Injectable()
export class UpdaterAgentClient {
  private readonly socketPath = process.env.PE_UPDATER_SOCKET ?? '/run/pe-community-updater/updater.sock';
  private readonly sharedSecret = process.env.PE_UPDATER_SHARED_SECRET ?? '';

  available() {
    return this.sharedSecret.length >= 32;
  }

  status() {
    return this.call<AgentStatus>('GET', '/v1/status');
  }

  check() {
    return this.call<Record<string, unknown>>('POST', '/v1/check', {});
  }

  async install(version: string, idempotencyKey: string) {
    await this.ensureCompatible();
    return this.call<AgentRun>('POST', '/v1/install', { version, idempotencyKey });
  }

  run(id: string, after = 0) {
    return this.call<{ run: AgentRun; events: AgentEvent[] }>('GET', `/v1/runs/${encodeURIComponent(id)}?after=${Math.max(0, Math.trunc(after))}`);
  }

  cancel(id: string) {
    return this.call<AgentRun>('POST', `/v1/runs/${encodeURIComponent(id)}/cancel`, {});
  }

  private call<T>(method: AgentMethod, path: string, body?: unknown): Promise<T> {
    if (!this.available()) throw new ServiceUnavailableException({ code: 'UPDATER_NOT_CONFIGURED', message: 'The host updater is not configured.' });
    const timestamp = String(Date.now());
    const nonce = randomBytes(32).toString('hex');
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const contentDigest = createHash('sha256').update(payload ?? Buffer.alloc(0)).digest('hex');
    const signature = createHmac('sha256', this.sharedSecret)
      .update(`PE_COMMUNITY_UPDATER\n${UPDATER_PROTOCOL_VERSION}\n${method}\n${path}\n${timestamp}\n${nonce}\n${contentDigest}`)
      .digest('hex');
    return new Promise<T>((resolve, reject) => {
      const outgoing = request({ socketPath: this.socketPath, path, method, headers: { accept: 'application/json', 'content-type': 'application/json', 'content-length': payload?.length ?? 0, 'x-updater-protocol': String(UPDATER_PROTOCOL_VERSION), 'x-updater-timestamp': timestamp, 'x-updater-nonce': nonce, 'x-updater-content-sha256': contentDigest, 'x-updater-signature': signature }, timeout: 30_000 }, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) {
            response.destroy(new Error('Updater response exceeded the maximum size.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          let value: unknown;
          try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { return reject(new ServiceUnavailableException({ code: 'UPDATER_INVALID_RESPONSE' })); }
          if ((response.statusCode ?? 500) >= 400) return reject(new ServiceUnavailableException(value));
          resolve(value as T);
        });
        response.on('error', () =>
          reject(
            new ServiceUnavailableException({
              code: 'UPDATER_INVALID_RESPONSE',
            }),
          ),
        );
      });
      outgoing.on('timeout', () => outgoing.destroy(new Error('Updater request timed out.')));
      outgoing.on('error', () => reject(new ServiceUnavailableException({ code: 'UPDATER_UNAVAILABLE', message: 'The host updater is unavailable.' })));
      if (payload) outgoing.write(payload);
      outgoing.end();
    });
  }

  private async ensureCompatible() {
    const status = await this.status();
    if (status.protocolVersion !== UPDATER_PROTOCOL_VERSION || status.topology !== 'single-host' || !/^\d+\.\d+\.\d+$/.test(status.agentVersion)) {
      throw new ServiceUnavailableException({ code: 'UPDATER_INCOMPATIBLE', message: 'The host updater protocol is incompatible.' });
    }
  }
}

export type AgentStatus = {
  agentVersion: string;
  protocolVersion: number;
  topology: 'single-host';
};

export type AgentRun = {
  id: string;
  idempotencyKey: string;
  installedVersion: string;
  targetVersion: string;
  status: string;
  phase: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  failureSummary: string | null;
  rollbackStatus: string;
  releaseMetadataSnapshot: unknown;
  provenanceResults: Array<{
    service: 'manifest' | 'api' | 'web' | 'worker';
    digest: string;
    policy: 'GITHUB_PROVENANCE_REQUIRED';
    verifiedAt: string;
    verifierVersion: string;
    repository: string;
    workflow: string;
    result: 'VERIFIED';
  }>;
  lastSequence: number;
};

export type AgentEvent = {
  sequence: number;
  timestamp: string;
  level: string;
  phase: string;
  eventCode: string;
  message: string;
};
