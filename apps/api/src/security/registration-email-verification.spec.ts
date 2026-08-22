import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validate } from 'class-validator';
import { BUILT_IN_EMAIL_TEMPLATES, renderTemplateEmail } from '@pe/shared';
import { RegisterDto } from '../auth/register.dto';
import { EMAIL_CHANGE_EXPIRES_MINUTES, EmailChangeService, hashEmailChangeToken } from '../auth/email-change.service';
import { REGISTRATION_REQUEST_NOTE_MAX_LENGTH } from '../registration/registration.types';

test('registration request note accepts the maximum and rejects longer input', async () => {
  const valid = registrationDto('a'.repeat(REGISTRATION_REQUEST_NOTE_MAX_LENGTH));
  const invalid = registrationDto('a'.repeat(REGISTRATION_REQUEST_NOTE_MAX_LENGTH + 1));
  assert.equal((await validate(valid)).length, 0);
  assert.equal((await validate(invalid)).some((error) => Boolean(error.constraints?.maxLength)), true);
});

test('registration UI mirrors the server limit and keeps long admin notes expandable', async () => {
  const [registrationPage, captcha, adminPage, translations] = await Promise.all([
    readFile(new URL('../../../web/app/register/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/components/registration-captcha.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/app/admin/registrations/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/lib/i18n.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(captcha, /requestNoteMaxLength: number/);
  assert.match(registrationPage, /maxLength=\{noteMaxLength\}/);
  assert.match(registrationPage, /noteCharacterCount\(note\.length, noteMaxLength\)/);
  assert.match(adminPage, /line-clamp-4/);
  assert.match(adminPage, /scrollHeight > element\.clientHeight/);
  assert.match(adminPage, /expanded \? lessLabel : moreLabel/);
  assert.match(translations, /requestNoteMore: 'More…'/);
  assert.match(translations, /requestNoteMore: 'Plus…'/);
});

test('approval verification uses one hashed, expiring, single-use canonical token', async () => {
  const { service, state } = verificationHarness();
  const queued = await service.queueRegistrationApproval('community-1', state.user);
  assert.equal(queued.verificationRequired, true);
  assert.equal(state.user.emailVerifiedAt, null);
  assert.equal(state.approvalTokens.length, 1);
  assert.equal(state.requests[0]?.tokenHash, hashEmailChangeToken(state.approvalTokens[0]!));
  assert.equal(state.requests[0]?.expiresAt.getTime() > Date.now(), true);
  assert.doesNotMatch(JSON.stringify(state.audits), new RegExp(state.approvalTokens[0]!));

  const result = await service.verifyPrimary(state.approvalTokens[0]);
  assert.deepEqual(result, { ok: true, role: 'member' });
  assert.ok(state.user.emailVerifiedAt);
  assert.ok(state.requests[0]?.verifiedAt);
  await assert.rejects(() => service.verifyPrimary(state.approvalTokens[0]));
});

test('approval verification rejects expired, revoked, and invalid tokens without verifying the user', async () => {
  assert.equal(EMAIL_CHANGE_EXPIRES_MINUTES, 45);

  const expired = verificationHarness();
  await expired.service.queueRegistrationApproval('community-1', expired.state.user);
  expired.state.requests[0]!.expiresAt = new Date(Date.now() - 1);
  await assert.rejects(() => expired.service.verifyPrimary(expired.state.approvalTokens[0]));
  assert.equal(expired.state.user.emailVerifiedAt, null);
  assert.equal(expired.state.requests[0]!.verifiedAt, null);

  const revoked = verificationHarness();
  await revoked.service.queueRegistrationApproval('community-1', revoked.state.user);
  revoked.state.requests[0]!.cancelledAt = new Date();
  await assert.rejects(() => revoked.service.verifyPrimary(revoked.state.approvalTokens[0]));
  assert.equal(revoked.state.user.emailVerifiedAt, null);
  assert.equal(revoked.state.requests[0]!.verifiedAt, null);

  const invalid = verificationHarness();
  await assert.rejects(() => invalid.service.verifyPrimary('unknown-token'));
  assert.equal(invalid.state.user.emailVerifiedAt, null);
  assert.equal(invalid.state.requests.length, 0);
});

test('approval email omits a verification token for an already verified account', async () => {
  const { service, state } = verificationHarness();
  state.user.emailVerifiedAt = new Date();
  const result = await service.queueRegistrationApproval('community-1', state.user);
  assert.equal(result.verificationRequired, false);
  assert.deepEqual(state.approvalTokens, [null]);
  assert.equal(state.requests.length, 0);
});

test('approval templates provide localized verification actions through the shared renderer', () => {
  for (const locale of ['en', 'fr'] as const) {
    const verificationUrl = 'https://community.example.test/verify-email?token=redacted-test-token';
    const rendered = renderTemplateEmail(
      BUILT_IN_EMAIL_TEMPLATES.REGISTRATION_APPROVED[locale],
      { communityName: 'PE Community', recipientName: 'Member', expiresInMinutes: 45 },
      { communityName: 'PE Community', actionUrl: verificationUrl },
    );
    assert.match(rendered.html, /href="https:\/\/community\.example\.test\/verify-email\?token=redacted-test-token"/);
    assert.match(rendered.text, /verify-email\?token=redacted-test-token/);
    assert.match(rendered.text, /45/);
  }
});

test('unverified warning and verification actions are session-scoped and motion-safe', async () => {
  const [shell, profile, styles, identity, translations] = await Promise.all([
    readFile(new URL('../../../web/components/shell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/components/profile-account-security.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/app/globals.css', import.meta.url), 'utf8'),
    readFile(new URL('../auth/auth.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/lib/i18n.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(identity, /sessionId: session\.id/);
  assert.match(identity, /emailVerified: Boolean\(session\.user\.emailVerifiedAt\)/);
  assert.match(shell, /emailVerificationWarningKey\(user\.id, user\.sessionId\)/);
  assert.match(shell, /\/dashboard\/profile\?tab=email/);
  assert.match(shell, /confirmClassName="verification-heartbeat/);
  assert.match(profile, /\/auth\/email-verification\/send/);
  assert.match(profile, /className="verification-heartbeat/);
  assert.match(profile, /disabled=\{Boolean\(busy\)\}/);
  assert.match(styles, /\.verification-heartbeat:not\(:disabled\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(translations, /verifyNow: 'Verify now'/);
  assert.match(translations, /verifyNow: 'Vérifier maintenant'/);
});

function registrationDto(note: string) {
  return Object.assign(new RegisterDto(), {
    name: 'Audit Applicant',
    email: 'audit@example.test',
    password: 'Audit-password-123',
    sex: 'F' as const,
    note,
  });
}

function verificationHarness() {
  type Request = {
    id: string;
    userId: string;
    currentEmail: string;
    normalizedNewEmail: string;
    tokenHash: string;
    expiresAt: Date;
    verifiedAt: Date | null;
    cancelledAt: Date | null;
    activeUserId: string | null;
    activeNewEmail: string | null;
  };
  const state = {
    user: { id: 'user-1', email: 'member@example.test', name: 'Member', emailVerifiedAt: null as Date | null },
    requests: [] as Request[],
    approvalTokens: [] as Array<string | null>,
    audits: [] as Array<Record<string, unknown>>,
  };
  const prisma = {
    emailChangeRequest: {
      updateMany: async ({ where, data }: { where: { id?: string; userId?: string }; data: Partial<Request> }) => {
        const matches = state.requests.filter((request) => (
          (!where.id || request.id === where.id)
          && (!where.userId || request.userId === where.userId)
          && request.verifiedAt === null
          && request.cancelledAt === null
        ));
        for (const request of matches) Object.assign(request, data);
        return { count: matches.length };
      },
      create: async ({ data }: { data: Omit<Request, 'id' | 'verifiedAt' | 'cancelledAt' | 'activeNewEmail'> }) => {
        const request: Request = { id: `request-${state.requests.length + 1}`, verifiedAt: null, cancelledAt: null, activeNewEmail: null, ...data };
        state.requests.push(request);
        return request;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const request = state.requests.find((item) => item.tokenHash === where.tokenHash);
        return request ? { ...request, user: { ...state.user, memberships: [{ communityId: 'community-1', role: { key: 'member' } }] } } : null;
      },
    },
    user: {
      update: async ({ data }: { data: { emailVerifiedAt: Date } }) => {
        state.user.emailVerifiedAt = data.emailVerifiedAt;
        return state.user;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.audits.push(data);
        return data;
      },
    },
    $transaction: async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
  };
  const service = new EmailChangeService(
    prisma as never,
    {} as never,
    {
      queueRegistrationApprovedEmail: async (_communityId: string, _user: unknown, token: string | null) => {
        state.approvalTokens.push(token);
      },
    } as never,
    {} as never,
  );
  return { service, state };
}
