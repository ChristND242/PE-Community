import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'crypto';
import { createInterface } from 'readline/promises';
import { Writable } from 'stream';
import { AppModule } from './app.module';
import {
  OwnerBreakGlassPreview,
  OwnerBreakGlassRecoveryError,
  OwnerBreakGlassRecoveryService,
} from './owner-break-glass/owner-break-glass-recovery.service';

export type OwnerDisableTwoFactorOptions = { email: string; dryRun: boolean };

export type OwnerBreakGlassCliIo = {
  isInteractive: boolean;
  write(message: string): void;
  prompt(message: string): Promise<string>;
  promptHidden(message: string): Promise<string>;
};

type RecoveryService = Pick<OwnerBreakGlassRecoveryService, 'inspect' | 'recover' | 'recordFailedAttempt'>;

export function parseOwnerDisableTwoFactorArgs(args: string[]): OwnerDisableTwoFactorOptions {
  let email: string | undefined;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      if (dryRun) throw new OwnerBreakGlassRecoveryError('--dry-run may be provided only once.');
      dryRun = true;
      continue;
    }
    if (argument === '--email') {
      if (email !== undefined) throw new OwnerBreakGlassRecoveryError('--email may be provided only once.');
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new OwnerBreakGlassRecoveryError('--email requires an exact email address.');
      email = value.trim().toLowerCase();
      index += 1;
      continue;
    }
    throw new OwnerBreakGlassRecoveryError(`Unsupported argument: ${safeArgumentName(argument)}`);
  }
  if (!email) throw new OwnerBreakGlassRecoveryError('--email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OwnerBreakGlassRecoveryError('--email must be a valid exact email address.');
  return { email, dryRun };
}

export async function runOwnerDisableTwoFactorCli(input: {
  args: string[];
  io: OwnerBreakGlassCliIo;
  service: RecoveryService;
  breakGlassSecret?: string;
}) {
  if (!input.io.isInteractive) throw new OwnerBreakGlassRecoveryError('Owner 2FA break-glass recovery must be run interactively from the server.');
  const options = parseOwnerDisableTwoFactorArgs(input.args);
  const preview = await input.service.inspect(options.email);
  const configuredSecret = input.breakGlassSecret?.trim() ?? '';

  if (options.dryRun) {
    input.io.write('DRY RUN — no changes will be made\n\n');
    writePreview(input.io, preview, configuredSecret.length > 0);
    return { dryRun: true as const, preview };
  }

  if (configuredSecret) {
    let verified = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const submitted = await input.io.promptHidden('Break-glass secret: ');
      if (secureSecretMatches(configuredSecret, submitted)) {
        verified = true;
        break;
      }
      input.io.write('Break-glass secret was not accepted.\n');
    }
    if (!verified) {
      await input.service.recordFailedAttempt(preview, 'SECRET_VERIFICATION_FAILED');
      throw new OwnerBreakGlassRecoveryError('Break-glass secret verification failed.');
    }
  }

  writePreview(input.io, preview, configuredSecret.length > 0);
  const confirmation = await input.io.prompt('Type RESET OWNER 2FA to continue: ');
  if (confirmation !== 'RESET OWNER 2FA') {
    await input.service.recordFailedAttempt(preview, 'CONFIRMATION_ABORTED');
    throw new OwnerBreakGlassRecoveryError('Confirmation phrase did not match.');
  }

  const result = await input.service.recover(options.email);
  input.io.write('\nOwner 2FA break-glass recovery completed.\n\n');
  input.io.write(`Account: ${result.email}\nCommunity: ${result.communityName}\n\nCompleted:\n`);
  input.io.write('✓ Existing 2FA enrollment reset\n✓ Recovery codes invalidated\n✓ Active sessions revoked\n✓ New 2FA enrollment required\n✓ Security audit event recorded\n');
  input.io.write('Trusted MFA devices: not implemented by this platform; chat encryption devices were unchanged.\n\n');
  input.io.write(result.notificationQueued
    ? 'Security notification: ✓ Queued\n'
    : `Security notification: ! ${result.notificationWarning ?? 'Could not be queued.'}\n`);
  input.io.write('\nThe Owner must sign in with their password and configure a new 2FA factor before privileged access is restored.\n');
  input.io.write(`[SECURITY] Owner MFA break-glass recovery completed owner=${result.userId} timestamp=${new Date().toISOString()} audit=${result.auditLogId}\n`);
  return { dryRun: false as const, result };
}

export function secureSecretMatches(expected: string, submitted: string) {
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  const submittedDigest = createHash('sha256').update(submitted, 'utf8').digest();
  return timingSafeEqual(expectedDigest, submittedDigest);
}

function writePreview(io: OwnerBreakGlassCliIo, preview: OwnerBreakGlassPreview, secretProtectionEnabled: boolean) {
  io.write('OWNER 2FA BREAK-GLASS RECOVERY\n\n');
  io.write(`Account: ${preview.email}\nUser ID: ${preview.userId}\nCommunity: ${preview.communityName}\nRole: Owner\n`);
  io.write(`2FA status: ${preview.reenrollmentRequired ? 'Awaiting re-enrollment' : preview.twoFactorEnabled ? 'Enabled' : 'Enrollment present'}\n`);
  io.write(`Active sessions: ${preview.activeSessionCount}\nTrusted MFA devices: ${preview.trustedMfaDeviceCount} (not implemented)\nRecovery codes: ${preview.recoveryCodeCount}\n`);
  io.write(`Additional break-glass secret protection: ${secretProtectionEnabled ? 'enabled' : 'disabled'}\n\n`);
  io.write('This operation will:\n- reset the current 2FA enrollment;\n- invalidate existing recovery codes;\n- revoke all active sessions;\n- require the Owner to configure 2FA again;\n- record a high-severity security audit event.\n\n');
  io.write('No password, email, role, membership, profile, or chat-encryption data will be changed.\n\n');
}

function safeArgumentName(argument: string) {
  if (argument.startsWith('--secret')) return '--secret (secrets are never accepted as arguments)';
  return argument.slice(0, 80);
}

function terminalIo(): OwnerBreakGlassCliIo & { close(): void } {
  const output = new MutedOutput();
  const terminal = createInterface({ input: process.stdin, output, terminal: true });
  return {
    isInteractive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    write: (message) => process.stdout.write(message),
    prompt: (message) => terminal.question(message),
    promptHidden: async (message) => {
      process.stdout.write(message);
      output.muted = true;
      try {
        return await terminal.question('');
      } finally {
        output.muted = false;
        process.stdout.write('\n');
      }
    },
    close: () => terminal.close(),
  };
}

class MutedOutput extends Writable {
  muted = false;

  _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  }
}

async function main() {
  const io = terminalIo();
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;
  try {
    if (!io.isInteractive) throw new OwnerBreakGlassRecoveryError('Owner 2FA break-glass recovery must be run interactively from the server.');
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    await runOwnerDisableTwoFactorCli({
      args: process.argv.slice(2),
      io,
      service: app.get(OwnerBreakGlassRecoveryService),
      breakGlassSecret: process.env.OWNER_BREAK_GLASS_SECRET,
    });
  } catch (error) {
    const message = error instanceof OwnerBreakGlassRecoveryError ? error.message : 'Owner 2FA recovery failed safely.';
    process.stderr.write(`Owner 2FA break-glass recovery aborted.\n${message}\n`);
    process.exitCode = 1;
  } finally {
    io.close();
    await app?.close();
  }
}

if (require.main === module) void main();
