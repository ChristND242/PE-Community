import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AuthenticationRateLimitException, PasskeyChallengeService } from '../auth/passkey-challenge.service';
import { loadJwtSecret } from '../auth/auth-security-config';
import { realtimeSessionRegistry } from '../auth/realtime-session-registry';
import { EventTasksRealtimeGateway } from '../event-tasks-realtime/event-tasks-realtime.gateway';
import { validateProductionSecretEncryption } from './encrypted-secret';

test('production rejects a missing, development, or short JWT secret', () => {
  assert.throws(() => loadJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' }), /JWT_SECRET/);
  assert.throws(() => loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: '<generate-a-strong-random-secret>' }), /JWT_SECRET/);
  assert.throws(() => loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'too-short' }), /JWT_SECRET/);
  assert.equal(loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) }), 'a'.repeat(32));
  assert.equal(loadJwtSecret({ NODE_ENV: 'test' }), 'dev-secret-change-me');
});

test('production rejects an empty, placeholder, or short server-side secret encryption key', () => {
  assert.throws(() => validateProductionSecretEncryption({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: '' }), /EMAIL_ENCRYPTION_KEY/);
  assert.throws(() => validateProductionSecretEncryption({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: '<generate-a-strong-random-secret>' }), /EMAIL_ENCRYPTION_KEY/);
  assert.throws(() => validateProductionSecretEncryption({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: 'short' }), /EMAIL_ENCRYPTION_KEY/);
  assert.doesNotThrow(() => validateProductionSecretEncryption({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: 'e'.repeat(32) }));
  assert.doesNotThrow(() => validateProductionSecretEncryption({ NODE_ENV: 'test', EMAIL_ENCRYPTION_KEY: '' }));
});

test('generic authentication limits are Redis-backed, bounded, and fail with 429 semantics', async () => {
  let count = 0;
  const redis = {
    eval: async () => [++count, 300],
    set: async () => 'OK',
    quit: async () => 'OK',
    disconnect: () => undefined,
  };
  const limits = new PasskeyChallengeService(redis as never);
  await limits.enforceAuthenticationRateLimit('password-login', 'source', 1, 300);
  await assert.rejects(
    limits.enforceAuthenticationRateLimit('password-login', 'source', 1, 300),
    (error: unknown) => error instanceof AuthenticationRateLimitException && error.getStatus() === 429,
  );
});

test('session revocation disconnects every registered namespace for that session only', () => {
  const disconnected: string[] = [];
  realtimeSessionRegistry.register('audit:chat-1', { userId: 'user-1', sessionId: 'session-1', disconnect: () => disconnected.push('chat') });
  realtimeSessionRegistry.register('audit:tasks-1', { userId: 'user-1', sessionId: 'session-1', disconnect: () => disconnected.push('tasks') });
  realtimeSessionRegistry.register('audit:chat-2', { userId: 'user-1', sessionId: 'session-2', disconnect: () => disconnected.push('other') });

  realtimeSessionRegistry.revokeSession('session-1');

  assert.deepEqual(disconnected.sort(), ['chat', 'tasks']);
  realtimeSessionRegistry.unregister('audit:chat-2');
});

test('event-task realtime rejects a cached user after authoritative session revocation', async () => {
  let eventQueries = 0;
  let disconnects = 0;
  const gateway = new EventTasksRealtimeGateway({
    revalidateUserSession: async () => { throw new Error('revoked'); },
  } as never, {
    event: { findFirst: async () => { eventQueries += 1; return { id: 'event-1' }; } },
  } as never);
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const client = {
    id: 'event-socket-revoked',
    data: { user: { id: 'user-1', sessionId: 'session-1', communityId: 'community-1' } },
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
    disconnect: () => { disconnects += 1; },
  };

  await gateway.joinEventTasks(client as never, { eventId: 'event-1' });

  assert.equal(eventQueries, 0);
  assert.equal(disconnects, 1);
  assert.deepEqual(emitted, [{ event: 'event.tasks.error', payload: { code: 'unauthorized' } }]);
});

test('sensitive anonymous and export paths use bounded server-side limits', async () => {
  const root = new URL('../../../../', import.meta.url);
  const [auth, activity, caddy, productionCompose] = await Promise.all([
    readFile(new URL('apps/api/src/auth/auth.service.ts', root), 'utf8'),
    readFile(new URL('apps/api/src/auth/security-activity.service.ts', root), 'utf8'),
    readFile(new URL('deploy/Caddyfile', root), 'utf8'),
    readFile(new URL('docker-compose.prod.yml', root), 'utf8'),
  ]);
  for (const scope of ['password-login', 'totp-login', 'forgot-password', 'reset-password', 'owner-totp-reenrollment']) {
    assert.match(auth, new RegExp(`enforceAuthenticationLimits\\('${scope}'`));
  }
  assert.match(activity, /security-export:session/);
  assert.match(activity, /security-export:source/);
  assert.match(auth, /if \(user\.twoFactorEnabled\)/);
  assert.match(auth, /twoFactorSecret: user\.twoFactorSecret, twoFactorEnabled: false/);
  assert.match(caddy, /Content-Security-Policy "frame-ancestors 'none'"/);
  assert.match(caddy, /X-Frame-Options "DENY"/);
  assert.match(caddy, /X-Content-Type-Options "nosniff"/);
  assert.match(caddy, /Strict-Transport-Security "max-age=31536000"/);
  assert.match(productionCompose, /PASSWORD_PEPPER_PREVIOUS:/);
  assert.match(productionCompose, /TRUSTED_PROXY_CIDRS:/);
  assert.match(productionCompose, /SECURITY_COUNTRY_HEADER:/);
  assert.match(productionCompose, /SECURITY_COUNTRY_TRUSTED_PROXY_CIDRS:/);
});
