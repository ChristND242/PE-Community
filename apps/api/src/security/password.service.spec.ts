import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import {
  ARGON2ID_OPTIONS,
  loadPasswordConfig,
  PASSWORD_HASH_ENVELOPE,
  PasswordService,
} from './password.service';

const currentPepper = 'current-test-pepper-with-at-least-32-bytes';
const previousPepper = 'previous-test-pepper-with-at-least-32-bytes';
const password = 'Synthetic audit password with unicode: cafe-\u00e9';

test('new hashes use the v2 Argon2id envelope and unique salts', async () => {
  const service = passwordService();
  const first = await service.hash(password);
  const second = await service.hash(password);

  assert.match(first, /^v2:argon2id-hmac-sha256:\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
  assert.notEqual(first, second);
  assert.deepEqual(await service.verify(first, password), { valid: true, needsRehash: false });
  assert.deepEqual(await service.verify(second, password), { valid: true, needsRehash: false });
  assert.deepEqual(await service.verify(first, 'incorrect synthetic value'), { valid: false, needsRehash: false });
});

test('long passwords are verified without bcrypt-style truncation', async () => {
  const service = passwordService();
  const longPassword = `${'a'.repeat(160)}-original-tail`;
  const samePrefixDifferentTail = `${'a'.repeat(160)}-changed-tail`;
  const storedHash = await service.hash(longPassword);

  assert.equal((await service.verify(storedHash, longPassword)).valid, true);
  assert.equal((await service.verify(storedHash, samePrefixDifferentTail)).valid, false);
});

test('successful legacy bcrypt verification returns an Argon2id upgrade', async () => {
  const service = passwordService();
  const legacyHash = await bcrypt.hash(password, 4);
  const result = await service.verify(legacyHash, password);

  assert.equal(result.valid, true);
  assert.equal(result.needsRehash, true);
  assert.ok(result.upgradedHash?.startsWith(`${PASSWORD_HASH_ENVELOPE}$argon2id$`));
  assert.equal((await service.verify(result.upgradedHash!, password)).valid, true);
});

test('failed legacy verification never creates an upgraded hash', async () => {
  const service = passwordService();
  const legacyHash = await bcrypt.hash(password, 4);
  const result = await service.verify(legacyHash, 'incorrect synthetic value');

  assert.deepEqual(result, { valid: false, needsRehash: false });
});

test('weaker Argon2id parameters are upgraded after verification', async () => {
  const service = passwordService();
  const preprocessed = createHmac('sha256', currentPepper).update(password, 'utf8').digest();
  const weakInnerHash = await argon2.hash(preprocessed, { ...ARGON2ID_OPTIONS, memoryCost: 8192, timeCost: 1 });
  const result = await service.verify(`${PASSWORD_HASH_ENVELOPE}${weakInnerHash}`, password);

  assert.equal(result.valid, true);
  assert.equal(result.needsRehash, true);
  assert.ok(result.upgradedHash?.startsWith(PASSWORD_HASH_ENVELOPE));
});

test('a previous pepper verifies once and upgrades to the current pepper', async () => {
  const oldService = new PasswordService({ currentPepper: previousPepper });
  const rotatingService = new PasswordService({ currentPepper, previousPepper });
  const oldHash = await oldService.hash(password);
  const result = await rotatingService.verify(oldHash, password);

  assert.equal(result.valid, true);
  assert.equal(result.needsRehash, true);
  assert.ok(result.upgradedHash);
  assert.equal((await rotatingService.verify(result.upgradedHash!, password)).valid, true);
  assert.equal((await oldService.verify(result.upgradedHash!, password)).valid, false);
});

test('unknown formats fail safely and production configuration has no fallback pepper', async () => {
  const service = passwordService();
  assert.equal(service.identifyFormat('not-a-password-hash'), 'UNKNOWN');
  assert.deepEqual(await service.verify('not-a-password-hash', password), { valid: false, needsRehash: false });
  assert.throws(() => loadPasswordConfig({ NODE_ENV: 'production' }), /PASSWORD_PEPPER is required/);
  assert.throws(
    () => loadPasswordConfig({ PASSWORD_PEPPER: 'too-short' }),
    /PASSWORD_PEPPER is required/,
  );
  assert.throws(
    () => loadPasswordConfig({ PASSWORD_PEPPER: '<generate-a-strong-random-secret>' }),
    /PASSWORD_PEPPER is required/,
  );
});

function passwordService() {
  return new PasswordService({ currentPepper });
}
