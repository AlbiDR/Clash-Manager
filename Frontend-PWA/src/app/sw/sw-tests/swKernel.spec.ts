// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { openDB, getValue, setValue } from "../swKernel";
import { STORAGE_DB_NAME, STORAGE_STORE_NAME, STORAGE_DB_VERSION } from "../../../core/config";

describe("swKernel", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", {
      open: vi.fn(),
    });
  });

  function createMockRequest(result?: any) {
    return {
      onsuccess: null as any,
      onerror: null as any,
      result,
      error: null as any,
    };
  }

  describe("openDB", () => {
    it("should resolve with IDBDatabase on success", async () => {
      const mockDb = { name: STORAGE_DB_NAME };
      const mockRequest = createMockRequest(mockDb);
      vi.mocked(indexedDB.open).mockReturnValue(mockRequest as any);

      const promise = openDB();

      // Simulate success
      if (mockRequest.onsuccess) mockRequest.onsuccess();

      const db = await promise;
      expect(db).toBe(mockDb);
      expect(indexedDB.open).toHaveBeenCalledWith(STORAGE_DB_NAME, STORAGE_DB_VERSION);
    });

    it("should reject with error on failure", async () => {
      const mockError = new Error("Open failed");
      const mockRequest = createMockRequest();
      mockRequest.error = mockError;
      vi.mocked(indexedDB.open).mockReturnValue(mockRequest as any);

      const promise = openDB();

      // Simulate error
      if (mockRequest.onerror) mockRequest.onerror();

      await expect(promise).rejects.toBe(mockError);
    });
  });

  describe("getValue", () => {
    it("should resolve with value on success", async () => {
      const mockValue = { foo: "bar" };
      const mockRequest = createMockRequest(mockValue);
      const mockStore = { get: vi.fn(() => mockRequest) };
      const mockTx = { objectStore: vi.fn(() => mockStore) };
      const mockDb = { transaction: vi.fn(() => mockTx) } as any;

      const promise = getValue(mockDb, "test-key");

      // Simulate success
      if (mockRequest.onsuccess) mockRequest.onsuccess();

      const result = await promise;
      expect(result).toBe(mockValue);
      expect(mockDb.transaction).toHaveBeenCalledWith([STORAGE_STORE_NAME], "readonly");
      expect(mockTx.objectStore).toHaveBeenCalledWith(STORAGE_STORE_NAME);
      expect(mockStore.get).toHaveBeenCalledWith("test-key");
    });

    it("should resolve with null on error", async () => {
      const mockRequest = createMockRequest();
      const mockStore = { get: vi.fn(() => mockRequest) };
      const mockTx = { objectStore: vi.fn(() => mockStore) };
      const mockDb = { transaction: vi.fn(() => mockTx) } as any;

      const promise = getValue(mockDb, "test-key");

      // Simulate error
      if (mockRequest.onerror) mockRequest.onerror();

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe("setValue", () => {
    it("should resolve on success", async () => {
      const mockRequest = createMockRequest();
      const mockStore = { put: vi.fn(() => mockRequest) };
      const mockTx = { objectStore: vi.fn(() => mockStore) };
      const mockDb = { transaction: vi.fn(() => mockTx) } as any;

      const promise = setValue(mockDb, "test-key", "test-value");

      // Simulate success
      if (mockRequest.onsuccess) mockRequest.onsuccess();

      await expect(promise).resolves.toBeUndefined();
      expect(mockDb.transaction).toHaveBeenCalledWith([STORAGE_STORE_NAME], "readwrite");
      expect(mockTx.objectStore).toHaveBeenCalledWith(STORAGE_STORE_NAME);
      expect(mockStore.put).toHaveBeenCalledWith("test-value", "test-key");
    });

    it("should reject on failure", async () => {
      const mockError = new Error("Put failed");
      const mockRequest = createMockRequest();
      mockRequest.error = mockError;
      const mockStore = { put: vi.fn(() => mockRequest) };
      const mockTx = { objectStore: vi.fn(() => mockStore) };
      const mockDb = { transaction: vi.fn(() => mockTx) } as any;

      const promise = setValue(mockDb, "test-key", "test-value");

      // Simulate error
      if (mockRequest.onerror) mockRequest.onerror();

      await expect(promise).rejects.toBe(mockError);
    });
  });
});
