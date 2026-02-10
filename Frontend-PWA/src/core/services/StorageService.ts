const DB_NAME = "clash_manager_db";
const STORE_NAME = "key_val_store";
// Fix 27: Version Bump
const DB_VERSION = 2;

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

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => {
      dbPromise = null;
      reject(request.error || e);
    };
  });

  return dbPromise;
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
