// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RoyaleApiService } from "../services/RoyaleApiService.js";
import { Network } from "../services/Network.js";
import { KeyService } from "../KeyService.js";

// Mock Network
vi.mock("../services/Network.js", () => ({
  Network: {
    addQuotaUsage: vi.fn(),
  },
}));

describe("RoyaleApiService", () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe("timeoutFetch", () => {
    it("should call fetch with correct parameters and signal", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const endpoint = "https://api.clashroyale.com/v1/clans/%23TAG";

      await RoyaleApiService.timeoutFetch(endpoint, { method: "GET" }, 5000);

      expect(mockFetch).toHaveBeenCalledWith(endpoint, expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }));
    });
  });

  describe("fetchWithRotatedRetries", () => {
    // We need to use a real instance or a better mock for KeyService
    // because the code might be re-getting the key in the loop.
    let mockKeyManager: KeyService;

    beforeEach(() => {
      mockKeyManager = {
        getHealthyKey: vi.fn().mockReturnValue("key-1"),
        reportSuccess: vi.fn(),
        reportFailure: vi.fn(),
      } as unknown as KeyService;
    });

    it("should return 200 and parsed JSON on success", async () => {
      const mockData = { name: "Test Clan" };
      mockFetch.mockResolvedValue({
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockData)),
      });

      const result = await RoyaleApiService.fetchWithRotatedRetries(
        "https://api.clashroyale.com/v1/clans/%23TAG",
        {},
        2,
        mockKeyManager
      );

      expect(result.code).toBe(200);
      expect(result.content).toEqual(mockData);
      expect(result.keyUsed).toBe("key-1...ey-1");
      expect(Network.addQuotaUsage).toHaveBeenCalledWith(1);
      expect(mockKeyManager.reportSuccess).toHaveBeenCalledWith("key-1");
    });

    it("should return ERR_QUOTA_EMPTY if no healthy keys are available", async () => {
      vi.mocked(mockKeyManager.getHealthyKey).mockReturnValue(null);

      const result = await RoyaleApiService.fetchWithRotatedRetries(
        "https://api.clashroyale.com/v1/clans/%23TAG",
        {},
        2,
        mockKeyManager
      );

      expect(result.code).toBe(429);
      expect(result.content).toBe("ERR_QUOTA_EMPTY");
    });

    it("should retry on 500 errors and eventually succeed", async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 500,
          text: () => Promise.resolve("Internal Server Error"),
        })
        .mockResolvedValueOnce({
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        });

      const fetchPromise = RoyaleApiService.fetchWithRotatedRetries(
        "https://api.clashroyale.com/v1/clans/%23TAG",
        {},
        2,
        mockKeyManager
      );

      // Fast-forward through backoff
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      expect(result.code).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockKeyManager.reportFailure).toHaveBeenCalledWith("key-1", 500);
      expect(mockKeyManager.reportSuccess).toHaveBeenCalledWith("key-1");
    });

    it("should retry on 429 errors and exhaust retries", async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        text: () => Promise.resolve("Rate Limit Exceeded"),
      });

      const fetchPromise = RoyaleApiService.fetchWithRotatedRetries(
        "https://api.clashroyale.com/v1/clans/%23TAG",
        {},
        1, // maxRetryAttempts = 1 -> total 2 attempts
        mockKeyManager
      );

      // Fast-forward through backoff
      await vi.runAllTimersAsync();

      const result = await fetchPromise;

      expect(result.code).toBe(520);
      expect(result.content).toContain("Fetch exhausted: rate_limit");
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockKeyManager.reportFailure).toHaveBeenCalledTimes(2);
    });

    it("should return 404 immediately without retrying", async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        text: () => Promise.resolve("Not Found"),
      });

      const result = await RoyaleApiService.fetchWithRotatedRetries(
        "https://api.clashroyale.com/v1/clans/%23TAG",
        {},
        2,
        mockKeyManager
      );

      expect(result.code).toBe(404);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw auth_denied on 403 and exhaust retries", async () => {
      mockFetch.mockResolvedValue({
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      });

      const fetchPromise = RoyaleApiService.fetchWithRotatedRetries(
        "https://api.clashroyale.com/v1/clans/%23TAG",
        {},
        1,
        mockKeyManager
      );

      await vi.runAllTimersAsync();
      const result = await fetchPromise;

      expect(result.code).toBe(520);
      expect(result.content).toContain("auth_denied");
      expect(mockKeyManager.reportFailure).toHaveBeenCalledWith("key-1", 403);
    });
  });
});
