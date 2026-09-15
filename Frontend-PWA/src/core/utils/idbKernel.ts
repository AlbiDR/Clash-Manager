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

import { STORAGE_DELETE_TIMEOUT, STORAGE_REQUEST_TIMEOUT } from "@core/config";

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
        setTimeout(resolve, STORAGE_DELETE_TIMEOUT);
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

  // [THREAT:] Attempting to open IDB in unsupported environments triggers uncaught errors.
  // [DECISION LOG] Guarding the open request with useMemoryStore ensures we never
  // attempt a native call when the kernel has degraded.
  if (useMemoryStore || typeof indexedDB === "undefined") {
    throw new Error("IDB Unsupported");
  }

  let idbOpenRequest: IDBOpenDBRequest;
  try {
    idbOpenRequest = indexedDB.open(dbName, version);
  } catch (openError: unknown) {
    useMemoryStore = true;
    throw openError;
  }

  const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const openTimeout = setTimeout(() => {
      fail(new Error(`IndexedDB open timed out for ${dbName}`));
    }, STORAGE_REQUEST_TIMEOUT);

    function fail(openError: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(openTimeout);
      if (dbPromise === openingPromise) dbPromise = null;
      reject(openError);
    }

    // [THREAT:] Race conditions or schema conflicts during upgrade can corrupt persistence.
    // [DECISION LOG] Upgrade logic is encapsulated in a dedicated callback to ensure
    // structural integrity before the connection is marked successful.
    idbOpenRequest.onupgradeneeded = (dbUpgradeEvent) => {
      const db = (dbUpgradeEvent.target as IDBOpenDBRequest).result;
      try {
        onUpgrade(db);
      } catch (upgradeError: unknown) {
        try {
          idbOpenRequest.transaction?.abort();
        } catch {
          // The transaction may already have been aborted by the browser.
        }
        fail(upgradeError);
      }
    };

    idbOpenRequest.onsuccess = async () => {
      const db = idbOpenRequest.result;
      if (settled) {
        db.close();
        return;
      }

      // Cooperate with schema upgrades from another tab instead of keeping the
      // newer version blocked indefinitely. The next operation opens a fresh DB.
      db.onversionchange = () => {
        db.close();
        if (dbPromise === openingPromise) dbPromise = null;
      };

      if (onSuccess) {
        try {
          await onSuccess(db);
        } catch (postConnectionHookError: unknown) {
          console.warn("[IDB-Kernel] onSuccess hook failed:", postConnectionHookError);
        }
      }

      if (settled) {
        db.close();
        return;
      }
      settled = true;
      clearTimeout(openTimeout);
      resolve(db);
    };

    idbOpenRequest.onerror = (dbOpeningError) => {
      fail(idbOpenRequest.error || dbOpeningError);
    };

    idbOpenRequest.onblocked = () => {
      console.warn(`[IDB-Kernel] Open blocked for ${dbName}; waiting for the bounded fallback.`);
    };
  });

  dbPromise = openingPromise;
  return openingPromise;
}

/**
 * Closes the active database connection and resets the singleton promise.
 */
export async function closeDB() {
  const activeDbPromise = dbPromise;
  dbPromise = null;
  if (!activeDbPromise) return;

  try {
    const db = await activeDbPromise;
    db.close();
  } catch {
    // A failed or timed-out open has no live connection to close.
  }
}

/**
 * Resets the singleton promise (used for testing).
 * @public
 */
export function resetDBPromise() {
  dbPromise = null;
}

function readMemoryValue<T>(key: string): T | null {
  return memoryStore.has(key) ? memoryStore.get(key) as T : null;
}

/**
 * Waits for a read request with a hard terminal deadline.
 */
function readFromStore<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new Error(`IndexedDB read timed out for ${key}`));
    }, STORAGE_REQUEST_TIMEOUT);

    function finish(value: T | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    }

    function fail(readError: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(readError);
    }

    try {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => finish((request.result as T) ?? null);
      request.onerror = () => fail(request.error || new Error(`IndexedDB read failed for ${key}`));
      transaction.onabort = () => fail(transaction.error || new Error(`IndexedDB read aborted for ${key}`));
    } catch (readError: unknown) {
      fail(readError);
    }
  });
}

/**
 * Resolves only after the containing write transaction commits.
 */
function commitStoreMutation(
  db: IDBDatabase,
  storeName: string,
  operation: string,
  mutate: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let transaction: IDBTransaction | null = null;
    const timeout = setTimeout(() => {
      try {
        transaction?.abort();
      } catch {
        // A completed transaction cannot be aborted and is settled below.
      }
      fail(new Error(`IndexedDB ${operation} timed out`));
    }, STORAGE_REQUEST_TIMEOUT);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    }

    function fail(writeError: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(writeError);
    }

    try {
      transaction = db.transaction(storeName, "readwrite");
      transaction.oncomplete = finish;
      transaction.onerror = () => fail(transaction?.error || new Error(`IndexedDB ${operation} failed`));
      transaction.onabort = () => fail(transaction?.error || new Error(`IndexedDB ${operation} aborted`));
      const request = mutate(transaction.objectStore(storeName));
      request.onerror = () => fail(request.error || new Error(`IndexedDB ${operation} request failed`));
    } catch (writeError: unknown) {
      fail(writeError);
    }
  });
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
    if (useMemoryStore) return readMemoryValue<T>(key);
    try {
      const db = await getDB();
      return await readFromStore<T>(db, storeName, key);
    } catch {
      // [THREAT:] Silent runtime failures in IDB operations can stall the UI thread.
      // [DECISION LOG] Runtime failures in IDB trigger an immediate degradation
      // to memory-only mode to preserve application responsiveness.
      useMemoryStore = true;
      return readMemoryValue<T>(key);
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
      await commitStoreMutation(db, storeName, `write for ${key}`, (store) => store.put(value, key));
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
      await commitStoreMutation(db, storeName, `delete for ${key}`, (store) => store.delete(key));
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
      await commitStoreMutation(db, storeName, "clear", (store) => store.clear());
    } catch {
      useMemoryStore = true;
      memoryStore.clear();
    }
  }
};
