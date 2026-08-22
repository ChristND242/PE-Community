import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const requireFromWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { io } = requireFromWeb('socket.io-client');

const baseUrl = process.env.REALTIME_TEST_BASE_URL ?? 'http://caddy';
const setupToken = process.env.REALTIME_TEST_SETUP_TOKEN;
const mode = process.env.REALTIME_TEST_MODE ?? 'verify';
const socketPath = '/socket.io';
const chatNamespace = '/chat';
const eventTasksNamespace = '/event-tasks';
const testEmail = 'realtime.audit@example.test';
const testPassword = 'Realtime-Audit-Password-123!';

const timeline = [];
const startedAt = performance.now();

function record(layer, event, detail = {}) {
  timeline.push({
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
    layer,
    event,
    ...detail,
  });
}

function printTimeline() {
  process.stdout.write(`${JSON.stringify({ timeline }, null, 2)}\n`);
}

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return response;
}

async function provisionSession() {
  const setup = await request('/api/v1/setup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-setup-token': setupToken,
    },
    body: JSON.stringify({
      communityName: 'Realtime integration',
      communitySlug: 'realtime-integration',
      defaultLanguage: 'en',
      ownerEmail: testEmail,
      ownerFullName: 'Realtime Audit Owner',
      ownerPassword: testPassword,
      timezone: 'UTC',
    }),
  });
  assert.equal(setup.status, 201, `setup failed with ${setup.status}`);
  record('http', 'setup-complete');

  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.equal(login.status, 201, `login failed with ${login.status}`);
  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie, 'login did not return a session cookie');
  const cookie = setCookie.split(';', 1)[0];
  assert.match(cookie, /^pe_session=/);
  record('http', 'session-created', { cookiePresent: true });
  return cookie;
}

function socketOptions(cookie, auditId, overrides = {}) {
  // engine.io-client's Node cookie jar augments the lowercase header key.
  const extraHeaders = cookie ? { cookie } : undefined;
  return {
    autoConnect: false,
    extraHeaders,
    path: socketPath,
    query: { realtimeAuditId: auditId },
    timeout: 8000,
    transportOptions: {
      polling: { extraHeaders },
      websocket: { extraHeaders },
    },
    withCredentials: true,
    ...overrides,
  };
}

function attachTrace(socket, owner) {
  const manager = socket.io;
  record('client', 'namespace-created', { owner, namespace: socket.nsp });
  socket.on('connect', () => record('namespace', 'connect', { owner, active: socket.active }));
  socket.on('connect_error', (error) => record('namespace', 'connect-error', { owner, message: error.message }));
  socket.on('disconnect', (reason) => record('namespace', 'disconnect', { owner, active: socket.active, reason }));
  manager.on('open', () => {
    record('manager', 'open', { owner, transport: manager.engine?.transport.name });
    manager.engine?.once('upgrade', (transport) => record('engine', 'upgrade', { owner, transport: transport.name }));
    manager.engine?.once('upgradeError', (error) => record('engine', 'upgrade-error', { owner, message: error.message }));
    manager.engine?.once('close', (reason) => record('engine', 'close', { owner, reason }));
  });
  manager.on('error', (error) => record('manager', 'error', { owner, message: error.message }));
  manager.on('close', (reason) => record('manager', 'close', { owner, reason }));
  manager.on('reconnect_attempt', (attempt) => record('manager', 'reconnect-attempt', { owner, attempt }));
  manager.on('reconnect_failed', () => record('manager', 'reconnect-failed', { owner }));
}

function waitForEvent(emitter, event, timeoutMs, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off(event, onEvent);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function onEvent(...args) {
      if (!predicate(...args)) return;
      clearTimeout(timer);
      emitter.off(event, onEvent);
      resolve(args);
    }
    emitter.on(event, onEvent);
  });
}

