// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * IDB KERNEL (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a generic, resilient Promise-wrapped interface for
 * IndexedDB with a mandatory in-memory fallback.
 * ----------------------------------------------------------------------------
 */

export const memoryStore = new Map<string, unknown>();
export let useMemoryStore = false;

// [GUARD] ENVIRONMENT CHECK
if (typeof indexedDB === "undefined") {
  useMemoryStore = true;
} else {
  try {
    // Some private browsing modes expose the symbol but fail on open
    const req = indexedDB.open("CM_KERNEL_CHECK");
    req.onerror = () => {
      useMemoryStore = true;
    };
    req.onsuccess = () => {
      if (req.result && typeof req.result.close === "function") {
        req.result.close();
      }
      indexedDB.deleteDatabase("CM_KERNEL_CHECK");
    };
  } catch (e) {
    useMemoryStore = true;
  }
}

/**
 * Force the kernel into memory-only mode.
 */
export function forceMemoryMode() {
  useMemoryStore = true;
}

/**
 * Robust helper to delete an IndexedDB database with full Promise wrapping.
 */
export function deleteDatabasePromise(dbName: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve();
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => {
        // [DECISION LOG] Non-blocking timeout to prevent hanging the pipeline
        setTimeout(resolve, 1500);
      };
    } catch (e) {
      resolve();
    }
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Internal factory to open the IndexedDB connection.
 */
export async function openDB(
  dbName: string,
  version: number,
  onUpgrade: (db: IDBDatabase) => void,
  onSuccess?: (db: IDBDatabase) => Promise<void>
): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (useMemoryStore || typeof indexedDB === "undefined") {
      dbPromise = null;
      return reject(new Error("IDB Unsupported"));
    }

    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      onUpgrade(db);
    };

    request.onsuccess = async () => {
      const db = request.result;
      if (onSuccess) {
        try {
          await onSuccess(db);
        } catch (err) {
          console.warn("[IDB-Kernel] onSuccess hook failed:", err);
        }
      }
      resolve(db);
    };

    request.onerror = (e) => {
      dbPromise = null;
      reject(request.error || e);
    };
  });

  return dbPromise;
}

/**
 * Closes the active database connection.
 */
export async function closeDB() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
}

/**
 * Resets the singleton promise (used for testing).
 * @public
 */
export function resetDBPromise() {
  dbPromise = null;
}

/**
 * Core IDB operations with fallback logic.
 */
export const idbCore = {
  async get<T>(key: string, getDB: () => Promise<IDBDatabase>, storeName: string): Promise<T | null> {
    if (useMemoryStore) return (memoryStore.get(key) as T) || null;
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const request = store.get(key);
          request.onsuccess = () => resolve((request.result as T) || null);
          request.onerror = () => reject(request.error);
        } catch (e) { reject(e); }
      });
    } catch {
      useMemoryStore = true;
      return (memoryStore.get(key) as T) || null;
    }
  },

  async set(key: string, value: unknown, getDB: () => Promise<IDBDatabase>, storeName: string): Promise<void> {
    if (useMemoryStore) { memoryStore.set(key, value); return; }
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (e) { reject(e); }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.set(key, value);
    }
  },

  async del(key: string, getDB: () => Promise<IDBDatabase>, storeName: string): Promise<void> {
    if (useMemoryStore) { memoryStore.delete(key); return; }
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (e) { reject(e); }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.delete(key);
    }
  },

  async clear(getDB: () => Promise<IDBDatabase>, storeName: string): Promise<void> {
    if (useMemoryStore) { memoryStore.clear(); return; }
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (e) { reject(e); }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.clear();
    }
  }
};
