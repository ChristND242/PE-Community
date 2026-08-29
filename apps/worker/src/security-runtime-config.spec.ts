import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkerSecurityConfig } from './security-runtime-config.js';

test('production worker requires a non-placeholder 32-byte secret encryption key', () => {
  assert.throws(() => validateWorkerSecurityConfig({ NODE_ENV: 'production' }), /EMAIL_ENCRYPTION_KEY/);
  assert.throws(() => validateWorkerSecurityConfig({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: '<generate-a-strong-random-secret>' }), /EMAIL_ENCRYPTION_KEY/);
  assert.throws(() => validateWorkerSecurityConfig({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: 'short' }), /EMAIL_ENCRYPTION_KEY/);
  assert.doesNotThrow(() => validateWorkerSecurityConfig({ NODE_ENV: 'production', EMAIL_ENCRYPTION_KEY: 'w'.repeat(32) }));
  assert.doesNotThrow(() => validateWorkerSecurityConfig({ NODE_ENV: 'test' }));
});
