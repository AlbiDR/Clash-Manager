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
  getBackgroundBackoffSpan,
  describeSyncFailure,
  classifySyncFailure,
  SYNC_FAILURE_FALLBACK,
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

  });

  describe("getBackgroundBackoffSpan", () => {
    it("should calculate exponential backoff bounded by BACKGROUND_BACKOFF_SPAN_LIMIT", () => {
      expect(getBackgroundBackoffSpan(0)).toBe(1);
      expect(getBackgroundBackoffSpan(1)).toBe(2);
      expect(getBackgroundBackoffSpan(2)).toBe(4);
      expect(getBackgroundBackoffSpan(3)).toBe(8);
      expect(getBackgroundBackoffSpan(10)).toBe(9); // Bounded limit: floor((45 * 60 * 1000) / (5 * 60 * 1000)) = 9
    });
  });

  describe("describeSyncFailure", () => {
    it("should map known error patterns to operator headlines", () => {
      expect(describeSyncFailure(new Error("network connection lost"))).toBe("No network connection");
      expect(describeSyncFailure(new Error("Request timed out"))).toBe("The server took too long to answer");
      expect(describeSyncFailure(new Error("401 Unauthorized"))).toBe("The app is not authorised to read this data");
      expect(describeSyncFailure(new Error("500 Internal Server Error"))).toBe("The server could not answer right now");
      expect(describeSyncFailure(new Error("Failed to fetch"))).toBe("Could not reach the server");
      expect(describeSyncFailure(new Error("Backend unconfigured"))).toBe("No backend is configured yet");
      expect(describeSyncFailure(new Error("Validation error: expected string"))).toBe("The server sent data this app could not read");
    });

    it("should return fallback headline for unknown errors", () => {
      expect(describeSyncFailure(new Error("Something completely weird"))).toBe(SYNC_FAILURE_FALLBACK);
    });
  });

  describe("classifySyncFailure", () => {
    it("should classify OFFLINE errors when offline or error message indicates connection failure", () => {
      expect(classifySyncFailure(new Error("Random error"), false)).toBe("OFFLINE");
      expect(classifySyncFailure(new Error("network connection lost"), true)).toBe("OFFLINE");
      expect(classifySyncFailure(new Error("failed to fetch"), true)).toBe("OFFLINE");
    });

    it("should classify TIMEOUT errors", () => {
      expect(classifySyncFailure(new Error("Sync timed out"), true)).toBe("TIMEOUT");
    });

    it("should classify AUTH errors", () => {
      expect(classifySyncFailure(new Error("JWT expired"), true)).toBe("AUTH");
      expect(classifySyncFailure(new Error("Invalid API key"), true)).toBe("AUTH");
    });

    it("should classify VALIDATION errors", () => {
      expect(classifySyncFailure(new Error("Remote data validation failed"), true)).toBe("VALIDATION");
      expect(classifySyncFailure(new Error("payload was not an array"), true)).toBe("VALIDATION");
    });

    it("should default to OFFLINE for unmapped errors when online", () => {
      expect(classifySyncFailure(new Error("Unknown server glitch"), true)).toBe("OFFLINE");
    });
  });
});
