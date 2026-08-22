import { exportPrivateKey, exportPublicKey, generateChatKeyPair, importPrivateKey } from './chat-crypto';
import { detectClientDeviceInfoSync } from './chat-device-info';

const databaseName = 'pe-community-chat-keys';
const storeName = 'device-keys';
const databaseVersion = 1;

type StoredChatKey = {
  id: string;
  privateKey: string;
  publicKey: string;
  createdAt: string;
  history?: Array<{
    privateKey: string;
    publicKey: string;
    createdAt: string;
  }>;
};

export type LocalChatKeyPair = {
  privateKey: CryptoKey;
  publicKey: string;
};

export type LocalChatDeviceIdentity = {
  deviceIdentifier: string;
  displayName: string;
};

export async function getLocalChatKey(userId: string, communityId: string): Promise<LocalChatKeyPair | null> {
  const database = await openDatabase();
  const existing = await readStoredKey(database, keyId(userId, communityId));
  if (!existing) return null;
  return {
    privateKey: await importPrivateKey(existing.privateKey),
    publicKey: existing.publicKey,
  };
}

export async function getLocalChatKeyRing(userId: string, communityId: string): Promise<LocalChatKeyPair[]> {
  const database = await openDatabase();
  const existing = await readStoredKey(database, keyId(userId, communityId));
  if (!existing) return [];
  return Promise.all([
    { privateKey: existing.privateKey, publicKey: existing.publicKey },
    ...(existing.history ?? []),
  ].map(async (key) => ({
    privateKey: await importPrivateKey(key.privateKey),
    publicKey: key.publicKey,
  })));
}

export async function createLocalChatKey(userId: string, communityId: string): Promise<LocalChatKeyPair> {
  const generated = await generateChatKeyPair();
  return replaceLocalChatKey(
    userId,
    communityId,
    await exportPrivateKey(generated.privateKey),
    await exportPublicKey(generated.publicKey),
  );
}

export async function getOrCreateLocalChatKey(userId: string, communityId: string): Promise<LocalChatKeyPair> {
  return (await getLocalChatKey(userId, communityId)) ?? createLocalChatKey(userId, communityId);
}

export async function replaceLocalChatKey(userId: string, communityId: string, privateKey: string, publicKey: string): Promise<LocalChatKeyPair> {
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const existing = await readStoredKey(database, id);
  const history = existing && existing.publicKey !== publicKey
    ? [
        { privateKey: existing.privateKey, publicKey: existing.publicKey, createdAt: existing.createdAt },
        ...(existing.history ?? []),
      ].filter((key, index, all) => all.findIndex((candidate) => candidate.publicKey === key.publicKey) === index)
    : existing?.history ?? [];
  await writeStoredKey(database, {
    id,
    privateKey,
    publicKey,
    createdAt: new Date().toISOString(),
    history,
  });
  return {
    privateKey: await importPrivateKey(privateKey),
    publicKey,
  };
}

export async function removeLocalChatKey(userId: string, communityId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(keyId(userId, communityId));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function getLocalChatDeviceIdentity(userId: string, communityId: string): LocalChatDeviceIdentity {
  const storageKey = `pe-community-chat-device:${communityId}:${userId}`;
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as Partial<LocalChatDeviceIdentity>;
      if (typeof parsed.deviceIdentifier === 'string' && parsed.deviceIdentifier && typeof parsed.displayName === 'string' && parsed.displayName) {
        return { deviceIdentifier: parsed.deviceIdentifier, displayName: parsed.displayName };
      }
    } catch {
      // Replace malformed local metadata without affecting the cryptographic key store.
    }
  }
  const identity = {
    deviceIdentifier: crypto.randomUUID(),
    displayName: detectClientDeviceInfoSync(navigator).suggestedDisplayName,
  };
  window.localStorage.setItem(storageKey, JSON.stringify(identity));
  return identity;
}

function keyId(userId: string, communityId: string) {
  return `${communityId}:${userId}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readStoredKey(database: IDBDatabase, id: string) {
  return new Promise<StoredChatKey | null>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve((request.result as StoredChatKey | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function writeStoredKey(database: IDBDatabase, key: StoredChatKey) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
