// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("StorageService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function createMockRequest(result?: any) {
    return {
      onsuccess: null as any,
      onerror: null as any,
      result,
    };
  }

  describe("Basic API & Memory Fallback", () => {
    it("should work in memory mode when IDB is missing", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const { idb } = await import("../StorageService");

      await idb.set("test", "value");
      expect(await idb.get("test")).toBe("value");

      await idb.del("test");
      expect(await idb.get("test")).toBeNull();

      await idb.set("a", 1);
      await idb.clear();
      expect(await idb.get("a")).toBeNull();
    });

    it("should fallback to memory if openDB fails", async () => {
      vi.stubGlobal("indexedDB", {
        open: (name: string) => {
          const req = createMockRequest();
          if (name === "test-db") {
            req.result = { close: vi.fn() };
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          } else {
            setTimeout(() => req.onerror && req.onerror({ target: { error: "FAIL" } }), 0);
          }
          return req;
        },
        deleteDatabase: vi.fn(() => {
          const req = createMockRequest();
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        })
      });

      const { idb } = await import("../StorageService");
      await new Promise(r => setTimeout(r, 20));

      await idb.set("foo", "bar");
      expect(await idb.get("foo")).toBe("bar");
    });
  });

  describe("Cache Helpers", () => {
    it("saveCache and loadCache should work correctly", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const { saveCache, loadCache } = await import("../StorageService");

      const mockData = { lb: [{ name: "Clan A" }], timestamp: 123456789 };
      await saveCache(mockData);
      const loaded = await loadCache();

      expect(loaded).toEqual(mockData);
    });
  });

  describe("Migration Engine", () => {
    it("should migrate data if legacy DB exists", async () => {
      let legacyPutCalled = false;

      const legacyStore = {
        getAllKeys: () => {
          const req = createMockRequest(["migrated_key"]);
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        },
        getAll: () => {
          const req = createMockRequest(["migrated_value"]);
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        }
      };

      const legacyTx = {
        objectStore: () => legacyStore,
        oncomplete: null as any,
        onerror: null as any,
      };

      const legacyDb = {
        objectStoreNames: { contains: (n: string) => n === "key_val_store" },
        transaction: () => legacyTx,
        close: vi.fn()
      };

      const newStore = {
        put: (val: any, key: any) => {
          if (key === "migrated_key" && val === "migrated_value") {
            legacyPutCalled = true;
          }
          return createMockRequest();
        },
        get: () => {
          const req = createMockRequest();
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        }
      };

      const newTx = {
        objectStore: () => newStore,
        oncomplete: null as any,
        onerror: null as any,
      };

      const newDb = {
        objectStoreNames: { contains: () => true },
        transaction: () => newTx,
        close: vi.fn()
      };

      vi.stubGlobal("indexedDB", {
        open: (name: string) => {
          const req = createMockRequest();
          if (name === "test-db") {
            req.result = { close: vi.fn() };
          } else if (name === "clash_manager_v11") {
            req.result = newDb;
          } else if (name === "clash_manager_db") {
            req.result = legacyDb;
          }
          setTimeout(() => {
            if (req.onsuccess) {
               req.onsuccess();
               if (name === "clash_manager_db") {
                  setTimeout(() => {
                    if (legacyTx.oncomplete) legacyTx.oncomplete();
                    setTimeout(() => {
                      if (newTx.oncomplete) newTx.oncomplete();
                    }, 10);
                  }, 10);
               }
            }
          }, 0);
          return req;
        },
        deleteDatabase: vi.fn(() => {
          const req = createMockRequest();
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        })
      });

      const { idb } = await import("../StorageService");
      await new Promise(r => setTimeout(r, 50));

      await idb.get("trigger");
      await new Promise(r => setTimeout(r, 100));

      expect(legacyPutCalled).toBe(true);
      expect(legacyDb.close).toHaveBeenCalled();
    });
  });
});
