import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';

export const PASSWORD_CONFIG = Symbol('PASSWORD_CONFIG');
export const PASSWORD_HASH_ENVELOPE = 'v2:argon2id-hmac-sha256:';
export const MAX_PASSWORD_BYTES = 4096;
const passwordPepperPlaceholder = '<generate-a-strong-random-secret>';

export const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  version: 0x13,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export type PasswordHashFormat = 'ARGON2ID_V2' | 'BCRYPT_LEGACY' | 'UNKNOWN';

export type PasswordVerificationResult = {
  valid: boolean;
  needsRehash: boolean;
  upgradedHash?: string;
};

export type PasswordConfig = {
  currentPepper: string;
  previousPepper?: string;
};

@Injectable()
export class PasswordService {
  constructor(@Inject(PASSWORD_CONFIG) private readonly config: PasswordConfig) {}

  async hash(password: string): Promise<string> {
    assertPasswordSize(password);
    const encodedHash = await argon2.hash(preprocessPassword(password, this.config.currentPepper), ARGON2ID_OPTIONS);
    return `${PASSWORD_HASH_ENVELOPE}${encodedHash}`;
  }

  async verify(storedHash: string, candidatePassword: string): Promise<PasswordVerificationResult> {
    if (!passwordSizeIsValid(candidatePassword)) return { valid: false, needsRehash: false };
    const format = this.identifyFormat(storedHash);

    if (format === 'BCRYPT_LEGACY') {
      const valid = await safelyVerifyBcrypt(storedHash, candidatePassword);
      if (!valid) return { valid: false, needsRehash: false };
      return this.upgradeResult(candidatePassword);
    }

    if (format !== 'ARGON2ID_V2') return { valid: false, needsRehash: false };
    const encodedHash = storedHash.slice(PASSWORD_HASH_ENVELOPE.length);
    const currentValid = await safelyVerifyArgon2(encodedHash, candidatePassword, this.config.currentPepper);
    if (currentValid) {
      const needsRehash = argon2.needsRehash(encodedHash, ARGON2ID_OPTIONS);
      return needsRehash
        ? this.upgradeResult(candidatePassword)
        : { valid: true, needsRehash: false };
    }

    if (this.config.previousPepper) {
      const previousValid = await safelyVerifyArgon2(encodedHash, candidatePassword, this.config.previousPepper);
      if (previousValid) return this.upgradeResult(candidatePassword);
    }

    return { valid: false, needsRehash: false };
  }

  async verifyWithoutUpgrade(storedHash: string, candidatePassword: string): Promise<boolean> {
    if (!passwordSizeIsValid(candidatePassword)) return false;
    const format = this.identifyFormat(storedHash);
    if (format === 'BCRYPT_LEGACY') return safelyVerifyBcrypt(storedHash, candidatePassword);
    if (format !== 'ARGON2ID_V2') return false;
    const encodedHash = storedHash.slice(PASSWORD_HASH_ENVELOPE.length);
    if (await safelyVerifyArgon2(encodedHash, candidatePassword, this.config.currentPepper)) return true;
    return this.config.previousPepper
      ? safelyVerifyArgon2(encodedHash, candidatePassword, this.config.previousPepper)
      : false;
  }

  identifyFormat(storedHash: string): PasswordHashFormat {
    if (storedHash.startsWith(PASSWORD_HASH_ENVELOPE)) {
      const encodedHash = storedHash.slice(PASSWORD_HASH_ENVELOPE.length);
      return encodedHash.startsWith('$argon2id$') ? 'ARGON2ID_V2' : 'UNKNOWN';
    }
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedHash) ? 'BCRYPT_LEGACY' : 'UNKNOWN';
  }

  private async upgradeResult(password: string): Promise<PasswordVerificationResult> {
    try {
      return { valid: true, needsRehash: true, upgradedHash: await this.hash(password) };
    } catch {
      return { valid: true, needsRehash: true };
    }
  }
}

export function loadPasswordConfig(environment: NodeJS.ProcessEnv = process.env): PasswordConfig {
  const currentPepper = environment.PASSWORD_PEPPER;
  if (!currentPepper || currentPepper === passwordPepperPlaceholder || Buffer.byteLength(currentPepper, 'utf8') < 32) {
    throw new Error('PASSWORD_PEPPER is required and must contain at least 32 bytes.');
  }
  const previousPepper = environment.PASSWORD_PEPPER_PREVIOUS;
  if (previousPepper && Buffer.byteLength(previousPepper, 'utf8') < 32) {
    throw new Error('PASSWORD_PEPPER_PREVIOUS must contain at least 32 bytes when configured.');
  }
  if (previousPepper === currentPepper) {
    throw new Error('PASSWORD_PEPPER_PREVIOUS must differ from PASSWORD_PEPPER.');
  }
  return { currentPepper, previousPepper: previousPepper || undefined };
}

function preprocessPassword(password: string, pepper: string): Buffer {
  return createHmac('sha256', pepper).update(password, 'utf8').digest();
}

function assertPasswordSize(password: string) {
  if (!passwordSizeIsValid(password)) throw new Error(`Password input exceeds the ${MAX_PASSWORD_BYTES}-byte limit.`);
}

function passwordSizeIsValid(password: string) {
  return Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES;
}

async function safelyVerifyArgon2(encodedHash: string, password: string, pepper: string) {
  try {
    return await argon2.verify(encodedHash, preprocessPassword(password, pepper));
  } catch {
    return false;
  }
}

async function safelyVerifyBcrypt(encodedHash: string, password: string) {
  try {
    return await bcrypt.compare(password, encodedHash);
  } catch {
    return false;
  }
}
