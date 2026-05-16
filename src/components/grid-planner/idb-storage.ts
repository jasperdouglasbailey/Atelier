/**
 * IndexedDB-backed image blob storage for the Grid Planner.
 *
 * localStorage caps out around 5–10MB and can't hold arbitrary binary blobs
 * efficiently. IndexedDB gives us ~50% of available disk space (Chrome's
 * default quota, plenty for hundreds of grid mockup images) and stores
 * blobs natively so URL.createObjectURL() works directly.
 *
 * Single object store keyed by slot ID. Each value is a Blob. Reading
 * returns a fresh ObjectURL the caller is responsible for revoking later
 * to avoid leaking memory across hot-reloads.
 *
 * No external IDB wrapper library — the surface we need is tiny.
 */

const DB_NAME = 'atelier_grid_planner';
const DB_VERSION = 1;
const STORE = 'slot_images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/** Save a Blob/File under `key`. Returns when committed. */
export async function putImage(key: string, blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, key));
}

/** Fetch a Blob by key. Returns null when no record exists. */
export async function getImage(key: string): Promise<Blob | null> {
  try {
    const result = await withStore<Blob | undefined>('readonly', (store) => store.get(key));
    return result ?? null;
  } catch {
    return null;
  }
}

/** Remove a single image. */
export async function deleteImage(key: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(key));
  } catch {
    // Swallow — best-effort cleanup.
  }
}

/** Wipe every image from the store (for the "Clear" button). */
export async function clearAllImages(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // Swallow.
  }
}

/** Hydrate a Blob and return an ObjectURL the caller must revoke. */
export async function getImageUrl(key: string): Promise<string | null> {
  const blob = await getImage(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
