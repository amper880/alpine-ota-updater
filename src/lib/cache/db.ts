/**
 * IndexedDB storage for downloaded firmware files and the last known release lists.
 * Firmware is stored as Blobs so it survives restarts and works offline (e.g. while the
 * phone is connected to the node's OTA WiFi, which has no internet).
 */
import type { Platform, Release, Role } from '../catalog/types.ts';

export interface CachedFirmware {
  key: string;
  sourceId: string;
  repo: string;
  tag: string;
  version: string;
  boardId: string;
  role: Role;
  platform: Platform;
  assetName: string;
  size: number;
  sha256: string;
  downloadedAt: string;
  blob: Blob;
}

export type CachedFirmwareMeta = Omit<CachedFirmware, 'blob'>;

interface CachedReleases {
  repo: string;
  fetchedAt: string;
  releases: Release[];
}

const DB_NAME = 'alpine-ota';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('firmware')) db.createObjectStore('firmware', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('releases')) db.createObjectStore('releases', { keyPath: 'repo' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: 'firmware' | 'releases', mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function listFirmware(): Promise<CachedFirmwareMeta[]> {
  const all = (await promisify((await store('firmware', 'readonly')).getAll())) as CachedFirmware[];
  return all
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export async function getFirmware(key: string): Promise<CachedFirmware | undefined> {
  return (await promisify((await store('firmware', 'readonly')).get(key))) as CachedFirmware | undefined;
}

export async function putFirmware(fw: CachedFirmware): Promise<void> {
  await promisify((await store('firmware', 'readwrite')).put(fw));
}

export async function deleteFirmware(key: string): Promise<void> {
  await promisify((await store('firmware', 'readwrite')).delete(key));
}

export async function clearFirmware(): Promise<void> {
  await promisify((await store('firmware', 'readwrite')).clear());
}

export async function getCachedReleases(repo: string): Promise<CachedReleases | undefined> {
  return (await promisify((await store('releases', 'readonly')).get(repo))) as CachedReleases | undefined;
}

export async function putCachedReleases(repo: string, releases: Release[]): Promise<void> {
  const rec: CachedReleases = { repo, fetchedAt: new Date().toISOString(), releases };
  await promisify((await store('releases', 'readwrite')).put(rec));
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | undefined> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : undefined;
  } catch {
    return undefined;
  }
}
