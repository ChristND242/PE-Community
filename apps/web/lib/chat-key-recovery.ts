import { CHAT_ENCRYPTION_ALGORITHM, exportPrivateKey, importPrivateKey } from './chat-crypto';

const backupType = 'pe-community-chat-key-backup';
const backupVersion = 1;
const backupKdf = 'PBKDF2-SHA256';
const backupIterations = 210_000;
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
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(parsed.iv)) },
    encryptionKey,
    base64ToBytes(parsed.encryptedPrivateKey),
  );
  const privateKeyJson = decoder.decode(decrypted);
  const privateJwk = parsePrivateJwk(privateKeyJson);
  const privateKey = await importPrivateKey(privateKeyJson);
  const publicKeyJson = JSON.stringify({
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    y: privateJwk.y,
    ext: true,
    key_ops: [],
  });
  return { privateKey, privateKeyJson, publicKeyJson };
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
  if (!value || typeof value !== 'object') throw new Error('Invalid backup.');
  const backup = value as Partial<EncryptedChatKeyBackup>;
  if (
    backup.version !== backupVersion ||
    backup.type !== backupType ||
    backup.algorithm !== CHAT_ENCRYPTION_ALGORITHM ||
    backup.kdf !== backupKdf ||
    backup.iterations !== backupIterations ||
    !isNonEmptyString(backup.salt) ||
    !isNonEmptyString(backup.iv) ||
    !isNonEmptyString(backup.encryptedPrivateKey) ||
    !isNonEmptyString(backup.createdAt)
  ) {
    throw new Error('Invalid backup.');
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

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
