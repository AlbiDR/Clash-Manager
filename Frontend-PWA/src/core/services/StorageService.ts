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
 * ----------------------------------------------------------------------------
 * Rationale: Provides a resilient persistence layer for the application using
 * IndexedDB with a robust in-memory fallback.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * The Storage Service implements a "Clinical" isolation pattern for data
 * persistence. It abstracts the complexities of IndexedDB and provides a
 * unified interface for CRUD operations.
 */

/**
 * Purges all known deprecated databases from disk.
 */
async function purgeDeprecatedDatabases(): Promise<void> {
  for (const dbName of STORAGE_DEPRECATED_DB_NAMES) {
    if (dbName !== STORAGE_LEGACY_DB_NAME) {
      await deleteDatabasePromise(dbName);
    }
  }
}

/**
 * Internal wrapper to open the IndexedDB connection with migration bridge.
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
 * Tactical Bridge: Migrates data from clash_manager_db (v2) to clash_manager_v11.
 */
async function migrateLegacyData(newDb: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
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
          console.info(`[Storage] Migrating ${keys.length} items from legacy database...`);
          const newTx = newDb.transaction(STORAGE_STORE_NAME, "readwrite");
          const newStore = newTx.objectStore(STORAGE_STORE_NAME);
          for (let i = 0; i < keys.length; i++) {
            newStore.put(values[i], keys[i]);
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
 * Key-Value Storage Interface (idb)
 */
export const idb = {
  async get<T>(key: string): Promise<T | null> {
    return idbCore.get<T>(key, getStorageDB, STORAGE_STORE_NAME);
  },

  async set(key: string, value: unknown): Promise<void> {
    return idbCore.set(key, value, getStorageDB, STORAGE_STORE_NAME);
  },

  async del(key: string): Promise<void> {
    return idbCore.del(key, getStorageDB, STORAGE_STORE_NAME);
  },

  async clear(): Promise<void> {
    await idbCore.clear(getStorageDB, STORAGE_STORE_NAME);
    await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
    await purgeDeprecatedDatabases();
  },

  async destroyAll(): Promise<void> {
    await closeDB();
    await deleteDatabasePromise(STORAGE_DB_NAME);
    await deleteDatabasePromise(STORAGE_LEGACY_DB_NAME);
    await purgeDeprecatedDatabases();
    memoryStore.clear();
    forceMemoryMode();
  },
};

const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V8";

export async function loadCache(): Promise<unknown | null> {
  return idb.get<unknown>(CACHE_KEY_MAIN);
}

export async function saveCache(data: unknown): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}
