import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const encryptionKeyPlaceholder = '<generate-a-strong-random-secret>';

export function validateProductionSecretEncryption(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== 'production') return;
  const secret = environment.EMAIL_ENCRYPTION_KEY;
  if (!secret || secret === encryptionKeyPlaceholder || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('EMAIL_ENCRYPTION_KEY is required in production and must contain at least 32 bytes.');
  }
}

function encryptionKey() {
  validateProductionSecretEncryption();
  const secret = process.env.EMAIL_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'local-development-secret-change-before-production';
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string) {
  if (!value.startsWith('v1:')) return value;
  const [, ivRaw, tagRaw, encryptedRaw] = value.split(':');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Encrypted secret is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}
