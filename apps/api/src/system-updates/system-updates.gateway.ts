import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { AuthService, type RequestUser } from '../auth/auth.service';
import { PERMISSIONS } from '../rbac/permissions';
import { SystemUpdatesService } from './system-updates.service';

type UpdateSocket = Socket & { data: { user?: RequestUser; pollTimer?: ReturnType<typeof setTimeout> } };

@WebSocketGateway({ namespace: 'system-updates', cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true } })
export class SystemUpdatesGateway {
  constructor(private readonly auth: AuthService, private readonly updates: SystemUpdatesService) {}

  async handleConnection(client: UpdateSocket) {
    try {
      const user = await this.auth.userFromCookie(cookieValue(client.handshake.headers.cookie, this.auth.cookieName));
      if (user.role !== 'owner' || !user.permissions.includes(PERMISSIONS.systemUpdateHistory)) throw new Error('Forbidden');
      client.data.user = user;
    } catch {
      client.emit('system:update:error', { code: 'unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: UpdateSocket) {
    if (client.data.pollTimer) clearTimeout(client.data.pollTimer);
  }

  @SubscribeMessage('system:update:subscribe')
  subscribe(client: UpdateSocket, input: { runId?: unknown; after?: unknown }) {
    const user = client.data.user;
    const runId = typeof input?.runId === 'string' && /^[a-f0-9-]{36}$/.test(input.runId) ? input.runId : '';
    if (!user || !runId) return client.emit('system:update:error', { code: 'invalid_request' });
    if (client.data.pollTimer) clearTimeout(client.data.pollTimer);
    let after = Number.isSafeInteger(input.after) ? Math.max(0, Number(input.after)) : 0;
    const poll = async () => {
      try {
        const state = await this.updates.run(user.communityId, runId, after);
        if (state.events.length) after = state.events.at(-1)!.sequence;
        client.emit('system:update:state', state);
        if (['COMPLETED', 'FAILED', 'MANUAL_INTERVENTION_REQUIRED', 'CANCELLED'].includes(state.run.status)) return;
      } catch {
        client.emit('system:update:error', { code: 'temporarily_unavailable' });
      }
      client.data.pollTimer = setTimeout(poll, 1_000);
    };
    void poll();
  }
}

function cookieValue(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const [key, ...parts] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return undefined;
}
