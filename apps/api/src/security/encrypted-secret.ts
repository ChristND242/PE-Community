import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function encryptionKey() {
  const secret = encryptionSecret();
  return createHash('sha256').update(secret).digest();
}

function encryptionSecret() {
  const configured = [process.env.EMAIL_ENCRYPTION_KEY, process.env.JWT_SECRET]
    .find((value) => value?.trim() && value !== '<generate-a-strong-independent-secret>');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('EMAIL_ENCRYPTION_KEY or JWT_SECRET is required in production.');
  }
  return 'local-development-secret-change-before-production';
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
