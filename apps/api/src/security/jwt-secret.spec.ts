import assert from 'node:assert/strict';
import test from 'node:test';
import { loadJwtSecret } from './jwt-secret';

test('JWT secret configuration fails closed in production', () => {
  assert.throws(() => loadJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET is required/);
  assert.throws(
    () => loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'change-me' }),
    /must contain at least 32 bytes/,
  );
  assert.throws(
    () => loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short-secret' }),
    /must contain at least 32 bytes/,
  );
});

test('JWT secret configuration accepts a strong production value and keeps a development fallback', () => {
  const configured = 'synthetic-jwt-secret-with-at-least-32-bytes';
  assert.equal(loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: configured }), configured);
  assert.match(loadJwtSecret({ NODE_ENV: 'development' }), /local-development/);
});