async function reproduceChatAuthenticationRace(cookie) {
  const attemptCount = mode === 'reproduce' ? 12 : 4;
  const attempts = Array.from({ length: attemptCount }, async (_, index) => {
    const owner = `chat-race-${index + 1}`;
    const socket = io(`${baseUrl}${chatNamespace}`, socketOptions(cookie, randomUUID()));
    attachTrace(socket, owner);
    let unauthorized = false;
    socket.on('chat:error', (payload) => {
      record('application', 'chat-error', { owner, code: payload?.code });
      if (payload?.code === 'unauthorized') unauthorized = true;
    });
    socket.on('connect', () => {
      record('application', 'join-requested', { owner });
      socket.emit('chat:conversation:join', { conversationId: 'realtime-audit-missing-conversation' });
    });
    socket.connect();

    try {
      await Promise.race([
        waitForEvent(socket, 'disconnect', 8000),
        waitForEvent(socket, 'chat:error', 8000, (payload) => payload?.code === 'access_denied'),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { unauthorized, disconnectReason: socket.disconnected ? 'disconnected' : null };
    } finally {
      socket.disconnect();
    }
  });

  const results = await Promise.all(attempts);
  const unauthorizedCount = results.filter((result) => result.unauthorized).length;
  record('assertion', 'chat-race-results', { attempts: results.length, unauthorizedCount });
  if (mode === 'reproduce') {
    assert.ok(unauthorizedCount > 0, 'the chat authentication race was not reproduced');
  } else {
    assert.equal(unauthorizedCount, 0, 'an authenticated chat socket was rejected before authentication completed');
  }
}

async function verifyPollingHandshake() {
  const response = await request('/socket.io/?EIO=4&transport=polling');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/);
  const body = await response.text();
  assert.ok(body.startsWith('0'), 'polling response did not contain an Engine.IO open packet');
  const openPacket = JSON.parse(body.slice(1));
  assert.ok(Array.isArray(openPacket.upgrades) && openPacket.upgrades.includes('websocket'));
  assert.equal(typeof openPacket.sid, 'string');
  record('assertion', 'polling-handshake', { websocketOffered: true });

  await request(`/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(openPacket.sid)}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
    body: '1',
  });
}

async function waitForCondition(description, predicate, timeoutMs = 4000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function verifyChatTransport(cookie, transportMode) {
  const owner = `chat-${transportMode}`;
  const transports = transportMode === 'polling'
    ? ['polling']
    : transportMode === 'websocket'
      ? ['websocket']
      : undefined;
  const socket = io(`${baseUrl}${chatNamespace}`, socketOptions(cookie, randomUUID(), {
    forceNew: true,
    ...(transports ? { transports } : {}),
  }));
  attachTrace(socket, owner);
  socket.on('connect', () => {
    socket.emit('chat:conversation:join', { conversationId: `realtime-audit-${transportMode}` });
  });
  const connected = waitForEvent(socket, 'connect', 8000);
  const accessDenied = waitForEvent(socket, 'chat:error', 8000, (payload) => payload?.code === 'access_denied');
  socket.connect();
  try {
    await connected;
    assert.equal(socket.nsp, chatNamespace);
    await accessDenied;
    if (transportMode === 'upgrade') {
      await waitForCondition('polling-to-WebSocket upgrade', () => socket.io.engine?.transport.name === 'websocket');
    } else {
      assert.equal(socket.io.engine?.transport.name, transportMode);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(socket.connected, true, `${transportMode} chat transport closed during the stability window`);
    record('assertion', 'chat-transport-stable', {
      connected: true,
      transport: socket.io.engine?.transport.name ?? 'unknown',
    });
  } finally {
    socket.disconnect();
  }
}

async function verifyEventTasksControl(cookie) {
  const owner = 'event-tasks-control';
  const socket = io(`${baseUrl}${eventTasksNamespace}`, socketOptions(cookie, randomUUID(), { forceNew: true }));
  attachTrace(socket, owner);
  socket.on('connect', () => {
    record('application', 'event-join-requested', { owner });
    socket.emit('event.tasks.join', { eventId: 'realtime-audit-missing-event' });
  });
  const connected = waitForEvent(socket, 'connect', 8000);
  const accessDenied = waitForEvent(socket, 'event.tasks.error', 8000, (value) => value?.code === 'access_denied');
  socket.connect();
  try {
    await connected;
    assert.equal(socket.nsp, eventTasksNamespace);
    const [payload] = await accessDenied;
    assert.equal(payload.code, 'access_denied');
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(socket.connected, true, 'event-task socket did not remain connected after authorized namespace authentication');
    record('assertion', 'event-control-stable', { connected: true });
  } finally {
    socket.disconnect();
  }
}

async function verifyNamespaceIsolation(cookie) {
  const chat = io(
    `${baseUrl}${chatNamespace}`,
    socketOptions(cookie, randomUUID(), { autoConnect: false }),
  );
  const eventTasks = io(
    `${baseUrl}${eventTasksNamespace}`,
    socketOptions(cookie, randomUUID(), { autoConnect: false }),
  );
  const managerCount = new Set([chat.io, eventTasks.io]).size;
  record('assertion', 'page-scoped-managers', { managerCount });

  const chatConnected = waitForEvent(chat, 'connect', 8000);
  const eventTasksConnected = waitForEvent(eventTasks, 'connect', 8000);
  chat.connect();
  eventTasks.connect();
  try {
    await Promise.all([chatConnected, eventTasksConnected]);
    chat.disconnect();
    assert.equal(eventTasks.connected, true, 'disconnecting chat interrupted the event-task namespace');
    record('assertion', 'namespace-isolation', { eventTasksConnected: true });
  } finally {
    chat.disconnect();
    eventTasks.disconnect();
  }
}

async function verifyTransientReconnect(cookie) {
  const owner = 'chat-transient-reconnect';
  const socket = io(
    `${baseUrl}${chatNamespace}`,
    socketOptions(cookie, randomUUID(), { forceNew: true }),
  );
  attachTrace(socket, owner);
  const connected = waitForEvent(socket, 'connect', 8000);
  socket.connect();
  try {
    await connected;
    const reconnectAttempt = waitForEvent(socket.io, 'reconnect_attempt', 8000);
    const reconnected = waitForEvent(socket, 'connect', 8000);
    socket.io.engine?.close();
    await Promise.all([reconnectAttempt, reconnected]);

    const accessDenied = waitForEvent(
      socket,
      'chat:error',
      8000,
      (payload) => payload?.code === 'access_denied',
    );
    socket.emit('chat:conversation:join', {
      conversationId: 'realtime-audit-after-reconnect',
    });
    await accessDenied;
    assert.equal(socket.connected, true, 'chat did not remain usable after transient reconnect');
    record('assertion', 'transient-reconnect-stable', { connected: true });
  } finally {
    socket.disconnect();
  }
}

async function verifyRejectedSession(cookie) {
  await request('/api/v1/auth/logout', {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  record('http', 'session-invalidated');

  for (const [owner, rejectedCookie] of [
    ['missing-session', undefined],
    ['expired-session', cookie],
  ]) {
    const socket = io(`${baseUrl}${chatNamespace}`, socketOptions(rejectedCookie, randomUUID(), { forceNew: true }));
    attachTrace(socket, owner);
    let reconnectAttempts = 0;
    socket.io.on('reconnect_attempt', () => {
      reconnectAttempts += 1;
    });
    const unauthorized = waitForEvent(socket, 'chat:error', 8000, (value) => value?.code === 'unauthorized');
    const disconnected = waitForEvent(socket, 'disconnect', 8000);
    socket.connect();
    try {
      const [payload] = await unauthorized;
      assert.equal(payload.code, 'unauthorized');
      const [reason] = await disconnected;
      assert.equal(reason, 'io server disconnect');
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(reconnectAttempts, 0, 'permanent session rejection entered a reconnect loop');
      record('assertion', 'session-rejected', { owner, reason });
    } finally {
      socket.disconnect();
    }
  }
}

async function verifyInvalidRestPrefixedNamespace(cookie, namespace) {
  const owner = `invalid-namespace-${namespace.slice(1).replaceAll('/', '-')}`;
  const socket = io(
    `${baseUrl}${namespace}`,
    socketOptions(cookie, randomUUID(), {
      forceNew: true,
      reconnection: false,
    }),
  );
  attachTrace(socket, owner);
  const rejected = waitForEvent(socket, 'connect_error', 8000);
  socket.connect();
  try {
    const [error] = await rejected;
    assert.equal(socket.nsp, namespace);
    assert.match(error.message, /Invalid namespace/i);
    assert.equal(socket.connected, false);
    record('assertion', 'rest-prefixed-namespace-rejected', {
      namespace,
      message: error.message,
    });
  } finally {
    socket.disconnect();
  }
}

try {
  const cookie = await provisionSession();
  await verifyPollingHandshake();
  await reproduceChatAuthenticationRace(cookie);
  await verifyChatTransport(cookie, 'polling');
  await verifyChatTransport(cookie, 'websocket');
  await verifyChatTransport(cookie, 'upgrade');
  await verifyEventTasksControl(cookie);
  await verifyNamespaceIsolation(cookie);
  await verifyTransientReconnect(cookie);
  await verifyInvalidRestPrefixedNamespace(cookie, '/api/v1/chat');
  await verifyInvalidRestPrefixedNamespace(cookie, '/api/v1/event-tasks');
  await verifyRejectedSession(cookie);
  printTimeline();
} catch (error) {
  record('test', 'failure', { message: error instanceof Error ? error.message : String(error) });
  printTimeline();
  throw error;
}
