// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** This service is a terminal leaf in the dependency
 *   graph for infrastructure. It must not import from any other services
 *   beyond utility libraries.
 *
 * **Resilience Strategy:**
 * If IndexedDB is unavailable (e.g., Private Browsing or restricted environments),
 * the service automatically switches to an ephemeral `memoryStore` to prevent
 * application-wide crashes, adhering to the "Fail Safely" principle.
 */

const DB_NAME = "clash_manager_v11";
const STORE_NAME = "keyval";
const DB_VERSION = 1;

const LEGACY_DB_NAME = "clash_manager_db";
const LEGACY_STORE_NAME = "key_val_store";


// 🛡️ MEMORY FALLBACK
// Used when IndexedDB is unavailable (Private Browsing, Tests, etc)
const memoryStore = new Map<string, unknown>();
let useMemoryStore = false;

// [GUARD] ENVIRONMENT CHECK
// Check IDB availability once to determine if we need the memory fallback.
if (typeof indexedDB === "undefined") {
  useMemoryStore = true;
} else {
  try {
    // Some private browsing modes expose the symbol but fail on open
    const req = indexedDB.open("test-db");
    req.onerror = () => {
      useMemoryStore = true;
    };
    req.onsuccess = () => {
      if (req.result && typeof req.result.close === "function") {
        req.result.close();
      }
      indexedDB.deleteDatabase("test-db");
    };
  } catch (e) {
    useMemoryStore = true;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Internal factory to open the IndexedDB connection.
 * Implements a singleton promise to avoid race conditions during initialization.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (useMemoryStore || typeof indexedDB === "undefined") {
      dbPromise = null;
      return reject(new Error("IDB Unsupported"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = async () => {
      const db = request.result;
      
      // LEGACY MIGRATION BRIDGE (Phase 1.2 / 5.1 Protocol)
      // Rationale: Ensure users migrating from legacy versions do not lose data.
      try {
        await migrateLegacyData(db);
      } catch (err) {
        console.warn("[Storage] Migration failed, continuing with fresh state", err);
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
 * Tactical Bridge: Migrates data from clash_manager_db (v2) to clash_manager_v11.
 * This is an idempotent operation that only runs if the legacy database is found.
 */
async function migrateLegacyData(newDb: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const checkRequest = indexedDB.open(LEGACY_DB_NAME);
    
    checkRequest.onsuccess = () => {
      const oldDb = checkRequest.result;
      
      // If the old store doesn't exist, nothing to migrate
      if (!oldDb.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        oldDb.close();
        try {
          indexedDB.deleteDatabase(LEGACY_DB_NAME);
        } catch (err) {}
        return resolve();
      }

      const tx = oldDb.transaction(LEGACY_STORE_NAME, "readonly");
      const store = tx.objectStore(LEGACY_STORE_NAME);
      const getAllKeys = store.getAllKeys();
      const getAllValues = store.getAll();

      tx.oncomplete = async () => {
        const keys = getAllKeys.result;
        const values = getAllValues.result;
        
        if (keys.length > 0) {
          console.info(`[Storage] Migrating ${keys.length} items from legacy database...`);
          const newTx = newDb.transaction(STORE_NAME, "readwrite");
          const newStore = newTx.objectStore(STORE_NAME);
          
          for (let i = 0; i < keys.length; i++) {
            newStore.put(values[i], keys[i]);
          }
          
          newTx.oncomplete = () => {
            oldDb.close();
            // Delete the legacy database to prevent ghost migrations on future sessions
            try {
              indexedDB.deleteDatabase(LEGACY_DB_NAME);
              console.info("[Storage] Legacy database cleaned up successfully.");
            } catch (err) {
              console.warn("[Storage] Failed to delete legacy database", err);
            }
            console.info("[Storage] Migration successful.");
            resolve();
          };
          newTx.onerror = () => {
            oldDb.close();
            resolve();
          };
        } else {
          oldDb.close();
          try {
            indexedDB.deleteDatabase(LEGACY_DB_NAME);
          } catch (err) {}
          resolve();
        }
      };
      
      tx.onerror = () => {
        oldDb.close();
        resolve();
      };
    };
    
    checkRequest.onerror = () => resolve();
  });
}

/**
 * Key-Value Storage Interface (idb)
 *
 * @remarks
 * A thin wrapper around IndexedDB providing a Promise-based API for storage operations.
 * Automatically falls back to memory storage if IndexedDB fails at runtime.
 */
export const idb = {
  /**
   * Retrieves a value from storage by its key.
   * @param key - The unique identifier for the stored item.
   * @returns A promise resolving to the value, or null if not found.
   */
  async get<T>(key: string): Promise<T | null> {
    if (useMemoryStore) {
      return (memoryStore.get(key) as T) || null;
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
          // [GUARD] TRANSACTIONAL INTEGRITY: Read-only transaction for safety.
          const transaction = db.transaction(STORE_NAME, "readonly");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(key);
          request.onsuccess = () => resolve((request.result as T) || null);
          request.onerror = () => reject(request.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      // Fallback to memory if openDB fails at runtime
      useMemoryStore = true;
      return (memoryStore.get(key) as T) || null;
    }
  },

  /**
   * Persists a value to storage.
   * @param key - The unique identifier for the item.
   * @param value - The data to persist.
   */
  async set(key: string, value: unknown): Promise<void> {
    if (useMemoryStore) {
      memoryStore.set(key, value);
      return;
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
          // [GUARD] TRANSACTIONAL INTEGRITY: Read-write transaction.
          const transaction = db.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.put(value, key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.set(key, value);
    }
  },

  /**
   * Deletes an item from storage by its key.
   * @param key - The key of the item to remove.
   */
  async del(key: string): Promise<void> {
    if (useMemoryStore) {
      memoryStore.delete(key);
      return;
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.delete(key);
    }
  },

  /**
   * Purges all data from the primary object store.
   * @warning This operation is destructive and cannot be undone.
   */
  async clear(): Promise<void> {
    if (useMemoryStore) {
      memoryStore.clear();
      return;
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.clear();
          request.onsuccess = () => {
            try {
              indexedDB.deleteDatabase(LEGACY_DB_NAME);
            } catch (err) {
              console.warn("[Storage] Failed to delete legacy database during clear", err);
            }
            resolve();
          };
          request.onerror = () => reject(request.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      useMemoryStore = true;
      memoryStore.clear();
    }
  },
};

const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V8";

/**
 * Specific utility to load the main application dataset from cache.
 * @returns The cached dataset or null if empty.
 */
export async function loadCache(): Promise<unknown | null> {
  return idb.get<unknown>(CACHE_KEY_MAIN);
}

/**
 * Specific utility to persist the main application dataset to cache.
 * @param data - The dataset to save.
 */
export async function saveCache(data: unknown): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}
