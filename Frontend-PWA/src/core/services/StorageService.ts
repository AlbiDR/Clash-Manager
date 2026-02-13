const DB_NAME = "clash_manager_v11";
const STORE_NAME = "keyval";
const DB_VERSION = 1;

const LEGACY_DB_NAME = "clash_manager_db";
const LEGACY_STORE_NAME = "key_val_store";


// 🛡️ MEMORY FALLBACK
// Used when IndexedDB is unavailable (Private Browsing, Tests, etc)
const memoryStore = new Map<string, unknown>();
let useMemoryStore = false;

// Check IDB availability once
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
 */
async function migrateLegacyData(newDb: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const checkRequest = indexedDB.open(LEGACY_DB_NAME);
    
    checkRequest.onsuccess = () => {
      const oldDb = checkRequest.result;
      
      // If the old store doesn't exist, nothing to migrate
      if (!oldDb.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        oldDb.close();
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
            // We keep the old DB for one session to be safe, then let the system handle cleanup
            console.info("[Storage] Migration successful.");
            resolve();
          };
          newTx.onerror = () => {
            oldDb.close();
            resolve();
          };
        } else {
          oldDb.close();
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


export const idb = {
  async get<T>(key: string): Promise<T | null> {
    if (useMemoryStore) {
      return (memoryStore.get(key) as T) || null;
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
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

  async set(key: string, value: unknown): Promise<void> {
    if (useMemoryStore) {
      memoryStore.set(key, value);
      return;
    }

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        try {
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

  // Helper for Fix 23
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
          request.onsuccess = () => resolve();
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

const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

export async function loadCache(): Promise<any | null> {
  return idb.get<any>(CACHE_KEY_MAIN);
}

export async function saveCache(data: any): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}
