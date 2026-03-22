// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WorkerHubController } from "../controllers/WorkerHubController";
import { HubPersistenceService } from "../services/HubPersistenceService";
import { PayloadKernel } from "../services/PayloadKernel";
import { HubState } from "../types/HubTypes";

// Mock dependencies
vi.mock("../services/HubPersistenceService", () => ({
  HubPersistenceService: {
    saveState: vi.fn(),
    loadState: vi.fn(),
  },
}));

vi.mock("../services/PayloadKernel", () => ({
  PayloadKernel: {
    generateMatrix: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("WorkerHubController", () => {
  const mockHubState: HubState = {
    metadata: {
      timestamp: new Date().toISOString(),
      status: "healthy",
      version: "1.0.0",
      source: "GAS",
    },
    data: {
      roster: [],
      headhunter: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    WorkerHubController.stopSyncDaemon();
    // @ts-ignore
    WorkerHubController.memoryCache = null;
    // @ts-ignore
    WorkerHubController.isSyncing = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    WorkerHubController.stopSyncDaemon();
    vi.useRealTimers();
  });

  describe("executeSync", () => {
    it("should successfully sync data and update cache/persistence", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ some: "raw-data" }),
      });
      vi.mocked(PayloadKernel.generateMatrix).mockReturnValueOnce(mockHubState);

      const result = await WorkerHubController.executeSync("http://gas.url", "secret-token");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("http://gas.url"));
      expect(PayloadKernel.generateMatrix).toHaveBeenCalled();
      expect(HubPersistenceService.saveState).toHaveBeenCalledWith(mockHubState);

      const state = await WorkerHubController.getHubState();
      expect(state).toEqual(mockHubState);
    });

    it("should prevent overlapping syncs", async () => {
      // Use a real promise that we can control
      let resolveFetch: any;
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve;
      });
      mockFetch.mockReturnValueOnce(fetchPromise);

      const firstSync = WorkerHubController.executeSync("url", "token");

      // Since executeSync is async and we are in fake timers,
      // it might not have set isSyncing = true yet if it awaits something before that.
      // But looking at code, it sets it immediately.

      const secondSync = await WorkerHubController.executeSync("url", "token");
      expect(secondSync).toBe(false);

      resolveFetch({
        ok: true,
        json: async () => ({}),
      });
      await firstSync;
    });

    it("should handle fetch failures", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await WorkerHubController.executeSync("url", "token");

      expect(result).toBe(false);
      expect(HubPersistenceService.saveState).not.toHaveBeenCalled();
    });

    it("should handle GAS API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: "GAS_LIMIT_EXCEEDED" }),
      });

      const result = await WorkerHubController.executeSync("url", "token");

      expect(result).toBe(false);
      expect(PayloadKernel.generateMatrix).not.toHaveBeenCalled();
    });
  });

  describe("getHubState", () => {
    it("should return cached state if available", async () => {
      // @ts-ignore
      WorkerHubController.memoryCache = mockHubState;

      const result = await WorkerHubController.getHubState();

      expect(result).toEqual(mockHubState);
      expect(HubPersistenceService.loadState).not.toHaveBeenCalled();
    });

    it("should fall back to disk if memory cache is empty", async () => {
      vi.mocked(HubPersistenceService.loadState).mockResolvedValueOnce(mockHubState);

      const result = await WorkerHubController.getHubState();

      expect(result).toEqual(mockHubState);
      expect(HubPersistenceService.loadState).toHaveBeenCalled();

      // Verify cache update
      // @ts-ignore
      expect(WorkerHubController.memoryCache).toEqual(mockHubState);
    });

    it("should throw error if both memory and disk are empty", async () => {
      vi.mocked(HubPersistenceService.loadState).mockResolvedValueOnce(null);

      await expect(WorkerHubController.getHubState()).rejects.toMatchObject({
        code: "ERR_STATE_MISSING",
      });
    });
  });

  describe("daemon management", () => {
    it("should start and stop the daemon", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      vi.mocked(PayloadKernel.generateMatrix).mockReturnValue(mockHubState);

      WorkerHubController.startSyncDaemon("url", "token");

      // Initial call is triggered immediately.
      // It's an async call not awaited in startSyncDaemon.
      // We need to let it finish.
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time by 5 minutes to trigger the interval
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      WorkerHubController.stopSyncDaemon();

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(mockFetch).toHaveBeenCalledTimes(2); // No more calls
    });

    it("should not start multiple daemons", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      WorkerHubController.startSyncDaemon("url", "token");
      WorkerHubController.startSyncDaemon("url", "token");

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });
  });
});
