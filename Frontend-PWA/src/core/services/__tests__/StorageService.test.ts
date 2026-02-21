import { describe, it, expect, vi, beforeEach } from "vitest";

describe("StorageService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("IndexedDB Mode", () => {
    it("should store and retrieve values via IndexedDB", async () => {
      const storeMock = {
        put: vi.fn(() => {
          const req: any = { onsuccess: null };
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        }),
        get: vi.fn(() => {
          const req: any = { onsuccess: null, result: "idb-value" };
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        }),
        delete: vi.fn(() => {
          const req: any = { onsuccess: null };
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        }),
        clear: vi.fn(() => {
          const req: any = { onsuccess: null };
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        }),
      };

      const dbMock = {
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => storeMock),
          oncomplete: null,
        })),
        objectStoreNames: { contains: vi.fn((name) => name === "keyval") },
        close: vi.fn(),
      };

      vi.stubGlobal("indexedDB", {
        open: vi.fn((name) => {
          const req: any = { onsuccess: null, onerror: null, result: dbMock };
          if (name === "test-db") {
            req.result = { close: vi.fn() };
          }
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess();
          }, 0);
          return req;
        }),
        deleteDatabase: vi.fn(() => ({})),
      });

      const { idb } = await import("../StorageService");

      // Wait for all internal promises to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      await idb.set("test-key", "test-value");
      expect(storeMock.put).toHaveBeenCalledWith("test-value", "test-key");

      const value = await idb.get("test-key");
      expect(value).toBe("idb-value");

      await idb.del("test-key");
      expect(storeMock.delete).toHaveBeenCalledWith("test-key");

      await idb.clear();
      expect(storeMock.clear).toHaveBeenCalled();
    });
  });

  describe("Memory Mode (Fallback)", () => {
    it("should fallback to memory when indexedDB is undefined", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const { idb } = await import("../StorageService");

      await idb.set("test-key", "test-value");
      const value = await idb.get("test-key");
      expect(value).toBe("test-value");
    });

    it("should handle all idb operations in memory mode", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const { idb } = await import("../StorageService");

      await idb.set("a", 1);
      await idb.set("b", 2);
      expect(await idb.get("a")).toBe(1);

      await idb.del("a");
      expect(await idb.get("a")).toBe(null);
      expect(await idb.get("b")).toBe(2);

      await idb.clear();
      expect(await idb.get("b")).toBe(null);
    });
  });

  describe("Cache Helpers", () => {
    it("saveCache and loadCache should work in memory mode", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const { saveCache, loadCache } = await import("../StorageService");

      const data = { lb: [{ name: "Clan A" }], hh: [], timestamp: Date.now() };
      await saveCache(data);
      const loaded = await loadCache();
      expect(loaded).toEqual(data);
    });
  });
});
