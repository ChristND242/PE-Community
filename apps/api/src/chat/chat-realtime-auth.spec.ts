import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatGateway } from './chat.gateway';

const requestUser = {
  id: 'user-1',
  email: 'owner@example.test',
  name: 'Owner',
  communityId: 'community-1',
  community: {
    defaultLanguage: 'en',
    timezone: 'UTC',
  },
  role: 'OWNER',
  permissions: ['chat.view'],
  avatarUrl: null,
  dicebearStyle: null,
  dicebearSeed: null,
  forcePasswordChange: false,
};

test('an immediate chat event awaits in-flight namespace authentication', async () => {
  let resolveAuthentication!: (user: typeof requestUser) => void;
  const authentication = new Promise<typeof requestUser>((resolve) => {
    resolveAuthentication = resolve;
  });
  const auth = {
    cookieName: 'pe_session',
    userFromCookie: () => authentication,
  };
  let participantChecks = 0;
  const chat = {
    ensureParticipant: async () => {
      participantChecks += 1;
    },
    conversationPresenceSnapshot: async () => [],
  };
  const emitted: Array<{ event: string; payload: unknown }> = [];
  let disconnects = 0;
  const client = {
    id: 'socket-1',
    connected: true,
    data: {},
    handshake: {
      headers: { cookie: 'pe_session=audit-cookie-redacted' },
      query: {},
    },
    conn: {
      once: () => undefined,
    },
    disconnect: () => {
      disconnects += 1;
    },
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
    join: async () => undefined,
    to: () => ({ emit: () => undefined }),
  };
  const gateway = new ChatGateway(auth as never, chat as never);

  const connection = gateway.handleConnection(client as never);
  const join = gateway.joinConversation(client as never, { conversationId: 'conversation-1' });
  await Promise.resolve();

  assert.equal(participantChecks, 0);
  assert.equal(disconnects, 0);

  resolveAuthentication(requestUser);
  await Promise.all([connection, join]);

  assert.equal(participantChecks, 1);
  assert.equal(disconnects, 0);
  assert.ok(emitted.some(({ event }) => event === 'chat:conversation:joined'));
  assert.ok(!emitted.some(({ event, payload }) => event === 'chat:error' && (payload as { code?: string }).code === 'unauthorized'));
});
