import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  createEmailVerificationAttemptCoordinator,
  getEmailVerificationPageState,
  shouldConsumeEmailVerificationToken,
} from './lib/email-verification-attempt';

test('verification remounts share one consuming request while later reuse remains invalid', async () => {
  const attempts = createEmailVerificationAttemptCoordinator();
  let requestCount = 0;
  let resolveVerification!: (result: { role: string }) => void;
  const verification = new Promise<{ role: string }>((resolve) => {
    resolveVerification = resolve;
  });
  const verify = () => {
    requestCount += 1;
    return verification;
  };

  const firstMount = attempts.run('single-use-token', verify);
  const remount = attempts.run('single-use-token', verify);
  assert.equal(requestCount, 1);
  resolveVerification({ role: 'member' });
  assert.deepEqual(await firstMount, { role: 'member' });
  assert.deepEqual(await remount, { role: 'member' });
  assert.deepEqual(await attempts.run('single-use-token', verify), { role: 'member' });
  assert.equal(requestCount, 1);

  attempts.release('single-use-token');
  await assert.rejects(() => attempts.run('single-use-token', async () => {
    requestCount += 1;
    throw new Error('Invalid or expired verification link.');
  }));
  attempts.release('single-use-token');
  assert.equal(requestCount, 2);
});

test('clean verification result URLs do not consume the token again on refresh', () => {
  assert.equal(getEmailVerificationPageState('success', null), 'success');
  assert.equal(shouldConsumeEmailVerificationToken('success', null), false);
  assert.equal(getEmailVerificationPageState('error', null), 'error');
  assert.equal(shouldConsumeEmailVerificationToken('error', null), false);
  assert.equal(getEmailVerificationPageState(null, 'unused-token'), 'verifying');
  assert.equal(shouldConsumeEmailVerificationToken(null, 'unused-token'), true);
});

test('verification page consumes through the coordinator and replaces the token URL', async () => {
  const page = await readFile(new URL('./app/verify-email/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /emailVerificationAttempts\.run\(token/);
  assert.match(page, /router\.replace\(`\/verify-email\?status=success/);
  assert.match(page, /router\.replace\('\/verify-email\?status=error'/);
  assert.match(page, /emailVerificationAttempts\.release\(token\)/);
  assert.doesNotMatch(page, /router\.replace\([^\n]*token/);
  assert.match(page, /apiFetch<\{ role: string; emailVerified: boolean \}>\('\/auth\/me'\)/);
});

test('unverified reminder uses a viewport overlay above the application shell', async () => {
  const [dialog, shell, profile] = await Promise.all([
    readFile(new URL('./components/ui.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./components/shell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./components/profile-account-security.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(dialog, /data-confirm-dialog-root className="fixed inset-0 z-\[80\] grid h-dvh place-items-center/);
  assert.match(dialog, /data-confirm-dialog-overlay[\s\S]*fixed inset-0 z-0/);
  assert.match(dialog, /createPortal\([\s\S]*document\.body/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /relative z-10 w-full max-w-md/);
  assert.match(shell, /overlayClassName="bg-black\/\[0\.42\] backdrop-blur-sm dark:bg-black\/\[0\.72\]"/);
  assert.match(shell, /cancelLabel=\{t\.security\.later\}/);
  assert.match(shell, /confirmLabel=\{t\.security\.verifyNow\}/);
  assert.match(shell, /user\.emailVerified\) \{\s*setEmailVerificationWarningOpen\(false\)/);
  assert.match(profile, /status\.emailVerified \? t\.security\.emailVerified : t\.security\.emailNotVerified/);
  assert.match(profile, /!status\.emailVerified &&/);
});
