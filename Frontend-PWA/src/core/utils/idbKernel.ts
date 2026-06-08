// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * IDB KERNEL (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a generic, resilient Promise-wrapped interface for
 * IndexedDB with a mandatory in-memory fallback.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Utility (@core)
 * - **Role:** Agnostic infrastructure for local persistence.
 * - **Satisfaction:** ADR Section II (Layer 1: Core) and Section IV (Tiered Caching Protocol).
 */

/**
 * Fallback in-memory storage for environments where IndexedDB is unavailable or failing.
 */
export const memoryStore = new Map<string, unknown>();

/**
 * Global flag indicating if the kernel has fallen back to memory-only mode.
 */
export let useMemoryStore = false;

// [GUARD] ENVIRONMENT CHECK
// [THREAT:] Private browsing modes or restricted environments can expose the IndexedDB
// global but throw security errors upon access, leading to unhandled runtime exceptions.
// [DECISION LOG] We perform a proactive probe on initialization to detect these
// failures early and force a graceful degradation to the memoryStore.
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
 * Useful for testing or when manual fallback is required.
 */
export function forceMemoryMode() {
  useMemoryStore = true;
}

/**
 * Robust helper to delete an IndexedDB database with full Promise wrapping.
 *
 * @param dbName - The name of the database to delete.
 * @returns A promise that resolves when deletion is complete or failed.
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
        // during database migrations or concurrent access conflicts.
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
 * Manages a singleton connection promise to prevent race conditions.
 *
 * @param dbName - The database name.
 * @param version - The schema version.
 * @param onUpgrade - Callback for schema migrations.
 * @param onSuccess - Optional callback for post-connection logic.
 * @returns A promise resolving to the IDBDatabase instance.
 */
export async function openDB(
  dbName: string,
  version: number,
  onUpgrade: (db: IDBDatabase) => void,
  onSuccess?: (db: IDBDatabase) => Promise<void>
): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    // [THREAT:] Attempting to open IDB in unsupported environments triggers uncaught errors.
    // [DECISION LOG] Guarding the open request with useMemoryStore ensures we never
    // attempt a native call when the kernel has degraded.
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
 * Closes the active database connection and resets the singleton promise.
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
 * Core IDB operations with transparent fallback logic.
 *
 * @remarks
 * Every method in this object automatically checks the `useMemoryStore` flag.
 * If true, it bypasses the IndexedDB layer and uses the `memoryStore` Map.
 */
export const idbCore = {
  /**
   * Retrieves a value from the store.
   *
   * @param key - The record key.
   * @param getDB - Function to retrieve the active IDBDatabase connection.
   * @param storeName - The target object store name.
   * @returns A promise resolving to the retrieved value of type T or null.
   */
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
      // [DECISION LOG] Runtime failures in IDB trigger an immediate degradation
      // to memory-only mode to preserve application responsiveness.
      useMemoryStore = true;
      return (memoryStore.get(key) as T) || null;
    }
  },

  /**
   * Persists a value to the store.
   *
   * @param key - The record key.
   * @param value - The data to persist.
   * @param getDB - Function to retrieve the active IDBDatabase connection.
   * @param storeName - The target object store name.
   */
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

  /**
   * Removes a record from the store.
   *
   * @param key - The record key.
   * @param getDB - Function to retrieve the active IDBDatabase connection.
   * @param storeName - The target object store name.
   */
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

  /**
   * Clears all records from the target object store.
   *
   * @param getDB - Function to retrieve the active IDBDatabase connection.
   * @param storeName - The target object store name.
   */
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
