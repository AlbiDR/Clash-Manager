import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocking indexedDB before idb is imported
const mockRequest: any = {
  onsuccess: null,
  onerror: null,
  result: {
    close: vi.fn(),
  },
};

const mockIDB = {
  open: vi.fn(() => mockRequest),
  deleteDatabase: vi.fn(() => ({ onsuccess: null, onerror: null })),
};

vi.stubGlobal("indexedDB", mockIDB);

// Import idb
import { idb } from "@core/services/StorageService";

describe("idb utility", () => {
  beforeEach(async () => {
    // Reset internal state if possible, or just clear the store if it's using memory
    await idb.clear();
  });

  it("should store and retrieve values", async () => {
    await idb.set("test-key", "test-value");
    const value = await idb.get("test-key");
    expect(value).toBe("test-value");
  });

  it("should return null for non-existent keys", async () => {
    const value = await idb.get("non-existent");
    expect(value).toBe(null);
  });

  it("should delete values", async () => {
    await idb.set("to-delete", "value");
    await idb.del("to-delete");
    const value = await idb.get("to-delete");
    expect(value).toBe(null);
  });

  it("should clear all values", async () => {
    await idb.set("key1", "val1");
    await idb.set("key2", "val2");
    await idb.clear();
    expect(await idb.get("key1")).toBe(null);
    expect(await idb.get("key2")).toBe(null);
  });

  it("should handle complex objects", async () => {
    const complex = { foo: "bar", baz: [1, 2, 3], nested: { a: 1 } };
    await idb.set("complex", complex);
    const retrieved = await idb.get("complex");
    expect(retrieved).toEqual(complex);
  });

  it("should handle numeric values", async () => {
    await idb.set("num", 123.45);
    expect(await idb.get("num")).toBe(123.45);
  });

  it("should handle boolean values", async () => {
    await idb.set("bool", true);
    expect(await idb.get("bool")).toBe(true);
  });
});
