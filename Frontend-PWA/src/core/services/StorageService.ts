// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { openDB, idbCore, deleteDatabasePromise, closeDB, memoryStore, forceMemoryMode } from "../utils/idbKernel";
import {
  STORAGE_DB_NAME,
  STORAGE_STORE_NAME,
  STORAGE_DB_VERSION,
  STORAGE_LEGACY_DB_NAME,
  STORAGE_LEGACY_STORE_NAME,
  STORAGE_DEPRECATED_DB_NAMES
} from "../config";

/**
 * STORAGE SERVICE (Layer 1)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services).
 * - **Role:** Persistence engine providing resilient key-value storage backed by IndexedDB with in-memory fallback.
 * - **Satisfaction:** Satisfies ADR Section I: Core Services & Section III: Validation & Persistence Boundaries.
 *   Implements clinical isolation for data persistence, abstracting IndexedDB schema migration, legacy database purging,
 *   and graceful memory-store fallbacks.
 */

/**
 * Purges all known deprecated databases from disk asynchronously.
 *
 * @remarks
 * Iterates through `STORAGE_DEPRECATED_DB_NAMES` and issues explicit database deletion commands
 * for any legacy databases other than the active migration candidate.
 *
 * @returns Resolves once all deprecated databases have been purged or deletion attempts finish.
 */
async function purgeDeprecatedDatabases(): Promise<void> {
  // [DECISION LOG] Iterate over deprecated database names and asynchronously request deletion
  // to reclaim browser storage quota and prevent obsolete schema leakage across app upgrades.
  for (const dbName of STORAGE_DEPRECATED_DB_NAMES) {
    if (dbName !== STORAGE_LEGACY_DB_NAME) {
      await deleteDatabasePromise(dbName);
    }
  }
}

/**
 * Internal wrapper to open the IndexedDB database connection with object store creation and legacy migration bridge hooks.
 *
 * @remarks
 * Encapsulates IndexedDB lifecycle management via `idbKernel.openDB`, configuring standard store creation
 * on upgrade and triggering legacy migration when necessary.
 *
 * @returns A Promise resolving to an open IDBDatabase handle.
 */
function getStorageDB(): Promise<IDBDatabase> {
  return openDB(
    STORAGE_DB_NAME,
    STORAGE_DB_VERSION,
    (db) => {
      if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        db.createObjectStore(STORAGE_STORE_NAME);
      }
    },
    async (db) => {
      await migrateLegacyData(db);
    }
  );
}

/**
 * Tactical Migration Bridge: Migrates legacy key-value data from legacy store (`STORAGE_LEGACY_DB_NAME`) to the active store.
 *
 * @remarks
 * Satisfies ADR Section III: Persistence Boundaries.
 * Reads existing records from the legacy database, copies them to the active store, and purges the legacy database on completion.
 *
 * @param newDb - The newly opened active IDBDatabase instance.
 * @returns Resolves once migration completes or if no legacy database exists.
 */
async function migrateLegacyData(newDb: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    // [THREAT:] Accessing indexedDB in non-browser environment or SSR causes unhandled ReferenceError runtime crash.
    if (typeof indexedDB === "undefined") return resolve();
    const checkRequest = indexedDB.open(STORAGE_LEGACY_DB_NAME);
    
    checkRequest.onsuccess = () => {
      const oldDb = checkRequest.result;
      if (!oldDb.objectStoreNames.contains(STORAGE_LEGACY_STORE_NAME)) {
        oldDb.close();
        deleteDatabasePromise(STORAGE_LEGACY_DB_NAME)
          .then(() => purgeDeprecatedDatabases())
          .then(resolve);
        return;
      }

      const tx = oldDb.transaction(STORAGE_LEGACY_STORE_NAME, "readonly");
      const store = tx.objectStore(STORAGE_LEGACY_STORE_NAME);
      const getAllKeys = store.getAllKeys();
      const getAllValues = store.getAll();

      tx.oncomplete = async () => {
        const keys = getAllKeys.result;
        const values = getAllValues.result;
        
        if (keys.length > 0) {
          // [DECISION LOG] Batch copy legacy key-value pairs into active object store before dropping legacy database.
          console.info(`[Storage] Migrating ${keys.length} items from legacy database...`);
          const newTx = newDb.transaction(STORAGE_STORE_NAME, "readwrite");
          const newStore = newTx.objectStore(STORAGE_STORE_NAME);
          for (let recordIndex = 0; recordIndex < keys.length; recordIndex++) {
            newStore.put(values[recordIndex], keys[recordIndex]);
          }
          
          newTx.oncomplete = async () => {
            oldDb.close();
            await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
            await purgeDeprecatedDatabases();
            resolve();
          };
          newTx.onerror = async () => {
            oldDb.close();
            await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
            await purgeDeprecatedDatabases();
            resolve();
          };
        } else {
          oldDb.close();
          await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
          await purgeDeprecatedDatabases();
          resolve();
        }
      };
      
      tx.onerror = async () => {
        oldDb.close();
        await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
        await purgeDeprecatedDatabases();
        resolve();
      };
    };
    
    checkRequest.onerror = async () => {
      await purgeDeprecatedDatabases();
      resolve();
    };
  });
}

