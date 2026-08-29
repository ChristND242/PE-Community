import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PasskeyController } from '../auth/passkey.controller';
import { PASSKEY_CHALLENGE_TTL_SECONDS, PasskeyChallengeService } from '../auth/passkey-challenge.service';
import { assertPasskeyRequestOrigin, loadPasskeyConfig } from '../auth/passkey-config';

const authDirectory = new URL('../auth/', import.meta.url);
const schemaUrl = new URL('../../../../prisma/schema.prisma', import.meta.url);
const migrationUrl = new URL('../../../../prisma/migrations/20260829000000_passkeys_phase_1/migration.sql', import.meta.url);

class MemoryRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();

  async set(key: string, value: string, mode: string, ttl: number, condition: string) {
    assert.equal(mode, 'EX');
    assert.equal(condition, 'NX');
    if (this.values.has(key)) return null;
    this.values.set(key, value);
    this.expirations.set(key, ttl);
    return 'OK';
  }

  async eval(script: string, _keyCount: number, key: string, ...args: string[]) {
    if (script.includes("redis.call('GET'")) {
      const value = this.values.get(key) ?? null;
      this.values.delete(key);
      this.expirations.delete(key);
      return value;
    }
    if (script.includes("redis.call('INCR'")) {
      const current = Number(this.values.get(key) ?? '0') + 1;
      this.values.set(key, String(current));
      this.expirations.set(key, Number(args[0]));
      return [current, Number(args[0])];
    }
    throw new Error('Unexpected script');
  }

  async quit() { return 'OK'; }
  disconnect() {}
}

test('registration challenges have a five-minute TTL and are atomically single-use', async () => {
  const redis = new MemoryRedis();
  const service = new PasskeyChallengeService(redis as never);
  const attemptId = await service.createRegistrationAttempt({
    challenge: 'audit-challenge',
    userId: 'user-a',
    sessionId: 'session-a',
    webauthnUserId: 'opaque-user-handle',
  });

  assert.equal([...redis.expirations.values()][0], PASSKEY_CHALLENGE_TTL_SECONDS);
  assert.equal(PASSKEY_CHALLENGE_TTL_SECONDS, 300);
  assert.equal((await service.consumeRegistrationAttempt(attemptId, 'user-a', 'session-a'))?.challenge, 'audit-challenge');
  assert.equal(await service.consumeRegistrationAttempt(attemptId, 'user-a', 'session-a'), null);
});

test('a challenge bound to another user or session is rejected and consumed', async () => {
  const redis = new MemoryRedis();
  const service = new PasskeyChallengeService(redis as never);
  const attemptId = await service.createRegistrationAttempt({
    challenge: 'bound-challenge',
    userId: 'user-a',
    sessionId: 'session-a',
    webauthnUserId: 'opaque-user-handle',
  });

  assert.equal(await service.consumeRegistrationAttempt(attemptId, 'user-b', 'session-a'), null);
  assert.equal(await service.consumeRegistrationAttempt(attemptId, 'user-a', 'session-a'), null);
});

test('authentication challenges are anonymous, ceremony-bound, and atomically single-use', async () => {
  const redis = new MemoryRedis();
  const service = new PasskeyChallengeService(redis as never);
  const attemptId = await service.createAuthenticationAttempt('authentication-challenge');

  assert.equal([...redis.expirations.values()][0], PASSKEY_CHALLENGE_TTL_SECONDS);
  const consumed = await Promise.all([
    service.consumeAuthenticationAttempt(attemptId),
    service.consumeAuthenticationAttempt(attemptId),
  ]);
  assert.equal(consumed.filter(Boolean).length, 1);
  assert.equal(consumed.find(Boolean)?.challenge, 'authentication-challenge');
});

test('expired or missing challenges are rejected', async () => {
  const redis = new MemoryRedis();
  const service = new PasskeyChallengeService(redis as never);
  const attemptId = await service.createRegistrationAttempt({
    challenge: 'expired-challenge',
    userId: 'user-a',
    sessionId: 'session-a',
    webauthnUserId: 'opaque-user-handle',
  });
  redis.values.clear();

  assert.equal(await service.consumeRegistrationAttempt(attemptId, 'user-a', 'session-a'), null);
});

