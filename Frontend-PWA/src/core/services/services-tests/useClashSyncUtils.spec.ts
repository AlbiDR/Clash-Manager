// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SYNC_REQUEST_TIMEOUT_MS,
  createEmptyWebAppData,
  fetchRemoteWithTimeout,
  normalizeSyncError,
} from "../useClashSyncUtils";
import { fetchRemote } from "../../api/SupabaseClient";

vi.mock("../../api/SupabaseClient", () => ({
  fetchRemote: vi.fn(),
}));

describe("useClashSyncUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("SYNC_REQUEST_TIMEOUT_MS", () => {
    it("should export a cold-start-tolerant 25000ms timeout", () => {
      expect(SYNC_REQUEST_TIMEOUT_MS).toBe(25000);
    });
  });

  describe("createEmptyWebAppData", () => {
    it("should return a clean empty WebAppData structure", () => {
      const emptyData = createEmptyWebAppData();
      expect(emptyData).toEqual({
        lb: [],
        hh: [],
        timestamp: 0,
        blacklist: [],
      });
    });
  });

  describe("normalizeSyncError", () => {
    it("should return the exact Error object if input is an Error instance", () => {
      const err = new Error("Custom error");
      expect(normalizeSyncError(err)).toBe(err);
    });

    it("should wrap non-Error values in a generic Error instance", () => {
      const normalizedString = normalizeSyncError("Network string error");
      expect(normalizedString).toBeInstanceOf(Error);
      expect(normalizedString.message).toBe("Sync failed");

      const normalizedObj = normalizeSyncError({ status: 500 });
      expect(normalizedObj).toBeInstanceOf(Error);
      expect(normalizedObj.message).toBe("Sync failed");

      const normalizedNull = normalizeSyncError(null);
      expect(normalizedNull).toBeInstanceOf(Error);
      expect(normalizedNull.message).toBe("Sync failed");
    });
  });

  describe("fetchRemoteWithTimeout", () => {
    it("should resolve remote data when fetch succeeds within timeout", async () => {
      const mockResult = { lb: [{ id: "TAG1" }], hh: [], timestamp: 100, blacklist: [] };
      vi.mocked(fetchRemote).mockResolvedValueOnce(mockResult);

      const res = await fetchRemoteWithTimeout({ force: true });
      expect(res).toEqual(mockResult);
      expect(fetchRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should reject with original error when fetchRemote fails before timeout", async () => {
      const fetchError = new Error("Fetch failed");
      vi.mocked(fetchRemote).mockRejectedValueOnce(fetchError);

      await expect(fetchRemoteWithTimeout({ force: false })).rejects.toThrow("Fetch failed");
    });

    it("should reject with 'Sync timed out' error and abort signal when timeout expires", async () => {
      vi.useFakeTimers();

      let fetchSignal: AbortSignal | undefined;
      vi.mocked(fetchRemote).mockImplementationOnce((options) => {
        fetchSignal = options?.signal;
        return new Promise(() => {}); // Stalled promise
      });

      const fetchPromise = fetchRemoteWithTimeout({ force: false }).catch((err) => err);

      // Fast-forward past timeout
      await vi.advanceTimersByTimeAsync(SYNC_REQUEST_TIMEOUT_MS);

      const err = await fetchPromise;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("Sync timed out");
      expect(fetchSignal?.aborted).toBe(true);
      expect(fetchSignal?.reason).toBeInstanceOf(Error);
      expect((fetchSignal?.reason as Error).message).toBe("Sync timed out");
    });
  });
});
