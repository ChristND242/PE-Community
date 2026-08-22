import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const caddyUrl = new URL('./Caddyfile', import.meta.url);
const composeUrl = new URL('../docker-compose.prod.yml', import.meta.url);
const envUrl = new URL('../.env.example', import.meta.url);
const apiClientUrl = new URL('../apps/web/lib/api.ts', import.meta.url);
const realtimeClientUrl = new URL('../apps/web/lib/realtime.ts', import.meta.url);
const chatClientUrl = new URL('../apps/web/hooks/use-chat-socket.ts', import.meta.url);
const eventTaskClientUrl = new URL('../apps/web/hooks/use-event-task-realtime.ts', import.meta.url);
const chatGatewayUrl = new URL('../apps/api/src/chat/chat.gateway.ts', import.meta.url);
const eventTaskGatewayUrl = new URL('../apps/api/src/event-tasks-realtime/event-tasks-realtime.gateway.ts', import.meta.url);
const apiMainUrl = new URL('../apps/api/src/main.ts', import.meta.url);
const webDockerfileUrl = new URL('../apps/web/Dockerfile', import.meta.url);

test('Caddy site address is environment-driven with a direct-IP HTTP fallback', async () => {
  const caddy = await readFile(caddyUrl, 'utf8');

  assert.match(caddy, /^\{\$APP_DOMAIN::80\} \{/);
  assert.doesNotMatch(caddy, /^:80 \{/m);
  assert.match(caddy, /encode zstd gzip/);
  assert.match(caddy, /handle \/socket\.io\*[\s\S]*reverse_proxy api:4000/);
  assert.match(caddy, /handle_path \/api\/v1\/\*[\s\S]*reverse_proxy api:4000/);
  assert.match(caddy, /handle \/uploads\/\*[\s\S]*reverse_proxy api:4000/);
  assert.match(caddy, /handle \{[\s\S]*reverse_proxy web:3000/);
  assert.doesNotMatch(caddy, /community\.example\.com|private-host\.example\.invalid/);
});

test('Caddy preserves the Socket.IO transport path before the web fallback', async () => {
  const caddy = await readFile(caddyUrl, 'utf8');
  const socketRouteStart = caddy.indexOf('handle /socket.io*');
  const apiRouteStart = caddy.indexOf('handle_path /api/v1/*');
  const webFallbackStart = caddy.indexOf('handle {');
  const socketRoute = caddy.slice(socketRouteStart, apiRouteStart);

  assert.ok(socketRouteStart >= 0);
  assert.ok(socketRouteStart < apiRouteStart);
  assert.ok(apiRouteStart < webFallbackStart);
  assert.match(socketRoute, /reverse_proxy api:4000/);
  assert.doesNotMatch(socketRoute, /handle_path|rewrite|uri\s/);
  assert.doesNotMatch(caddy, /header_up\s+(?:Connection|Upgrade)/);
});

test('production Compose injects Caddy address and publishes HTTP and HTTPS only at the edge', async () => {
  const compose = await readFile(composeUrl, 'utf8');
  const caddyService = compose.slice(compose.indexOf('  caddy:'), compose.indexOf('\nvolumes:'));

  assert.match(caddyService, /APP_DOMAIN: "\$\{APP_DOMAIN:-:80\}"/);
  assert.match(caddyService, /"\$\{HTTP_PORT:-80\}:80"/);
  assert.match(caddyService, /"\$\{HTTPS_PORT:-443\}:443"/);
  assert.match(caddyService, /"\$\{HTTPS_PORT:-443\}:443\/udp"/);
  assert.doesNotMatch(compose, /ports:[\s\S]{0,80}"(?:3000|4000|5432|6379):/);
  assert.match(compose, /caddy_data:\/data/);
  assert.match(compose, /caddy_config:\/config/);
  assert.match(compose, /NEXT_PUBLIC_API_URL: "\$\{NEXT_PUBLIC_API_URL:-\/api\/v1\}"/);
  assert.match(compose, /NEXT_PUBLIC_REALTIME_ORIGIN: "\$\{NEXT_PUBLIC_REALTIME_ORIGIN:-\}"/);
});

test('environment example separates host-run REST and realtime configuration from production routing', async () => {
  const env = await readFile(envUrl, 'utf8');

  assert.match(env, /HTTP_PORT=80/);
  assert.match(env, /HTTPS_PORT=443/);
  assert.match(env, /APP_DOMAIN=community\.example\.com/);
  assert.match(env, /WEB_ORIGIN=https:\/\/community\.example\.com/);
  assert.match(env, /NEXT_PUBLIC_API_URL=\/api\/v1/);
  assert.match(env, /NEXT_PUBLIC_REALTIME_ORIGIN=\n/);
  assert.match(env, /INTERNAL_API_URL=http:\/\/api:4000/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION/);
});

test('production clients and API gateways share root Socket.IO namespaces with cookie authentication', async () => {
  const [apiClient, realtimeClient, chatClient, eventTaskClient, chatGateway, eventTaskGateway, apiMain, compose] = await Promise.all([
    readFile(apiClientUrl, 'utf8'),
    readFile(realtimeClientUrl, 'utf8'),
    readFile(chatClientUrl, 'utf8'),
    readFile(eventTaskClientUrl, 'utf8'),
    readFile(chatGatewayUrl, 'utf8'),
    readFile(eventTaskGatewayUrl, 'utf8'),
    readFile(apiMainUrl, 'utf8'),
    readFile(composeUrl, 'utf8'),
  ]);

  assert.doesNotMatch(apiClient, /socketNamespaceUrl|NEXT_PUBLIC_REALTIME_ORIGIN/);
  assert.match(realtimeClient, /export const SOCKET_PATH = '\/socket\.io'/);
  assert.match(realtimeClient, /export const CHAT_NAMESPACE = '\/chat'/);
  assert.match(realtimeClient, /export const EVENT_TASKS_NAMESPACE = '\/event-tasks'/);
  assert.match(realtimeClient, /process\.env\.NEXT_PUBLIC_REALTIME_ORIGIN/);
  assert.doesNotMatch(realtimeClient, /NEXT_PUBLIC_API_URL|\bAPI_URL\b/);

  assert.match(chatClient, /socketNamespaceUrl\(CHAT_NAMESPACE\)/);
  assert.match(chatClient, /path: SOCKET_PATH/);
  assert.match(chatClient, /withCredentials: true/);
  assert.match(eventTaskClient, /socketNamespaceUrl\(EVENT_TASKS_NAMESPACE\)/);
  assert.match(eventTaskClient, /path: SOCKET_PATH/);
  assert.match(eventTaskClient, /withCredentials: true/);
  assert.doesNotMatch(`${chatClient}\n${eventTaskClient}`, /NEXT_PUBLIC_API_URL|\bAPI_URL\b/);
  assert.doesNotMatch(`${apiClient}\n${chatClient}\n${eventTaskClient}`, /\/api\/v1\/(?:chat|event-tasks)/);

  assert.match(chatGateway, /@WebSocketGateway\(\{[\s\S]*namespace: 'chat'/);
  assert.match(chatGateway, /client\.handshake\.headers\.cookie/);
  assert.match(chatGateway, /this\.auth\.userFromCookie\(sessionCookie\)/);
  assert.match(eventTaskGateway, /@WebSocketGateway\(\{[\s\S]*namespace: 'event-tasks'/);
  assert.match(eventTaskGateway, /client\.handshake\.headers\.cookie/);
  assert.match(eventTaskGateway, /this\.auth\.userFromCookie\(sessionCookie\)/);
  assert.doesNotMatch(`${chatGateway}\n${eventTaskGateway}`, /path:\s*['"`]|transports:\s*\[/);

  assert.match(apiMain, /await app\.listen\(Number\(process\.env\.API_PORT \?\? 4000\)\)/);
  assert.match(compose, /api:[\s\S]*expose:\s*\n\s+- "4000"/);
  assert.doesNotMatch(compose, /ports:[\s\S]{0,80}"4000:/);
});

test('the production web image receives all public configuration during next build', async () => {
  const [dockerfile, compose] = await Promise.all([
    readFile(webDockerfileUrl, 'utf8'),
    readFile(composeUrl, 'utf8'),
  ]);

  assert.match(dockerfile, /ARG NEXT_PUBLIC_API_URL=\/api\/v1/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_REALTIME_ORIGIN=/);
  assert.match(dockerfile, /ENV NEXT_PUBLIC_REALTIME_ORIGIN=\$\{NEXT_PUBLIC_REALTIME_ORIGIN\}/);
  assert.ok(
    dockerfile.indexOf('ENV NEXT_PUBLIC_REALTIME_ORIGIN=') < dockerfile.indexOf('RUN pnpm --filter @pe/web build'),
  );
  assert.match(compose, /build:[\s\S]*args:[\s\S]*NEXT_PUBLIC_API_URL: "\$\{NEXT_PUBLIC_API_URL:-\/api\/v1\}"[\s\S]*NEXT_PUBLIC_REALTIME_ORIGIN: "\$\{NEXT_PUBLIC_REALTIME_ORIGIN:-\}"/);
  assert.doesNotMatch(`${dockerfile}\n${compose}`, /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION/);
});

test('realtime owners remain stable and chat events await connection authentication', async () => {
  const [chatClient, eventTaskClient, chatGateway] = await Promise.all([
    readFile(chatClientUrl, 'utf8'),
    readFile(eventTaskClientUrl, 'utf8'),
    readFile(chatGatewayUrl, 'utf8'),
  ]);

  assert.match(chatClient, /const socketUrl = useMemo\(\(\) => socketNamespaceUrl\(CHAT_NAMESPACE\), \[\]\)/);
  assert.match(chatClient, /const onMessageRef = useRef\(onMessage\)/);
  assert.match(chatClient, /socket\.disconnect\(\);\s*socketRef\.current = null/);
  assert.match(chatClient, /\}, \[clearTypingForConversation, clearTypingTimer, enabled, joinConversation, socketUrl\]\);/);

  assert.match(eventTaskClient, /const socketUrl = useMemo\(\(\) => socketNamespaceUrl\(EVENT_TASKS_NAMESPACE\), \[\]\)/);
  assert.match(eventTaskClient, /const onChangedRef = useRef\(onChanged\)/);
  assert.match(eventTaskClient, /socket\.disconnect\(\);/);
  assert.match(eventTaskClient, /\}, \[eventId, socketUrl\]\);/);

  assert.doesNotMatch(`${chatClient}\n${eventTaskClient}`, /reconnection:\s*false|transports:\s*\[/);
  assert.match(chatGateway, /authentication\?: Promise<RequestUser>/);
  assert.match(chatGateway, /client\.data\.authentication = authentication/);
  assert.match(chatGateway, /const user = await this\.userOrDisconnect\(client\)/);
  assert.match(chatGateway, /const authenticatedUser = await client\.data\.authentication/);
});
