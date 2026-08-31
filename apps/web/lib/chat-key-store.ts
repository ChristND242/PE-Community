import { chatPublicKeyIdentifier, chatPublicKeysEqual, exportPrivateKey, exportPublicKey, generateChatKeyPair, importPrivateKey } from './chat-crypto';
import { detectClientDeviceInfoSync } from './chat-device-info';

const databaseName = 'pe-community-chat-keys';
const storeName = 'device-keys';
const databaseVersion = 1;

export type StoredChatKeyMaterial = {
  privateKey: string;
  publicKey: string;
  createdAt: string;
};

export type StoredChatKeyState = {
  id: string;
  formatVersion: 2;
  current: StoredChatKeyMaterial | null;
  history: StoredChatKeyMaterial[];
  pending: StoredChatKeyMaterial | null;
  quarantined: StoredChatKeyMaterial[];
};

type LegacyStoredChatKey = {
  id: string;
  privateKey: string;
  publicKey: string;
  createdAt: string;
  history?: StoredChatKeyMaterial[];
};

export type LocalChatKeyPair = {
  privateKey: CryptoKey;
  publicKey: string;
};

export type LocalChatDeviceIdentity = {
  deviceIdentifier: string;
  displayName: string;
};

export type ServerOwnedChatKey = {
  publicKey: string;
  status: 'ACTIVE' | 'RETIRED' | 'REVOKED' | string;
};

export type ReconciledLocalChatKeys = {
  current: LocalChatKeyPair | null;
  activeCandidate: LocalChatKeyPair | null;
  keyRing: LocalChatKeyPair[];
  quarantinedCount: number;
};

export async function getLocalChatKey(userId: string, communityId: string): Promise<LocalChatKeyPair | null> {
  const state = await readState(userId, communityId);
  return state?.current ? importMaterial(state.current) : null;
}

export async function getLocalChatKeyRing(userId: string, communityId: string): Promise<LocalChatKeyPair[]> {
  const state = await readState(userId, communityId);
  if (!state) return [];
  return Promise.all(dedupeMaterials([...(state.current ? [state.current] : []), ...state.history]).map(importMaterial));
}

export async function stageGeneratedLocalChatKey(userId: string, communityId: string): Promise<LocalChatKeyPair> {
  const generated = await generateChatKeyPair();
  return stageLocalChatKey(
    userId,
    communityId,
    await exportPrivateKey(generated.privateKey),
    await exportPublicKey(generated.publicKey),
  );
}

export async function stageLocalChatKey(userId: string, communityId: string, privateKey: string, publicKey: string): Promise<LocalChatKeyPair> {
  const imported = await importPrivateKey(privateKey);
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const state = normalizeStoredState(await readRawStoredKey(database, id), id);
  await writeStoredKey(database, {
    ...state,
    pending: { privateKey, publicKey, createdAt: new Date().toISOString() },
  });
  return { privateKey: imported, publicKey };
}

export async function commitStagedLocalChatKey(userId: string, communityId: string, expectedPublicKey: string): Promise<LocalChatKeyPair> {
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const state = normalizeStoredState(await readRawStoredKey(database, id), id);
  if (!state.pending || !chatPublicKeysEqual(state.pending.publicKey, expectedPublicKey)) throw new Error('Pending chat identity is unavailable.');
  const next = commitMaterial(state, state.pending);
  await writeStoredKey(database, next);
  return importMaterial(next.current!);
}

export async function promoteRetainedLocalChatKey(userId: string, communityId: string, publicKey: string): Promise<LocalChatKeyPair> {
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const state = normalizeStoredState(await readRawStoredKey(database, id), id);
  const material = [state.current, ...state.history, state.pending, ...state.quarantined]
    .find((candidate) => candidate && chatPublicKeysEqual(candidate.publicKey, publicKey));
  if (!material) throw new Error('Retained chat identity is unavailable.');
  const next = commitMaterial(state, material);
  await writeStoredKey(database, next);
  return importMaterial(material);
}

export async function storeHistoricalLocalChatKey(userId: string, communityId: string, privateKey: string, publicKey: string): Promise<LocalChatKeyPair> {
  const imported = await importPrivateKey(privateKey);
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const state = normalizeStoredState(await readRawStoredKey(database, id), id);
  const material = { privateKey, publicKey, createdAt: new Date().toISOString() };
  await writeStoredKey(database, {
    ...state,
    history: dedupeMaterials([...state.history, ...(state.current && chatPublicKeysEqual(state.current.publicKey, publicKey) ? [] : [material])]),
    pending: state.pending && chatPublicKeysEqual(state.pending.publicKey, publicKey) ? null : state.pending,
  });
  return { privateKey: imported, publicKey };
}

export async function snapshotLocalChatKeyState(userId: string, communityId: string): Promise<StoredChatKeyState | null> {
  const state = await readState(userId, communityId);
  return state ? structuredClone(state) : null;
}

export async function restoreLocalChatKeyState(userId: string, communityId: string, snapshot: StoredChatKeyState | null) {
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  if (!snapshot) {
    await deleteStoredKey(database, id);
    return;
  }
  await writeStoredKey(database, structuredClone(snapshot));
}

