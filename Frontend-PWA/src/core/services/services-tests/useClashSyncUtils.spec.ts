// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SYNC_REQUEST_TIMEOUT_MS,
  SYNC_RETRY_DELAYS_MS,
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
    vi.resetAllMocks();
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
      expect(fetchRemote).toHaveBeenCalledTimes(1);
      expect(fetchRemote).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          force: true,
          signal: expect.any(AbortSignal),
        })
      );
    });

    it("should reject with original error when fetchRemote fails before timeout with non-transient error", async () => {
      const fetchError = new Error("401 Unauthorized");
      vi.mocked(fetchRemote).mockRejectedValueOnce(fetchError);

      await expect(fetchRemoteWithTimeout({ force: false })).rejects.toThrow("401 Unauthorized");
      expect(fetchRemote).toHaveBeenCalledTimes(1);
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

    describe("Transient Retry Engine", () => {
      it("should retry transient HTTP 503 error after backoff and resolve when second attempt succeeds", async () => {
        vi.useFakeTimers();

        const mockResult = { lb: [], hh: [], timestamp: 200, blacklist: [] };
        const transientError = new Error("503 Service Unavailable");

        vi.mocked(fetchRemote)
          .mockRejectedValueOnce(transientError)
          .mockResolvedValueOnce(mockResult);

        const fetchPromise = fetchRemoteWithTimeout({ force: true });

        // First attempt failed; now waiting in 400ms backoff
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);

        const res = await fetchPromise;
        expect(res).toEqual(mockResult);
        expect(fetchRemote).toHaveBeenCalledTimes(2);
        expect(fetchRemote).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ force: true, signal: expect.any(AbortSignal) })
        );
        expect(fetchRemote).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ force: true, signal: expect.any(AbortSignal) })
        );
      });

      it("should retry Undici TypeError fetch failed and statement timeout transient errors", async () => {
        vi.useFakeTimers();

        const mockResult = { lb: [], hh: [], timestamp: 300, blacklist: [] };
        const statementTimeoutError = new Error("canceling statement due to statement timeout");
        const undiciFetchError = new TypeError("fetch failed");

        vi.mocked(fetchRemote)
          .mockRejectedValueOnce(statementTimeoutError)
          .mockRejectedValueOnce(undiciFetchError)
          .mockResolvedValueOnce(mockResult);

        const fetchPromise = fetchRemoteWithTimeout({ force: false });

        // Advance past first backoff delay (400ms)
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
        // Advance past second backoff delay (2000ms)
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[1]);

        const res = await fetchPromise;
        expect(res).toEqual(mockResult);
        expect(fetchRemote).toHaveBeenCalledTimes(3);
      });

      it("should exhaust all retries when transient error persists and reject with final failure", async () => {
        vi.useFakeTimers();

        const persistentTransientError = new Error("504 Gateway Timeout");

        vi.mocked(fetchRemote).mockRejectedValue(persistentTransientError);

        const fetchPromise = fetchRemoteWithTimeout({ force: true }).catch((err) => err);

        // Advance through all three backoff delays (400ms, 2000ms, 5000ms)
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[0]);
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[1]);
        await vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAYS_MS[2]);

        const err = await fetchPromise;
        expect(err).toBe(persistentTransientError);
        expect(fetchRemote).toHaveBeenCalledTimes(4); // Initial + 3 retries
      });

      it("should abort retry backoff delay immediately if caller AbortSignal is triggered during backoff", async () => {
        vi.useFakeTimers();

        const transientError = new Error("Network request failed");
        vi.mocked(fetchRemote).mockRejectedValueOnce(transientError);

        const controller = new AbortController();
        const fetchPromise = fetchRemoteWithTimeout({
          force: false,
          signal: controller.signal,
        }).catch((err) => err);

        // Wait a microtask so initial fetch fails and enters waitForRetry
        await vi.advanceTimersByTimeAsync(0);

        // Abort during backoff delay
        const abortReason = new Error("User cancelled sync");
        controller.abort(abortReason);

        const err = await fetchPromise;
        expect(err).toBe(abortReason);
        expect(fetchRemote).toHaveBeenCalledTimes(1);
      });

      it("should handle pre-aborted caller signal and reject with caller abort reason", async () => {
        const controller = new AbortController();
        const preAbortReason = new Error("Pre-aborted by caller");
        controller.abort(preAbortReason);

        vi.mocked(fetchRemote).mockImplementationOnce(({ signal }) => {
          if (signal?.aborted) {
            return Promise.reject(signal.reason);
          }
          return Promise.resolve({ lb: [], hh: [], timestamp: 0, blacklist: [] });
        });

        const fetchPromise = fetchRemoteWithTimeout({
          force: false,
          signal: controller.signal,
        }).catch((err) => err);

        const err = await fetchPromise;
        expect(err).toBe(preAbortReason);
        expect(fetchRemote).toHaveBeenCalledTimes(1);
      });
    });
  });
});
