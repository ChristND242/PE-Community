import { CHAT_ENCRYPTION_ALGORITHM, canonicalChatPublicKeyJson, exportPrivateKey, importPrivateKey } from './chat-crypto';

const backupType = 'pe-community-chat-key-backup';
const backupVersion = 1;
const backupKdf = 'PBKDF2-SHA256';
const backupIterations = 210_000;
export const CHAT_KEY_BACKUP_MAX_FILE_BYTES = 128 * 1024;
const backupSaltBytes = 16;
const backupIvBytes = 12;
const maxEncodedFieldLength = 96 * 1024;
const maxEncryptedPrivateKeyBytes = 64 * 1024;
const backupFields = ['version', 'type', 'algorithm', 'kdf', 'iterations', 'salt', 'iv', 'encryptedPrivateKey', 'createdAt'];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedChatKeyBackup = {
  version: number;
  type: typeof backupType;
  algorithm: typeof CHAT_ENCRYPTION_ALGORITHM;
  kdf: typeof backupKdf;
  iterations: number;
  salt: string;
  iv: string;
  encryptedPrivateKey: string;
  createdAt: string;
};

export type ImportedChatKeyBackup = {
  privateKey: CryptoKey;
  privateKeyJson: string;
  publicKeyJson: string;
};

export type ChatKeyBackupErrorCode = 'INVALID_BACKUP' | 'UNSUPPORTED_BACKUP_VERSION' | 'WRONG_RECOVERY_PASSWORD' | 'BACKUP_CORRUPTED';

export class ChatKeyBackupError extends Error {
  constructor(readonly code: ChatKeyBackupErrorCode) {
    super(code);
    this.name = 'ChatKeyBackupError';
  }
}

export function parseEncryptedChatKeyBackupJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ChatKeyBackupError('INVALID_BACKUP');
  }
}

export async function exportEncryptedChatKeyBackup(privateKey: CryptoKey, recoveryPassword: string): Promise<EncryptedChatKeyBackup> {
  const privateKeyJson = await exportPrivateKey(privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptionKey = await deriveBackupEncryptionKey(recoveryPassword, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, encryptionKey, encoder.encode(privateKeyJson));
  return {
    version: backupVersion,
    type: backupType,
    algorithm: CHAT_ENCRYPTION_ALGORITHM,
    kdf: backupKdf,
    iterations: backupIterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    encryptedPrivateKey: bytesToBase64(new Uint8Array(encrypted)),
    createdAt: new Date().toISOString(),
  };
}

export async function importEncryptedChatKeyBackup(backup: unknown, recoveryPassword: string): Promise<ImportedChatKeyBackup> {
  const parsed = parseBackup(backup);
  const encryptionKey = await deriveBackupEncryptionKey(recoveryPassword, base64ToBytes(parsed.salt));
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(parsed.iv)) },
      encryptionKey,
      base64ToBytes(parsed.encryptedPrivateKey),
    );
  } catch {
    throw new ChatKeyBackupError('WRONG_RECOVERY_PASSWORD');
  }
  try {
    const privateKeyJson = decoder.decode(decrypted);
    const privateJwk = parsePrivateJwk(privateKeyJson);
    const privateKey = await importPrivateKey(privateKeyJson);
    return { privateKey, privateKeyJson, publicKeyJson: canonicalChatPublicKeyJson(privateJwk) };
  } catch {
    throw new ChatKeyBackupError('BACKUP_CORRUPTED');
  }
}

function deriveBackupEncryptionKey(recoveryPassword: string, salt: Uint8Array) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(recoveryPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  ).then((passwordKey) => crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: backupIterations,
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  ));
}

function parseBackup(value: unknown): EncryptedChatKeyBackup {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ChatKeyBackupError('INVALID_BACKUP');
  const backup = value as Partial<EncryptedChatKeyBackup>;
  const keys = Object.keys(value);
  if (typeof backup.version === 'number' && backup.version !== backupVersion) {
    throw new ChatKeyBackupError('UNSUPPORTED_BACKUP_VERSION');
  }
  if (
    keys.length !== backupFields.length ||
    keys.some((key) => !backupFields.includes(key)) ||
    backup.version !== backupVersion ||
    backup.type !== backupType ||
    backup.algorithm !== CHAT_ENCRYPTION_ALGORITHM ||
    backup.kdf !== backupKdf ||
    backup.iterations !== backupIterations ||
    !isNonEmptyString(backup.salt) ||
    !isNonEmptyString(backup.iv) ||
    !isNonEmptyString(backup.encryptedPrivateKey) ||
    !isNonEmptyString(backup.createdAt) ||
    backup.createdAt.length > 64 ||
    backup.salt.length > maxEncodedFieldLength ||
    backup.iv.length > maxEncodedFieldLength ||
    backup.encryptedPrivateKey.length > maxEncodedFieldLength ||
    !Number.isFinite(Date.parse(backup.createdAt))
  ) {
    throw new ChatKeyBackupError('INVALID_BACKUP');
  }
  let salt: Uint8Array;
  let iv: Uint8Array;
  let encryptedPrivateKey: Uint8Array;
  try {
    salt = base64ToBytes(backup.salt, backupSaltBytes);
    iv = base64ToBytes(backup.iv, backupIvBytes);
    encryptedPrivateKey = base64ToBytes(backup.encryptedPrivateKey, maxEncryptedPrivateKeyBytes);
  } catch {
    throw new ChatKeyBackupError('BACKUP_CORRUPTED');
  }
  if (salt.length !== backupSaltBytes || iv.length !== backupIvBytes || encryptedPrivateKey.length < 17) {
    throw new ChatKeyBackupError('BACKUP_CORRUPTED');
  }
  return backup as EncryptedChatKeyBackup;
}

function parsePrivateJwk(privateKeyJson: string) {
  const jwk = JSON.parse(privateKeyJson) as JsonWebKey;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) throw new Error('Invalid key.');
  return jwk;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string, maxBytes = maxEncryptedPrivateKeyBytes) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0 || value.length > Math.ceil(maxBytes / 3) * 4) {
    throw new Error('Invalid backup.');
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error('Invalid backup.');
  }
  if (binary.length > maxBytes) throw new Error('Invalid backup.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