export async function reconcileLocalChatKeys(
  userId: string,
  communityId: string,
  serverKeys: ServerOwnedChatKey[],
  activePublicKey: string | null,
  deviceAuthorized: boolean,
): Promise<ReconciledLocalChatKeys> {
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const existing = await readRawStoredKey(database, id);
  if (!existing) return { current: null, activeCandidate: null, keyRing: [], quarantinedCount: 0 };
  const reconciled = reconcileStoredChatKeyState(normalizeStoredState(existing, id), serverKeys, activePublicKey, deviceAuthorized);
  await writeStoredKey(database, reconciled);
  const keyRing = await Promise.all(dedupeMaterials([...(reconciled.current ? [reconciled.current] : []), ...reconciled.history]).map(importMaterial));
  const activeCandidate = activePublicKey
    ? keyRing.find((candidate) => chatPublicKeysEqual(candidate.publicKey, activePublicKey)) ?? null
    : null;
  return {
    current: reconciled.current ? await importMaterial(reconciled.current) : null,
    activeCandidate,
    keyRing,
    quarantinedCount: reconciled.quarantined.length,
  };
}

export function reconcileStoredChatKeyState(
  state: StoredChatKeyState,
  serverKeys: ServerOwnedChatKey[],
  activePublicKey: string | null,
  deviceAuthorized: boolean,
): StoredChatKeyState {
  const serverByPublicKey = new Map(serverKeys.flatMap((key) => {
    const identifier = chatPublicKeyIdentifier(key.publicKey);
    return identifier ? [[identifier, key] as const] : [];
  }));
  const allMaterials = dedupeMaterials([
    ...(state.current ? [state.current] : []),
    ...state.history,
    ...(state.pending ? [state.pending] : []),
    ...state.quarantined,
  ]);
  const activeIdentifier = activePublicKey ? chatPublicKeyIdentifier(activePublicKey) : null;
  const activeCurrent = deviceAuthorized && activeIdentifier
    ? allMaterials.find((material) => chatPublicKeyIdentifier(material.publicKey) === activeIdentifier && serverByPublicKey.get(activeIdentifier)?.status === 'ACTIVE') ?? null
    : null;
  const history: StoredChatKeyMaterial[] = [];
  const quarantined: StoredChatKeyMaterial[] = [];
  for (const material of allMaterials) {
    if (activeCurrent && chatPublicKeysEqual(material.publicKey, activeCurrent.publicKey)) continue;
    const identifier = chatPublicKeyIdentifier(material.publicKey);
    const serverKey = identifier ? serverByPublicKey.get(identifier) : undefined;
    if (serverKey && serverKey.status !== 'REVOKED') history.push(material);
    else quarantined.push(material);
  }
  return {
    ...state,
    current: activeCurrent,
    history: dedupeMaterials(history),
    pending: null,
    quarantined: dedupeMaterials(quarantined),
  };
}

export async function removeLocalChatKey(userId: string, communityId: string) {
  const database = await openDatabase();
  await deleteStoredKey(database, keyId(userId, communityId));
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

function commitMaterial(state: StoredChatKeyState, material: StoredChatKeyMaterial): StoredChatKeyState {
  return {
    ...state,
    current: material,
    history: dedupeMaterials([
      ...(state.current && !chatPublicKeysEqual(state.current.publicKey, material.publicKey) ? [state.current] : []),
      ...state.history.filter((key) => !chatPublicKeysEqual(key.publicKey, material.publicKey)),
    ]),
    pending: null,
    quarantined: state.quarantined.filter((key) => !chatPublicKeysEqual(key.publicKey, material.publicKey)),
  };
}

function dedupeMaterials(materials: StoredChatKeyMaterial[]) {
  return materials.filter((key, index, all) => all.findIndex((candidate) => chatPublicKeysEqual(candidate.publicKey, key.publicKey)) === index);
}

async function importMaterial(material: StoredChatKeyMaterial): Promise<LocalChatKeyPair> {
  return { privateKey: await importPrivateKey(material.privateKey), publicKey: material.publicKey };
}

function keyId(userId: string, communityId: string) {
  return `${communityId}:${userId}`;
}

function normalizeStoredState(value: StoredChatKeyState | LegacyStoredChatKey | null, id: string): StoredChatKeyState {
  if (!value) return { id, formatVersion: 2, current: null, history: [], pending: null, quarantined: [] };
  if (isStoredChatKeyState(value)) {
    return {
      id,
      formatVersion: 2,
      current: value.current ?? null,
      history: dedupeMaterials(Array.isArray(value.history) ? value.history : []),
      pending: value.pending ?? null,
      quarantined: dedupeMaterials(Array.isArray(value.quarantined) ? value.quarantined : []),
    };
  }
  return {
    id,
    formatVersion: 2,
    current: { privateKey: value.privateKey, publicKey: value.publicKey, createdAt: value.createdAt },
    history: dedupeMaterials(value.history ?? []),
    pending: null,
    quarantined: [],
  };
}

function isStoredChatKeyState(value: StoredChatKeyState | LegacyStoredChatKey): value is StoredChatKeyState {
  return 'formatVersion' in value && value.formatVersion === 2;
}

async function readState(userId: string, communityId: string) {
  const database = await openDatabase();
  const id = keyId(userId, communityId);
  const raw = await readRawStoredKey(database, id);
  if (!raw) return null;
  const state = normalizeStoredState(raw, id);
  if (!isStoredChatKeyState(raw)) await writeStoredKey(database, state);
  return state;
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

function readRawStoredKey(database: IDBDatabase, id: string) {
  return new Promise<StoredChatKeyState | LegacyStoredChatKey | null>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(id);
    request.onsuccess = () => resolve((request.result as StoredChatKeyState | LegacyStoredChatKey | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function writeStoredKey(database: IDBDatabase, key: StoredChatKeyState) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function deleteStoredKey(database: IDBDatabase, id: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
