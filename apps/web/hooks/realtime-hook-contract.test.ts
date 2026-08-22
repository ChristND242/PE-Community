import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  CHAT_NAMESPACE,
  EVENT_TASKS_NAMESPACE,
  SOCKET_PATH,
  resolveSocketNamespace,
} from '../lib/realtime';

const apiClientUrl = new URL('../lib/api.ts', import.meta.url);
const chatHookUrl = new URL('./use-chat-socket.ts', import.meta.url);
const eventTaskHookUrl = new URL('./use-event-task-realtime.ts', import.meta.url);

test('Chat socket construction uses the root namespace and explicit Engine.IO path', async () => {
  const source = await readFile(chatHookUrl, 'utf8');

  assert.match(source, /socketNamespaceUrl\(CHAT_NAMESPACE\)/);
  assert.match(source, /const socket = io\(socketUrl, \{\s*path: SOCKET_PATH,\s*withCredentials: true,\s*autoConnect: true,/);
  assert.equal(
    resolveSocketNamespace({ namespace: CHAT_NAMESPACE, realtimeOrigin: '' }),
    '/chat',
  );
  assert.equal(
    resolveSocketNamespace({
      namespace: CHAT_NAMESPACE,
      realtimeOrigin: 'http://localhost:4000',
    }),
    'http://localhost:4000/chat',
  );
  assert.equal(SOCKET_PATH, '/socket.io');
  assert.equal(source.match(/\bio\(/g)?.length, 1);
});

test('Event Tasks socket construction uses the root namespace and explicit Engine.IO path', async () => {
  const source = await readFile(eventTaskHookUrl, 'utf8');

  assert.match(source, /socketNamespaceUrl\(EVENT_TASKS_NAMESPACE\)/);
  assert.match(source, /const socket = io\(socketUrl, \{\s*path: SOCKET_PATH,\s*withCredentials: true,\s*autoConnect: true,/);
  assert.equal(
    resolveSocketNamespace({ namespace: EVENT_TASKS_NAMESPACE, realtimeOrigin: '' }),
    '/event-tasks',
  );
  assert.equal(
    resolveSocketNamespace({
      namespace: EVENT_TASKS_NAMESPACE,
      realtimeOrigin: 'http://localhost:4000',
    }),
    'http://localhost:4000/event-tasks',
  );
  assert.equal(source.match(/\bio\(/g)?.length, 1);
});

test('Socket.IO clients cannot derive namespaces from the REST API base', async () => {
  const [apiClient, chatHook, eventTaskHook] = await Promise.all([
    readFile(apiClientUrl, 'utf8'),
    readFile(chatHookUrl, 'utf8'),
    readFile(eventTaskHookUrl, 'utf8'),
  ]);
  const socketClientSources = `${apiClient}\n${chatHook}\n${eventTaskHook}`;

  assert.doesNotMatch(socketClientSources, /\/api\/v1\/chat|\/api\/v1\/event-tasks/);
  assert.doesNotMatch(`${chatHook}\n${eventTaskHook}`, /NEXT_PUBLIC_API_URL|\bAPI_URL\b/);
  assert.match(chatHook, /socket\.disconnect\(\);\s*socketRef\.current = null/);
  assert.match(eventTaskHook, /socket\.disconnect\(\);/);
  assert.doesNotMatch(`${chatHook}\n${eventTaskHook}`, /reconnection:\s*false|transports:\s*\[/);
});