test('trusted WebAuthn configuration is exact and rejects wrong origin or RP ID', () => {
  const config = loadPasskeyConfig({
    WEBAUTHN_RP_NAME: 'PE Community',
    WEBAUTHN_RP_ID: 'community.example.com',
    WEBAUTHN_ORIGIN: 'https://community.example.com',
  });
  assert.deepEqual(config, {
    rpName: 'PE Community',
    rpID: 'community.example.com',
    origin: 'https://community.example.com',
  });
  assert.doesNotThrow(() => assertPasskeyRequestOrigin('https://community.example.com', config));
  assert.throws(() => assertPasskeyRequestOrigin('https://evil.example.com', config));
  assert.throws(() => loadPasskeyConfig({
    WEBAUTHN_RP_NAME: 'PE Community',
    WEBAUTHN_RP_ID: 'wrong.example.com',
    WEBAUTHN_ORIGIN: 'https://community.example.com',
  }));
});

test('SimpleWebAuthn rejects a wrong challenge and wrong origin before credential storage', async () => {
  const challenge = 'expected-registration-challenge';
  const baseResponse = {
    id: 'AA',
    rawId: 'AA',
    type: 'public-key',
    clientExtensionResults: {},
    response: { attestationObject: 'AA', clientDataJSON: '' },
  } satisfies RegistrationResponseJSON;
  const clientData = (responseChallenge: string, origin: string) => Buffer.from(JSON.stringify({
    type: 'webauthn.create',
    challenge: responseChallenge,
    origin,
  })).toString('base64url');

  await assert.rejects(verifyRegistrationResponse({
    response: { ...baseResponse, response: { ...baseResponse.response, clientDataJSON: clientData('wrong-challenge', 'https://community.example.com') } },
    expectedChallenge: challenge,
    expectedOrigin: 'https://community.example.com',
    expectedRPID: 'community.example.com',
    requireUserVerification: true,
  }));
  await assert.rejects(verifyRegistrationResponse({
    response: { ...baseResponse, response: { ...baseResponse.response, clientDataJSON: clientData(challenge, 'https://evil.example.com') } },
    expectedChallenge: challenge,
    expectedOrigin: 'https://community.example.com',
    expectedRPID: 'community.example.com',
    requireUserVerification: true,
  }));
});

test('SimpleWebAuthn authentication rejects wrong challenge and origin', async () => {
  const authenticatorData = Buffer.concat([Buffer.alloc(32), Buffer.from([0x05]), Buffer.alloc(4)]).toString('base64url');
  const response = (challenge: string, origin: string): AuthenticationResponseJSON => ({
    id: 'AA',
    rawId: 'AA',
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      authenticatorData,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin })).toString('base64url'),
      signature: 'AA',
      userHandle: 'dXNlci1h',
    },
  });
  const credential = { id: 'AA', publicKey: new Uint8Array([0xa0]), counter: 0 };

  await assert.rejects(verifyAuthenticationResponse({
    response: response('wrong-challenge', 'https://community.example.com'),
    expectedChallenge: 'expected-challenge',
    expectedOrigin: 'https://community.example.com',
    expectedRPID: 'community.example.com',
    credential,
    requireUserVerification: true,
  }));
  await assert.rejects(verifyAuthenticationResponse({
    response: response('expected-challenge', 'https://evil.example.com'),
    expectedChallenge: 'expected-challenge',
    expectedOrigin: 'https://community.example.com',
    expectedRPID: 'community.example.com',
    credential,
    requireUserVerification: true,
  }));
});

