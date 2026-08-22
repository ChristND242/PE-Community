import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseOwnerDisableTwoFactorArgs,
  runOwnerDisableTwoFactorCli,
  type OwnerBreakGlassCliIo,
} from '../owner-disable-2fa-cli';
import type { OwnerBreakGlassPreview } from '../owner-break-glass/owner-break-glass-recovery.service';

const preview: OwnerBreakGlassPreview = {
  userId: 'owner-user-id',
  email: 'owner@example.com',
  name: 'Owner',
  communityId: 'community-id',
  communityName: 'Operations',
  membershipId: 'membership-id',
  role: 'owner',
  twoFactorEnabled: true,
  reenrollmentRequired: false,
  activeSessionCount: 2,
  recoveryCodeCount: 5,
  trustedMfaDeviceCount: 0,
};

test('CLI requires one exact valid email and exposes no community or secret argument', () => {
  assert.throws(() => parseOwnerDisableTwoFactorArgs([]), /--email is required/);
  assert.throws(() => parseOwnerDisableTwoFactorArgs(['--email', 'not-an-email']), /valid exact email/);
  assert.throws(() => parseOwnerDisableTwoFactorArgs(['--email', 'one@example.com', '--email', 'two@example.com']), /only once/);
  assert.throws(() => parseOwnerDisableTwoFactorArgs(['--community', 'community-id']), /Unsupported argument: --community/);
  assert.throws(() => parseOwnerDisableTwoFactorArgs(['--secret', 'value']), /secrets are never accepted as arguments/);
  assert.deepEqual(parseOwnerDisableTwoFactorArgs(['--email', ' OWNER@EXAMPLE.COM ', '--dry-run']), {
    email: 'owner@example.com',
    dryRun: true,
  });
});

test('non-interactive execution is rejected before Owner lookup', async () => {
  const harness = cliHarness({ isInteractive: false });
  await assert.rejects(
    runOwnerDisableTwoFactorCli({ args: ['--email', preview.email], io: harness.io, service: harness.service }),
    /must be run interactively/,
  );
  assert.equal(harness.calls.inspect, 0);
  assert.equal(harness.calls.recover, 0);
});

test('dry-run validates and reports without mutation, audit, email, confirmation, or secret prompt', async () => {
  const harness = cliHarness({ prompts: [], hiddenPrompts: [] });
  const result = await runOwnerDisableTwoFactorCli({
    args: ['--email', preview.email, '--dry-run'],
    io: harness.io,
    service: harness.service,
    breakGlassSecret: 'configured-test-secret',
  });

  assert.equal(result.dryRun, true);
  assert.equal(harness.calls.inspect, 1);
  assert.equal(harness.calls.recover, 0);
  assert.equal(harness.calls.failedAudit, 0);
  assert.equal(harness.calls.prompt, 0);
  assert.equal(harness.calls.hiddenPrompt, 0);
  assert.match(harness.output(), /^DRY RUN — no changes will be made/);
  assert.match(harness.output(), /Additional break-glass secret protection: enabled/);
  assert.doesNotMatch(harness.output(), /configured-test-secret/);
});

test('normal recovery works without an optional secret and requires the exact phrase', async () => {
  const harness = cliHarness({ prompts: ['RESET OWNER 2FA'] });
  const result = await runOwnerDisableTwoFactorCli({
    args: ['--email', preview.email],
    io: harness.io,
    service: harness.service,
  });

  assert.equal(result.dryRun, false);
  assert.equal(harness.calls.hiddenPrompt, 0);
  assert.equal(harness.calls.recover, 1);
  assert.match(harness.output(), /New 2FA enrollment required/);
});

test('empty and whitespace-only optional secrets are treated as disabled', async () => {
  for (const breakGlassSecret of ['', '   ']) {
    const harness = cliHarness({ prompts: ['RESET OWNER 2FA'] });
    await runOwnerDisableTwoFactorCli({
      args: ['--email', preview.email],
      io: harness.io,
      service: harness.service,
      breakGlassSecret,
    });
    assert.equal(harness.calls.hiddenPrompt, 0);
    assert.equal(harness.calls.recover, 1);
  }
});

test('wrong confirmation aborts without mutation and records a safe failed attempt', async () => {
  const harness = cliHarness({ prompts: ['yes'] });
  await assert.rejects(
    runOwnerDisableTwoFactorCli({ args: ['--email', preview.email], io: harness.io, service: harness.service }),
    /Confirmation phrase did not match/,
  );
  assert.equal(harness.calls.recover, 0);
  assert.equal(harness.calls.failedAudit, 1);
  assert.deepEqual(harness.failedReasons, ['CONFIRMATION_ABORTED']);
});

test('configured secret is prompted without echo and three failures abort safely', async () => {
  const secret = 'high-entropy-test-only-secret';
  const harness = cliHarness({ hiddenPrompts: ['wrong-one', 'wrong-two', 'wrong-three'] });
  await assert.rejects(
    runOwnerDisableTwoFactorCli({
      args: ['--email', preview.email],
      io: harness.io,
      service: harness.service,
      breakGlassSecret: secret,
    }),
    /secret verification failed/,
  );
  assert.equal(harness.calls.hiddenPrompt, 3);
  assert.equal(harness.calls.recover, 0);
  assert.deepEqual(harness.failedReasons, ['SECRET_VERIFICATION_FAILED']);
  assert.doesNotMatch(harness.output(), new RegExp(secret));
  assert.doesNotMatch(harness.output(), /wrong-one|wrong-two|wrong-three/);
});

test('correct configured secret proceeds without exposing the secret', async () => {
  const secret = 'high-entropy-test-only-secret';
  const harness = cliHarness({ prompts: ['RESET OWNER 2FA'], hiddenPrompts: [secret] });
  await runOwnerDisableTwoFactorCli({
    args: ['--email', preview.email],
    io: harness.io,
    service: harness.service,
    breakGlassSecret: secret,
  });
  assert.equal(harness.calls.hiddenPrompt, 1);
  assert.equal(harness.calls.recover, 1);
  assert.doesNotMatch(harness.output(), new RegExp(secret));
});

function cliHarness(input: { isInteractive?: boolean; prompts?: string[]; hiddenPrompts?: string[] } = {}) {
  const lines: string[] = [];
  const prompts = [...(input.prompts ?? [])];
  const hiddenPrompts = [...(input.hiddenPrompts ?? [])];
  const failedReasons: string[] = [];
  const calls = { inspect: 0, recover: 0, failedAudit: 0, prompt: 0, hiddenPrompt: 0 };
  const io: OwnerBreakGlassCliIo = {
    isInteractive: input.isInteractive ?? true,
    write(message) { lines.push(message); },
    async prompt() { calls.prompt += 1; return prompts.shift() ?? ''; },
    async promptHidden() { calls.hiddenPrompt += 1; return hiddenPrompts.shift() ?? ''; },
  };
  const service = {
    async inspect() { calls.inspect += 1; return preview; },
    async recover() {
      calls.recover += 1;
      return { ...preview, auditLogId: 'audit-id', revokedSessionCount: 2, revokedRecoveryCodeCount: 5, notificationQueued: true };
    },
    async recordFailedAttempt(_preview: OwnerBreakGlassPreview, reason: string) {
      calls.failedAudit += 1;
      failedReasons.push(reason);
    },
  };
  return { io, service, calls, failedReasons, output: () => lines.join('') };
}
