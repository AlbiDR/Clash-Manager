// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("idbKernel", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function createMockRequest(result?: any) {
    return {
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
      onblocked: null as any,
      result,
      error: null as any,
    };
  }

  const mockIndexedDB = {
    open: vi.fn(() => createMockRequest()),
    deleteDatabase: vi.fn(() => createMockRequest())
  };

  describe("Environment Initialization", () => {
    it("should default to memory mode if indexedDB is undefined", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const { useMemoryStore } = await import("../idbKernel");
      expect(useMemoryStore).toBe(true);
    });

    it("should default to memory mode if indexedDB.open throws", async () => {
      vi.stubGlobal("indexedDB", {
        open: () => { throw new Error("Security Error"); },
        deleteDatabase: vi.fn()
      });
      const { useMemoryStore } = await import("../idbKernel");
      expect(useMemoryStore).toBe(true);
    });

    it("should attempt to open and close a check database if available", async () => {
      const closeMock = vi.fn();
      const deleteMock = vi.fn(() => createMockRequest());
      vi.stubGlobal("indexedDB", {
        open: vi.fn((name) => {
          const req = createMockRequest({ close: closeMock });
          if (name === "CM_KERNEL_CHECK") {
            setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
          }
          return req;
        }),
        deleteDatabase: deleteMock
      });

      const kernel = await import("../idbKernel");
      await new Promise(r => setTimeout(r, 20));

      expect(kernel.useMemoryStore).toBe(false);
      expect(closeMock).toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalledWith("CM_KERNEL_CHECK");
    });
  });

  describe("Core Utilities", () => {
    it("forceMemoryMode should set useMemoryStore to true", async () => {
      const kernel = await import("../idbKernel");
      kernel.forceMemoryMode();
      expect(kernel.useMemoryStore).toBe(true);
    });

    it("deleteDatabasePromise should resolve on success", async () => {
      vi.stubGlobal("indexedDB", {
        deleteDatabase: vi.fn(() => {
          const req = createMockRequest();
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        })
      });
      const { deleteDatabasePromise } = await import("../idbKernel");
      await expect(deleteDatabasePromise("test-db")).resolves.toBeUndefined();
    });

    it("deleteDatabasePromise should resolve on error", async () => {
      vi.stubGlobal("indexedDB", {
        deleteDatabase: vi.fn(() => {
          const req = createMockRequest();
          setTimeout(() => req.onerror && req.onerror(), 0);
          return req;
        })
      });
      const { deleteDatabasePromise } = await import("../idbKernel");
      await expect(deleteDatabasePromise("test-db")).resolves.toBeUndefined();
    });

    it("deleteDatabasePromise should resolve after timeout if blocked", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("indexedDB", {
        deleteDatabase: vi.fn(() => createMockRequest())
      });
      const { deleteDatabasePromise } = await import("../idbKernel");

      const promise = deleteDatabasePromise("test-db");
      const req = vi.mocked(indexedDB.deleteDatabase).mock.results[0].value;
      req.onblocked();

      vi.advanceTimersByTime(1500);
      vi.useRealTimers();
      await promise;
    });
  });

  describe("Database Lifecycle (openDB / closeDB)", () => {
    it("openDB should reuse the same internal promise", async () => {
      vi.stubGlobal("indexedDB", {
        open: vi.fn((name) => {
          const req = createMockRequest({ close: vi.fn() });
          if (name === "CM_KERNEL_CHECK") {
            setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
          } else {
            setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
          }
          return req;
        }),
        deleteDatabase: vi.fn(() => createMockRequest())
      });

      const kernel = await import("../idbKernel");
      kernel.resetDBPromise();

      await new Promise(r => setTimeout(r, 20));

      const p1 = kernel.openDB("db", 1, () => {});
      const p2 = kernel.openDB("db", 1, () => {});

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe(res2);
    });

    it("openDB should trigger onUpgrade hook", async () => {
      vi.stubGlobal("indexedDB", mockIndexedDB);
      const { openDB, resetDBPromise } = await import("../idbKernel");
      resetDBPromise();
      const onUpgrade = vi.fn();

      openDB("db", 1, onUpgrade);

      const openCall = vi.mocked(indexedDB.open).mock.calls.find(call => call[0] === "db");
      const callIndex = vi.mocked(indexedDB.open).mock.calls.indexOf(openCall!);
      const req = vi.mocked(indexedDB.open).mock.results[callIndex].value;

      const mockDb = { name: "mock-db" };
      req.onupgradeneeded({ target: { result: mockDb } });

      expect(onUpgrade).toHaveBeenCalledWith(mockDb);
    });

    it("openDB should handle onSuccess failure gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("indexedDB", {
        open: vi.fn((name) => {
          const req = createMockRequest({ name });
          if (name === "db") {
            setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
          }
          return req;
        }),
        deleteDatabase: vi.fn(() => createMockRequest())
      });
      const { openDB, resetDBPromise } = await import("../idbKernel");
      resetDBPromise();

      await openDB("db", 1, () => {}, async () => {
        throw new Error("hook failed");
      });

      expect(consoleSpy).toHaveBeenCalledWith("[IDB-Kernel] onSuccess hook failed:", expect.any(Error));
      consoleSpy.mockRestore();
    });

    it("closeDB should close the connection and reset the singleton", async () => {
      const closeMock = vi.fn();
      vi.stubGlobal("indexedDB", {
        open: vi.fn((name) => {
          const req = createMockRequest({ close: closeMock });
          if (name === "db") {
            setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
          }
          return req;
        }),
        deleteDatabase: vi.fn(() => createMockRequest())
      });
      const { openDB, closeDB, resetDBPromise } = await import("../idbKernel");
      resetDBPromise();

      await openDB("db", 1, () => {});
      await closeDB();

      expect(closeMock).toHaveBeenCalled();
    });
  });

  describe("idbCore Operations", () => {
    it("idbCore.get should use memory fallback if useMemoryStore is true", async () => {
      const { idbCore, memoryStore, forceMemoryMode } = await import("../idbKernel");
      forceMemoryMode();
      memoryStore.set("k1", "v1");

      const val = await idbCore.get("k1", async () => ({} as any), "store");
      expect(val).toBe("v1");
    });

    it("idbCore.get should work with IndexedDB", async () => {
      vi.stubGlobal("indexedDB", mockIndexedDB);
      const kernel = await import("../idbKernel");

      const req = createMockRequest("v2");
      const store = { get: vi.fn(() => req) };
      const tx = { objectStore: vi.fn(() => store) };
      const mockDb = { transaction: vi.fn(() => tx) };

      const promise = kernel.idbCore.get("k2", async () => mockDb as any, "store");

      await vi.waitFor(() => {
        if (!req.onsuccess) req.onsuccess = () => {};
      }, { timeout: 2000 });

      req.onsuccess();

      expect(await promise).toBe("v2");
    });

    it("idbCore.set should handle getDB failure and fallback", async () => {
      vi.stubGlobal("indexedDB", mockIndexedDB);
      const kernel = await import("../idbKernel");

      await kernel.idbCore.set("err", "val", async () => { throw new Error("getDB Failed"); }, "store");

      expect(kernel.memoryStore.get("err")).toBe("val");
      expect(kernel.useMemoryStore).toBe(true);
    });

    it("idbCore.del should work with IndexedDB", async () => {
      vi.stubGlobal("indexedDB", mockIndexedDB);
      const kernel = await import("../idbKernel");
      const req = createMockRequest();
      const store = { delete: vi.fn(() => req) };
      const tx = { objectStore: vi.fn(() => store) };
      const mockDb = { transaction: vi.fn(() => tx) };

      const promise = kernel.idbCore.del("k1", async () => mockDb as any, "store");

      await vi.waitFor(() => {
        if (!req.onsuccess) req.onsuccess = () => {};
      }, { timeout: 2000 });

      req.onsuccess();
      await promise;
      expect(store.delete).toHaveBeenCalledWith("k1");
    });

    it("idbCore.clear should work with IndexedDB", async () => {
      vi.stubGlobal("indexedDB", mockIndexedDB);
      const kernel = await import("../idbKernel");
      const req = createMockRequest();
      const store = { clear: vi.fn(() => req) };
      const tx = { objectStore: vi.fn(() => store) };
      const mockDb = { transaction: vi.fn(() => tx) };

      const promise = kernel.idbCore.clear(async () => mockDb as any, "store");

      await vi.waitFor(() => {
        if (!req.onsuccess) req.onsuccess = () => {};
      }, { timeout: 2000 });

      req.onsuccess();
      await promise;
      expect(store.clear).toHaveBeenCalled();
    });

    it("should handle IDB request errors", async () => {
      vi.stubGlobal("indexedDB", mockIndexedDB);
      const kernel = await import("../idbKernel");
      const req = createMockRequest();
      const store = { get: vi.fn(() => req) };
      const tx = { objectStore: vi.fn(() => store) };
      const mockDb = { transaction: vi.fn(() => tx) };

      const promise = kernel.idbCore.get("fail", async () => mockDb as any, "store");

      await vi.waitFor(() => {
        if (!req.onerror) req.onerror = () => {};
      }, { timeout: 2000 });

      req.error = new Error("IDB Error");
      req.onerror();

      await expect(promise).rejects.toThrow("IDB Error");
    });
  });
});
