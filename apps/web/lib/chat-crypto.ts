export const CHAT_ENCRYPTION_ALGORITHM = 'ECDH-P256-AES-GCM-v1';
export const CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM = 'AES-GCM-256-CHAT-ATTACHMENT-v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type ChatKeyPair = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
};

export async function generateChatKeyPair(): Promise<ChatKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
  return { privateKey: pair.privateKey, publicKey: pair.publicKey };
}

export async function exportPublicKey(publicKey: CryptoKey) {
  return JSON.stringify(await crypto.subtle.exportKey('jwk', publicKey));
}

export async function exportPrivateKey(privateKey: CryptoKey) {
  return JSON.stringify(await crypto.subtle.exportKey('jwk', privateKey));
}

export async function importPublicKey(publicKey: string) {
  return crypto.subtle.importKey(
    'jwk',
    JSON.parse(publicKey) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

export async function importPrivateKey(privateKey: string) {
  return crypto.subtle.importKey(
    'jwk',
    JSON.parse(privateKey) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
}

export async function deriveSharedAesKey(privateKey: CryptoKey, publicKey: CryptoKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptChatMessage(plaintext: string, privateKey: CryptoKey, recipientPublicKey: CryptoKey) {
  const aesKey = await deriveSharedAesKey(privateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoder.encode(plaintext));
  return {
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
    encryptionNonce: bytesToBase64(iv),
    encryptionAlgorithmVersion: CHAT_ENCRYPTION_ALGORITHM,
  };
}

export async function decryptChatMessage(encryptedPayload: string, encryptionNonce: string, privateKey: CryptoKey, participantPublicKey: CryptoKey) {
  const aesKey = await deriveSharedAesKey(privateKey, participantPublicKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encryptionNonce) },
    aesKey,
    base64ToBytes(encryptedPayload),
  );
  return decoder.decode(decrypted);
}

export async function encryptChatAttachment(file: File) {
  const fileKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fileKey, await file.arrayBuffer());
  const exportedKey = await crypto.subtle.exportKey('raw', fileKey);
  return {
    encryptedBlob: new Blob([encrypted], { type: 'application/octet-stream' }),
    fileKey: bytesToBase64(new Uint8Array(exportedKey)),
    fileNonce: bytesToBase64(iv),
    encryptionAlgorithmVersion: CHAT_ATTACHMENT_ENCRYPTION_ALGORITHM,
  };
}

export async function decryptChatAttachment(encrypted: ArrayBuffer, fileKey: string, fileNonce: string) {
  const importedKey = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(fileKey),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(fileNonce) },
    importedKey,
    encrypted,
  );
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
