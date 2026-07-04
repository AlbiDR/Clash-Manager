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
 * // EPHEMERAL: intentionally resets on cold start
 */
export const memoryStore = new Map<string, unknown>();

/**
 * Global flag indicating if the kernel has fallen back to memory-only mode.
 * // EPHEMERAL: intentionally resets on cold start
 */
export let useMemoryStore = false;

// [GUARD] ENVIRONMENT CHECK
// [THREAT:] Private browsing modes or restricted environments can expose the IndexedDB
// global but throw security errors upon access, leading to unhandled runtime exceptions.
// [DECISION LOG] We perform a proactive probe on initialization to detect these
// failures early and force a graceful degradation to the memoryStore. This protects
// the higher layers (@core/services) from silent failures during the boot sequence.
if (typeof indexedDB === "undefined") {
  useMemoryStore = true;
} else {
  try {
    // Some private browsing modes expose the symbol but fail on open
    const idbProbeRequest = indexedDB.open("CM_KERNEL_CHECK");
    idbProbeRequest.onerror = () => {
      useMemoryStore = true;
    };
    idbProbeRequest.onsuccess = () => {
      if (idbProbeRequest.result && typeof idbProbeRequest.result.close === "function") {
        idbProbeRequest.result.close();
      }
      indexedDB.deleteDatabase("CM_KERNEL_CHECK");
    };
  } catch (idbProbeError: unknown) {
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
      const idbDeleteRequest = indexedDB.deleteDatabase(dbName);
      idbDeleteRequest.onsuccess = () => resolve();
      idbDeleteRequest.onerror = () => resolve();
      idbDeleteRequest.onblocked = () => {
        // [DECISION LOG] Non-blocking timeout to prevent hanging the pipeline
        // during database migrations or concurrent access conflicts.
        setTimeout(resolve, 1500);
      };
    } catch (dbDeletionError: unknown) {
      resolve();
    }
  });
}

// EPHEMERAL: intentionally resets on cold start
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

    const idbOpenRequest = indexedDB.open(dbName, version);

    // [THREAT:] Race conditions or schema conflicts during upgrade can corrupt persistence.
    // [DECISION LOG] Upgrade logic is encapsulated in a dedicated callback to ensure
    // structural integrity before the connection is marked successful.
    idbOpenRequest.onupgradeneeded = (dbUpgradeEvent) => {
      const db = (dbUpgradeEvent.target as IDBOpenDBRequest).result;
      onUpgrade(db);
    };

    idbOpenRequest.onsuccess = async () => {
      const db = idbOpenRequest.result;
      if (onSuccess) {
        try {
          await onSuccess(db);
        } catch (postConnectionHookError: unknown) {
          console.warn("[IDB-Kernel] onSuccess hook failed:", postConnectionHookError);
        }
      }
      resolve(db);
    };

    idbOpenRequest.onerror = (dbOpeningError) => {
      dbPromise = null;
      reject(idbOpenRequest.error || dbOpeningError);
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
          const idbTransaction = db.transaction(storeName, "readonly");
          const idbStore = idbTransaction.objectStore(storeName);
          const idbGetRequest = idbStore.get(key);
          idbGetRequest.onsuccess = () => resolve((idbGetRequest.result as T) || null);
          idbGetRequest.onerror = () => reject(idbGetRequest.error);
        } catch (readOperationError: unknown) { reject(readOperationError); }
      });
    } catch {
      // [THREAT:] Silent runtime failures in IDB operations can stall the UI thread.
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
          const idbTransaction = db.transaction(storeName, "readwrite");
          const idbStore = idbTransaction.objectStore(storeName);
          const idbSetRequest = idbStore.put(value, key);
          idbSetRequest.onsuccess = () => resolve();
          idbSetRequest.onerror = () => reject(idbSetRequest.error);
        } catch (writeOperationError: unknown) { reject(writeOperationError); }
      });
    } catch {
      // [THREAT:] Storage exhaustion or IO failures must not prevent UI state commitment.
      // [DECISION LOG] Fall back to memoryStore to ensure that the user's latest interactions
      // are captured even if persistence is failing.
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
          const idbTransaction = db.transaction(storeName, "readwrite");
          const idbStore = idbTransaction.objectStore(storeName);
          const idbDelRequest = idbStore.delete(key);
          idbDelRequest.onsuccess = () => resolve();
          idbDelRequest.onerror = () => reject(idbDelRequest.error);
        } catch (deleteOperationError: unknown) { reject(deleteOperationError); }
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
          const idbTransaction = db.transaction(storeName, "readwrite");
          const idbStore = idbTransaction.objectStore(storeName);
          const idbClearRequest = idbStore.clear();
          idbClearRequest.onsuccess = () => resolve();
          idbClearRequest.onerror = () => reject(idbClearRequest.error);
        } catch (clearOperationError: unknown) { reject(clearOperationError); }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.clear();
    }
  }
};
