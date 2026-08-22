import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { CaptchaVerificationService } from '../registration/captcha-verification.service';
import { RegistrationSubmissionService, registrationPublicResult } from '../registration/registration-submission.service';
import { RegistrationSettingsService } from '../registration/registration-settings.service';
import { normalizeEmail, RegistrationCaptchaSettings } from '../registration/registration.types';
import { encryptSecret } from './encrypted-secret';

const originalFetch = globalThis.fetch;
process.env.EMAIL_ENCRYPTION_KEY = 'synthetic-registration-protection-test-key';

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('registration email normalization is trim plus lowercase only', () => {
  assert.equal(normalizeEmail(' User.Name+tag@Example.COM '), 'user.name+tag@example.com');
});

test('Turnstile is verified server-side with a bounded form request', async () => {
  let requestUrl = '';
  let requestBody = '';
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body);
    assert.ok(init?.signal);
    return jsonResponse({ success: true, hostname: 'community.example.test', action: 'register' });
  };

  const result = await new CaptchaVerificationService().verify(
    settings('CLOUDFLARE_TURNSTILE', { hostname: 'community.example.test', action: 'register' }),
    'synthetic-turnstile-token',
    '192.0.2.10',
  );

  assert.equal(result.success, true);
  assert.equal(requestUrl, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.match(requestBody, /response=synthetic-turnstile-token/);
  assert.match(requestBody, /remoteip=192\.0\.2\.10/);
});

test('reCAPTCHA v3 rejects a valid provider response below the configured score', async () => {
  globalThis.fetch = async () => jsonResponse({
    success: true,
    hostname: 'community.example.test',
    action: 'register',
    score: 0.49,
  });

  await assert.rejects(
    new CaptchaVerificationService().verify(
      settings('GOOGLE_RECAPTCHA', {
        variant: 'V3_SCORE',
        hostname: 'community.example.test',
        action: 'register',
        minimumScore: 0.5,
      }),
      'synthetic-recaptcha-token',
    ),
    BadRequestException,
  );
});

test('hCaptcha includes the configured site key and rejects hostname mismatch', async () => {
  let requestBody = '';
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return jsonResponse({ success: true, hostname: 'wrong.example.test' });
  };

  await assert.rejects(
    new CaptchaVerificationService().verify(
      settings('HCAPTCHA', { hostname: 'community.example.test' }),
      'synthetic-hcaptcha-token',
    ),
    BadRequestException,
  );
  assert.match(requestBody, /sitekey=synthetic-site-key/);
});