test('a valid UV assertion verifies, advances its counter, and rejects tampering or missing UV', async () => {
  const rpID = 'community.example.com';
  const origin = 'https://community.example.com';
  const challenge = 'authentication-challenge';
  const credentialID = 'Y3JlZGVudGlhbC1h';
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  assert.ok(jwk.x && jwk.y);
  const publicKeyCose = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
  const authenticatorData = Buffer.concat([
    createHash('sha256').update(rpID).digest(),
    Buffer.from([0x05]),
    Buffer.from([0, 0, 0, 1]),
  ]);
  const signature = sign('sha256', Buffer.concat([
    authenticatorData,
    createHash('sha256').update(clientDataJSON).digest(),
  ]), privateKey);
  const response: AuthenticationResponseJSON = {
    id: credentialID,
    rawId: credentialID,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      authenticatorData: authenticatorData.toString('base64url'),
      clientDataJSON: clientDataJSON.toString('base64url'),
      signature: signature.toString('base64url'),
      userHandle: 'dXNlci1h',
    },
  };
  const credential = { id: credentialID, publicKey: new Uint8Array(publicKeyCose), counter: 0 };
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: true,
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.authenticationInfo.userVerified, true);
  assert.equal(verified.authenticationInfo.newCounter, 1);

  await assert.rejects(verifyAuthenticationResponse({
    response: { ...response, response: { ...response.response, signature: Buffer.from('tampered').toString('base64url') } },
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: true,
  }));
  const noUvAuthenticatorData = Buffer.from(authenticatorData);
  noUvAuthenticatorData[32] = 0x01;
  const noUvSignature = sign('sha256', Buffer.concat([
    noUvAuthenticatorData,
    createHash('sha256').update(clientDataJSON).digest(),
  ]), privateKey);
  await assert.rejects(verifyAuthenticationResponse({
    response: {
      ...response,
      response: {
        ...response.response,
        authenticatorData: noUvAuthenticatorData.toString('base64url'),
        signature: noUvSignature.toString('base64url'),
      },
    },
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: true,
  }));
});

test('registration endpoints deny unauthenticated requests before ceremony work', async () => {
  const auth = {
    cookieName: 'pe_session',
    userFromCookie: async () => { throw new UnauthorizedException('Authentication required.'); },
  };
  const controller = new PasskeyController(auth as never, {} as never, {} as never);
  const request = { cookies: {}, get: () => 'https://community.example.com' };
  const response = { setHeader: () => undefined };

  await assert.rejects(controller.registrationOptions(request as never, response as never), UnauthorizedException);
  await assert.rejects(controller.registrationVerify(request as never, response as never, {}), UnauthorizedException);
});

test('registration verification delegates challenge, exact origin, RP ID, and user verification to SimpleWebAuthn', async () => {
  const source = await readFile(new URL('passkey.service.ts', authDirectory), 'utf8');
  assert.match(source, /expectedChallenge: attempt\.challenge/);
  assert.match(source, /expectedOrigin: config\.origin/);
  assert.match(source, /expectedRPID: config\.rpID/);
  assert.match(source, /requireUserVerification: true/);
  assert.match(source, /consumeRegistrationAttempt\(attemptId, user\.id, user\.sessionId\)/);
  assert.doesNotMatch(source, /input\.(?:userId|email|role)/);
});

test('authentication is discoverable, credential-derived, UV-required, and enumeration-resistant', async () => {
  const source = await readFile(new URL('passkey.service.ts', authDirectory), 'utf8');
  const optionsBlock = source.slice(source.indexOf('async authenticationOptions('), source.indexOf('async verifyAuthentication('));
  const verifyBlock = source.slice(source.indexOf('async verifyAuthentication('), source.indexOf('async stepUpOptions('));
  const sharedVerificationBlock = source.slice(source.indexOf('private async verifyAuthenticationCredential('), source.indexOf('private async recordAuthenticationFailure('));

  assert.match(optionsBlock, /generateAuthenticationOptions/);
  assert.match(optionsBlock, /userVerification: 'required'/);
  assert.doesNotMatch(optionsBlock, /allowCredentials|userId|email/);
  assert.match(sharedVerificationBlock, /where: \{ credentialId: response\.id \}/);
  assert.match(sharedVerificationBlock, /credential\.revokedAt/);
  assert.match(sharedVerificationBlock, /memberships\.length === 0/);
  assert.match(sharedVerificationBlock, /twoFactorReenrollmentRequired/);
  assert.match(verifyBlock, /attempt\.challenge/);
  assert.match(sharedVerificationBlock, /expectedOrigin: config\.origin/);
  assert.match(sharedVerificationBlock, /expectedRPID: config\.rpID/);
  assert.match(sharedVerificationBlock, /requireUserVerification: true/);
  assert.match(sharedVerificationBlock, /sameUserHandle/);
  assert.match(sharedVerificationBlock, /counter: credential\.counter/);
  assert.match(verifyBlock, /createPasskeySession\(credential\.userId, requestContext\)/);
  assert.doesNotMatch(verifyBlock, /input\.(?:userId|email|role)/);
});

