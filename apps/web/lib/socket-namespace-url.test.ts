import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CHAT_NAMESPACE,
  EVENT_TASKS_NAMESPACE,
  SOCKET_PATH,
  resolveSocketNamespace,
} from './realtime';

test('same-origin namespaces remain root Socket.IO namespaces', () => {
  assert.equal(
    resolveSocketNamespace({ realtimeOrigin: undefined, namespace: CHAT_NAMESPACE }),
    '/chat',
  );
  assert.equal(
    resolveSocketNamespace({ realtimeOrigin: '', namespace: EVENT_TASKS_NAMESPACE }),
    '/event-tasks',
  );
});

test('split-port development resolves namespaces against only the realtime origin', () => {
  const chat = resolveSocketNamespace({
    realtimeOrigin: 'http://localhost:4000',
    namespace: CHAT_NAMESPACE,
  });
  const eventTasks = resolveSocketNamespace({
    realtimeOrigin: 'http://localhost:4000/',
    namespace: EVENT_TASKS_NAMESPACE,
  });

  assert.equal(chat, 'http://localhost:4000/chat');
  assert.equal(eventTasks, 'http://localhost:4000/event-tasks');
  assert.doesNotMatch(`${chat}\n${eventTasks}`, /\/api\/v1|\/socket\.io/);
});

test('namespace and origin trailing slashes are normalized without duplication', () => {
  assert.equal(
    resolveSocketNamespace({ realtimeOrigin: undefined, namespace: 'chat' }),
    '/chat',
  );
  assert.equal(
    resolveSocketNamespace({ realtimeOrigin: undefined, namespace: 'event-tasks' }),
    '/event-tasks',
  );
  assert.equal(
    resolveSocketNamespace({
      realtimeOrigin: 'https://community.example.com/',
      namespace: '/chat/',
    }),
    'https://community.example.com/chat',
  );
});

test('realtime origins reject paths, relative values, credentials, and protocol-relative values', () => {
  for (const realtimeOrigin of [
    'https://community.example.com/api/v1',
    'http://localhost:4000/api/v1',
    '/api/v1',
    '//community.example.com',
    'https://user:password@community.example.com',
    'ftp://community.example.com',
  ]) {
    assert.throws(
      () => resolveSocketNamespace({ realtimeOrigin, namespace: CHAT_NAMESPACE }),
      /Realtime origin/,
      realtimeOrigin,
    );
  }
});

test('REST and Engine.IO transport paths cannot be used as namespaces', () => {
  for (const namespace of ['/api/v1/chat', '/socket.io/chat']) {
    assert.throws(
      () => resolveSocketNamespace({ realtimeOrigin: undefined, namespace }),
      /separate from REST and transport paths/,
      namespace,
    );
  }

  assert.equal(SOCKET_PATH, '/socket.io');
});

test('resolver is server-render safe and contains no hardcoded deployment domain', async () => {
  assert.equal(
    resolveSocketNamespace({ namespace: CHAT_NAMESPACE }),
    '/chat',
  );

  const source = await readFile(new URL('./realtime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /private-host\.example\.invalid/);
  assert.doesNotMatch(source, /\bwindow\b|\bdocument\b/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_API_URL|API_URL/);
});