test('registration migration preserves history and installs the active partial unique index', async () => {
  const migration = await readFile(
    new URL('../../../../prisma/migrations/20260730000000_registration_abuse_protection/migration.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /'SUPERSEDED'/);
  assert.match(migration, /RegistrationApplication_active_email_unique/);
  assert.match(migration, /WHERE "status" IN \('PENDING', 'APPROVED'\)/);
  assert.doesNotMatch(migration, /DELETE FROM "RegistrationApplication"/i);
});

test('first registration creates one normalized pending application and queues acknowledgement', async () => {
  const created: Array<Record<string, unknown>> = [];
  const queued: Array<Record<string, unknown>> = [];
  const tx = registrationTransaction({
    activeApplication: null,
    onCreate: (data) => created.push(data),
  });
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    registrationApplication: { update: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  const service = registrationService(prisma, queued, true);

  const result = await service.submit(
    {
      name: 'Synthetic Applicant',
      email: ' Applicant@Example.TEST ',
      password: 'synthetic-password',
      sex: 'F',
    },
    { communityId: 'community', ipAddress: '192.0.2.5' },
  );

  assert.deepEqual(result, registrationPublicResult);
  assert.equal(created.length, 1);
  assert.equal(created[0].normalizedEmail, 'applicant@example.test');
  assert.equal(created[0].email, 'applicant@example.test');
  assert.equal(created[0].passwordHash, 'synthetic-password-hash');
  assert.equal(queued.length, 1);
  assert.equal(queued[0].category, 'REGISTRATION_ACKNOWLEDGEMENT');
});

test('duplicate pending registration increments metadata, creates no row, and suppresses email inside cooldown', async () => {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const queued: Array<Record<string, unknown>> = [];
  const tx = registrationTransaction({
    activeApplication: pendingApplication(),
    onCreate: (data) => created.push(data),
    onUpdate: (data) => updates.push(data),
  });
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    registrationApplication: {
      update: async (input: { data: Record<string, unknown> }) => {
        updates.push(input.data);
        return pendingApplication();
      },
    },
    auditLog: { create: async () => ({}) },
  };
  const service = registrationService(prisma, queued, false);

  const result = await service.submit(
    {
      name: 'Synthetic Applicant',
      email: 'APPLICANT@example.test',
      password: 'synthetic-password',
      sex: 'M',
    },
    { communityId: 'community', ipAddress: '192.0.2.5' },
  );

  assert.deepEqual(result, registrationPublicResult);
  assert.equal(created.length, 0);
  assert.equal(queued.length, 0);
  assert.ok(updates.some((data) => typeof data.submissionAttemptCount === 'object'));
  assert.ok(updates.some((data) => data.lastNotificationSuppressionReason === 'COMMUNITY_EMAIL_COOLDOWN'));
});

test('registration Redis source hashes identifiers before constructing operational keys', async () => {
  const source = await readFile(new URL('../registration/registration-rate-limit.service.ts', import.meta.url), 'utf8');
  assert.match(source, /createHmac\('sha256'/);
  assert.match(source, /registration:attempt:ip:\$\{communityId\}:\$\{ipHash\}/);
  assert.match(source, /registration:notice:community-email:\$\{communityId\}:\$\{emailHash\}/);
  assert.doesNotMatch(source, /registration:attempt:ip:\$\{communityId\}:\$\{ipAddress\}/);
});

test('public registration security configuration never returns the encrypted secret', async () => {
  const encrypted = encryptSecret('synthetic-secret-key');
  const service = new RegistrationSettingsService({
    community: { findUnique: async () => ({ id: 'community' }) },
    communitySettings: {
      findUnique: async () => ({
        registrationCaptchaEnabled: true,
        registrationCaptchaMode: 'ALWAYS',
        registrationCaptchaProvider: 'CLOUDFLARE_TURNSTILE',
        registrationCaptchaVariant: null,
        registrationCaptchaSiteKey: 'synthetic-site-key',
        registrationCaptchaSecretEncrypted: encrypted,
        registrationCaptchaAction: 'register',
      }),
    },
  } as never);

  const result = await service.publicConfig('community');
  assert.equal(result.captchaRequired, true);
  assert.equal(result.siteKey, 'synthetic-site-key');
  assert.equal('secret' in result, false);
  assert.equal('secretEncrypted' in result, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(encrypted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

function settings(
  provider: RegistrationCaptchaSettings['provider'],
  overrides: Partial<RegistrationCaptchaSettings> = {},
): RegistrationCaptchaSettings {
  return {
    enabled: true,
    mode: 'ALWAYS',
    provider,
    variant: null,
    siteKey: 'synthetic-site-key',
    secretEncrypted: encryptSecret('synthetic-secret-key'),
    hostname: null,
    action: null,
    minimumScore: 0.5,
    ...overrides,
  };
}

function jsonResponse(value: object) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function registrationService(prisma: object, queued: Array<Record<string, unknown>>, noticeAllowed: boolean) {
  return new RegistrationSubmissionService(
    prisma as never,
    { hash: async () => 'synthetic-password-hash' } as never,
    {
      consumeIp: async () => ({ allowed: true, retryAfterSeconds: 900 }),
      reserveNotice: async () => noticeAllowed
        ? ({ allowed: true, retryAfterSeconds: 43_200 })
        : ({ allowed: false, retryAfterSeconds: 43_200, reason: 'COMMUNITY_EMAIL_COOLDOWN' }),
      hashReference: (value: string) => `hash-${value.length}`,
    } as never,
    { verify: async () => ({ success: true, provider: 'DISABLED' }) } as never,
    {
      settings: async () => ({
        registrationIpLimit: 3,
        registrationIpWindowMinutes: 15,
        registrationNotificationCooldownHours: 12,
        registrationGlobalEmailDailyLimit: 2,
      }),
      captchaSettings: async () => settings('DISABLED', { enabled: false, mode: 'DISABLED' }),
    } as never,
    { enqueue: async (data: Record<string, unknown>) => { queued.push(data); return {}; } } as never,
  );
}

function registrationTransaction(input: {
  activeApplication: ReturnType<typeof pendingApplication> | null;
  onCreate?: (data: Record<string, unknown>) => void;
  onUpdate?: (data: Record<string, unknown>) => void;
}) {
  return {
    user: { findFirst: async () => null },
    registrationApplication: {
      findFirst: async () => input.activeApplication,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        input.onCreate?.(data);
        return pendingApplication();
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        input.onUpdate?.(data);
        return pendingApplication();
      },
    },
    communitySettings: {
      findUnique: async () => ({
        adminInAppAlertsEnabled: false,
        registrationReviewAlertsEnabled: false,
      }),
    },
    auditLog: { create: async () => ({}) },
    communityInviteLink: { update: async () => ({}) },
  };
}

function pendingApplication() {
  return {
    id: 'application',
    communityId: 'community',
    inviteLinkId: null,
    email: 'applicant@example.test',
    normalizedEmail: 'applicant@example.test',
    name: 'Synthetic Applicant',
    sex: 'F',
    note: 'Synthetic',
    passwordHash: 'synthetic-password-hash',
    status: 'PENDING' as const,
    submissionAttemptCount: 1,
    lastSubmissionAttemptAt: new Date(0),
    lastReminderQueuedAt: null,
    lastSecurityNoticeQueuedAt: null,
    lastNotificationSuppressedAt: null,
    lastNotificationSuppressionReason: null,
    lastIpHash: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: new Date(0),
  };
}