test('authentication controller reuses the canonical cookie and audit request helpers', async () => {
  const [controller, authController] = await Promise.all([
    readFile(new URL('passkey.controller.ts', authDirectory), 'utf8'),
    readFile(new URL('auth-http.ts', authDirectory), 'utf8'),
  ]);
  assert.match(controller, /@Post\('authentication\/options'\)/);
  assert.match(controller, /@Post\('authentication\/verify'\)/);
  assert.match(controller, /sessionCookieOptions\(\)/);
  assert.match(controller, /auditRequestContext\(req\)/);
  assert.match(authController, /httpOnly: true/);
  assert.match(authController, /sameSite: 'lax'/);
});

test('registration options are discoverable and exclude all existing credential IDs', async () => {
  const source = await readFile(new URL('passkey.service.ts', authDirectory), 'utf8');
  assert.match(source, /residentKey: 'required'/);
  assert.match(source, /requireResidentKey: true/);
  assert.match(source, /attestationType: 'none'/);
  assert.match(source, /excludeCredentials: credentials\.map/);
  assert.match(source, /userID: Buffer\.from\(account\.id, 'utf8'\)/);
});

test('credential ownership, duplicate defense, safe listing, and verified-only storage are explicit', async () => {
  const source = await readFile(new URL('passkey.service.ts', authDirectory), 'utf8');
  const listBlock = source.slice(source.indexOf('async list('), source.indexOf('async authenticationOptions('));
  const verifiedStorage = source.slice(source.indexOf('if (!verification.verified'), source.indexOf('async rename('));
  assert.match(source, /credentialId: credential\.id/);
  assert.match(source, /findUnique\(\{\s*where: \{ credentialId: credential\.id \}/s);
  assert.match(source, /error\.code === 'P2002'/);
  assert.match(source, /where: \{ id, userId, revokedAt: null \}/);
  assert.doesNotMatch(listBlock, /publicKey|counter|credentialId|webauthnUserId/);
  assert.match(verifiedStorage, /passkeyCredential\.create/);
  assert.doesNotMatch(source, /privateKey/);
});

test('schema and migration are additive and retain only future-verification credential material', async () => {
  const [schema, migration] = await Promise.all([readFile(schemaUrl, 'utf8'), readFile(migrationUrl, 'utf8')]);
  assert.match(schema, /model PasskeyCredential/);
  assert.match(schema, /credentialId\s+String\s+@unique/);
  assert.match(schema, /publicKey\s+Bytes/);
  assert.match(schema, /counter\s+BigInt/);
  assert.match(schema, /@@index\(\[userId\]\)/);
  assert.doesNotMatch(schema.slice(schema.indexOf('model PasskeyCredential'), schema.indexOf('model Organization')), /privateKey|challenge/);
  assert.match(migration, /CREATE TABLE "PasskeyCredential"/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE)\b/i);
});

test('audit metadata sanitization explicitly drops WebAuthn ceremony material', async () => {
  const source = await readFile(new URL('../audit/audit-log.service.ts', import.meta.url), 'utf8');
  assert.match(source, /clientdatajson/);
  assert.match(source, /authenticatordata/);
  assert.match(source, /attestationobject/);
  assert.match(source, /webauthn\.\*response/);
});