/**
 * Key-Value Storage Interface (`idb`)
 *
 * @remarks
 * Unified API exposing basic CRUD operations and administrative destruction commands over IndexedDB,
 * backed by automatic memory fallback in unsupported or restricted environments.
 */
export const idb = {
  /**
   * Retrieves a stored item by key from the active object store.
   *
   * @template T - The expected return type of the cached record.
   * @param key - The unique storage lookup key.
   * @returns Resolves with the typed item if found, or null if missing or unavailable.
   */
  async get<T>(key: string): Promise<T | null> {
    return idbCore.get<T>(key, getStorageDB, STORAGE_STORE_NAME);
  },

  /**
   * Stores or updates an item in the active object store.
   *
   * @param key - The unique storage record key.
   * @param value - The record payload to persist.
   * @returns Resolves when write operation completes.
   */
  async set(key: string, value: unknown): Promise<void> {
    return idbCore.set(key, value, getStorageDB, STORAGE_STORE_NAME);
  },

  /**
   * Deletes a record from the active object store by key.
   *
   * @param key - The storage record key to remove.
   * @returns Resolves when key deletion completes.
   */
  async del(key: string): Promise<void> {
    return idbCore.del(key, getStorageDB, STORAGE_STORE_NAME);
  },

  /**
   * Clears all records from the active object store and purges legacy databases.
   *
   * @returns Resolves when active store is cleared and legacy databases purged.
   */
  async clear(): Promise<void> {
    await idbCore.clear(getStorageDB, STORAGE_STORE_NAME);
    await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
    await purgeDeprecatedDatabases();
  },

  /**
   * Nuclear reset command: closes connection, deletes all application databases from disk,
   * wipes in-memory backup store, and forces fallback memory mode for the remainder of session.
   *
   * @remarks
   * [THREAT:] Persistent IndexedDB corruption can block app bootstrap or cause infinite re-hydration crashes.
   * [DECISION LOG] Destroy all database instances from disk, purge memory store, and force memory mode
   * to guarantee immediate recovery without requiring hard browser storage clearance.
   *
   * @returns Resolves when database connection is closed and disk/memory stores are wiped.
   */
  async destroyAll(): Promise<void> {
    await closeDB();
    await deleteDatabasePromise(STORAGE_DB_NAME);
    await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
    await purgeDeprecatedDatabases();
    memoryStore.clear();
    forceMemoryMode();
  },
};

/** Primary IndexedDB cache key for WebAppData persistence. */
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V8";

/**
 * Hydrates the cached application state from IndexedDB.
 *
 * @remarks
 * Satisfies ADR Section III: Cache Hydration.
 * Retrieves the raw WebAppData DTO snapshot stored under `CACHE_KEY_MAIN`.
 *
 * @returns Resolves with the raw cached payload if present, or null if uninitialized.
 */
export async function loadCache(): Promise<unknown | null> {
  // [DECISION LOG] Load raw snapshot from primary cache key in IndexedDB.
  return idb.get<unknown>(CACHE_KEY_MAIN);
}

/**
 * Persists an updated application state DTO snapshot to IndexedDB.
 *
 * @remarks
 * Satisfies ADR Section III: Cache Persistence.
 * Writes the given WebAppData payload under `CACHE_KEY_MAIN`.
 *
 * @param data - The WebAppData DTO snapshot or state payload to save.
 * @returns Resolves when the cache write operation completes.
 */
export async function saveCache(data: unknown): Promise<void> {
  // [DECISION LOG] Persist snapshot under primary cache key in IndexedDB.
  return idb.set(CACHE_KEY_MAIN, data);
}
