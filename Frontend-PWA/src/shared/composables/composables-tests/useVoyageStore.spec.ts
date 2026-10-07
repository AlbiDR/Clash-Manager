// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useVoyageStore } from "../useVoyageStore";
import * as SupabaseClient from "@core/api/SupabaseClient";
import * as VoyageClient from "@core/api/VoyageClient";
import { t2tToTimestamp } from "@core";

vi.mock("@core/api/SupabaseClient", () => ({
  createSupabaseClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }))
}));

vi.mock("@core/api/VoyageClient", () => ({
  initializeVoyage: vi.fn(),
  fetchVoyageSummary: vi.fn(),
  fetchVoyageContributions: vi.fn(),
  scheduleVoyageEvent: vi.fn(),
  cancelScheduledVoyageEvent: vi.fn(),
  setVoyageEnd: vi.fn()
}));

type VoyageViewResponse = Awaited<ReturnType<typeof VoyageClient.fetchVoyageSummary>>;
type VoyageContributionResponse = Awaited<ReturnType<typeof VoyageClient.fetchVoyageContributions>>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createVoyageViewSummary(id: number): VoyageViewResponse {
  return {
    event: {
      id,
      clan_tag: "#CLAN1",
      status: "ACTIVE",
      target_crowns: 1000 + id,
      start_at: "2026-01-01T00:00:00Z",
      end_at: null,
      activated_by: null,
      is_victory: false,
    },
    total_voyage_crowns: id * 100,
    progress_ratio: id / 10,
  };
}

async function flushPromiseContinuations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("useVoyageStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should initialize with default state", () => {
    const store = useVoyageStore();
    expect(store.summary).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.status).toBe("IDLE");
    expect(store.isActive).toBe(false);
  });

  describe("t2tToTimestamp", () => {
    it("should calculate correct future timestamp", () => {
      const input = { days: 1, hours: 2, minutes: 30 };
      // 1 day (86400s) + 2 hours (7200s) + 30 mins (1800s) = 95400s = 95400000ms
      const result = t2tToTimestamp(input);
      expect(result).toBe("2026-01-02T02:30:00.000Z");
    });
  });

  describe("refresh", () => {
    it("coalesces overlapping refresh demand into sequential passes with pass-scoped promises", async () => {
      const summaryResponses = Array.from({ length: 3 }, () => createDeferred<VoyageViewResponse>());
      const contributionResponses = Array.from({ length: 3 }, () => createDeferred<VoyageContributionResponse>());
      let summaryRequestCount = 0;
      let contributionRequestCount = 0;
      vi.mocked(VoyageClient.fetchVoyageSummary).mockImplementation(
        () => summaryResponses[summaryRequestCount++]!.promise,
      );
      vi.mocked(VoyageClient.fetchVoyageContributions).mockImplementation(
        () => contributionResponses[contributionRequestCount++]!.promise,
      );

      const store = useVoyageStore();
      const firstCaller = store.refresh();
      const initialSummaryRequests = summaryRequestCount;
      const initialContributionRequests = contributionRequestCount;

      const secondCaller = store.refresh();
      const thirdCaller = store.refresh();
      summaryResponses[0]!.resolve(createVoyageViewSummary(1));
      contributionResponses[0]!.resolve([]);
      await firstCaller;

      const trailingSummaryRequests = summaryRequestCount;
      const trailingContributionRequests = contributionRequestCount;
      const firstPassSettledWhileTrailingFetchRuns = store.loading;
      const fourthCaller = store.refresh();
      let fourthCallerSettled = false;
      void fourthCaller.then(() => { fourthCallerSettled = true; });

      summaryResponses[1]!.resolve(createVoyageViewSummary(2));
      contributionResponses[1]!.resolve([
        { player_tag: "#P2", player_name: "Latest Player", total_voyage_crowns: 200, percentage_voyage_crowns: 20 },
      ]);
      await Promise.all([secondCaller, thirdCaller]);
      const finalSummaryRequests = summaryRequestCount;
      const finalContributionRequests = contributionRequestCount;
      const queuedPassSettledBeforeLaterPass = store.loading && !fourthCallerSettled;

      summaryResponses[2]!.resolve(createVoyageViewSummary(3));
      contributionResponses[2]!.resolve([
        { player_tag: "#P3", player_name: "Final Player", total_voyage_crowns: 300, percentage_voyage_crowns: 30 },
      ]);
      await fourthCaller;

      expect(initialSummaryRequests).toBe(1);
      expect(initialContributionRequests).toBe(1);
      expect(trailingSummaryRequests).toBe(2);
      expect(trailingContributionRequests).toBe(2);
      expect(finalSummaryRequests).toBe(3);
      expect(finalContributionRequests).toBe(3);
      expect(firstPassSettledWhileTrailingFetchRuns).toBe(true);
      expect(queuedPassSettledBeforeLaterPass).toBe(true);
      expect(store.summary?.event.id).toBe(3);
      expect(store.summary?.contributions[0]?.player_name).toBe("Final Player");
      expect(store.loading).toBe(false);
      expect(fourthCallerSettled).toBe(true);
    });

    it("waits for both reads to settle before starting queued demand", async () => {
      const summaryResponses = [createDeferred<VoyageViewResponse>(), createDeferred<VoyageViewResponse>()];
      const contributionResponses = [createDeferred<VoyageContributionResponse>(), createDeferred<VoyageContributionResponse>()];
      let summaryRequestCount = 0;
      let contributionRequestCount = 0;
      vi.mocked(VoyageClient.fetchVoyageSummary).mockImplementation(
        () => summaryResponses[summaryRequestCount++]!.promise,
      );
      vi.mocked(VoyageClient.fetchVoyageContributions).mockImplementation(
        () => contributionResponses[contributionRequestCount++]!.promise,
      );

      const store = useVoyageStore();
      const firstCaller = store.refresh();
      await Promise.resolve();
      const queuedCaller = store.refresh();
      let queuedCallerSettled = false;
      void queuedCaller.then(() => { queuedCallerSettled = true; });
      summaryResponses[0]!.reject(new Error("Fast summary failure"));
      await flushPromiseContinuations();
      const summaryReadsBeforeSiblingSettled = summaryRequestCount;
      const contributionReadsBeforeSiblingSettled = contributionRequestCount;
      const queuedCallerWaitedForSibling = !queuedCallerSettled && store.loading;

      contributionResponses[0]!.resolve([]);
      await flushPromiseContinuations();
      const readsAfterSiblingSettled = summaryRequestCount;
      summaryResponses[1]!.resolve(createVoyageViewSummary(2));
      contributionResponses[1]!.resolve([]);
      await Promise.all([firstCaller, queuedCaller]);

      expect(summaryReadsBeforeSiblingSettled).toBe(1);
      expect(contributionReadsBeforeSiblingSettled).toBe(1);
      expect(queuedCallerWaitedForSibling).toBe(true);
      expect(readsAfterSiblingSettled).toBe(2);
      expect(summaryRequestCount).toBe(2);
      expect(contributionRequestCount).toBe(2);
      expect(store.loading).toBe(false);
    });

    it("should fetch and populate state on success", async () => {
      const mockSummary = {
        event: {
          id: 1,
          clan_tag: "#CLAN1",
          status: "ACTIVE",
          target_crowns: 1000,
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-07T00:00:00Z"
        },
        total_voyage_crowns: 500,
        progress_ratio: 0.5
      };
      const mockContributions = [
        { player_tag: "#P1", player_name: "Player 1", total_voyage_crowns: 100, percentage_voyage_crowns: "20", performance_score: 85 }
      ];

      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(mockSummary as any);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue(mockContributions as any);

      const store = useVoyageStore();
      await store.refresh();

      expect(store.summary).not.toBeNull();
      expect(store.summary?.event.status).toBe("ACTIVE");
      expect(store.summary?.total_voyage_crowns).toBe(500);
      expect(store.summary?.contributions[0].percentage_voyage_crowns).toBe(20);
      expect(store.status).toBe("ACTIVE");
      expect(store.isActive).toBe(true);
      expect(store.progressRatio).toBe(0.5);
      expect(store.isVictory).toBe(false);
      expect(store.loading).toBe(false);
      expect(store.lastUpdated).toBeGreaterThan(0);
    });

    it("should handle null summary from API", async () => {
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(null);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);

      const store = useVoyageStore();
      await store.refresh();

      expect(store.summary).toBeNull();
      expect(store.status).toBe("IDLE");
    });

    it("should handle API rejection gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(VoyageClient.fetchVoyageSummary).mockRejectedValue(new Error("API Error"));

      const store = useVoyageStore();
      await store.refresh();

      expect(store.loading).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith("[Voyage] Refresh failed:", "API Error");
    });

    it("runs queued refresh demand after a failed read and then stops without new demand", async () => {
      const summaryResponses = [createDeferred<VoyageViewResponse>(), createDeferred<VoyageViewResponse>()];
      const contributionResponses = [createDeferred<VoyageContributionResponse>(), createDeferred<VoyageContributionResponse>()];
      let summaryRequestCount = 0;
      let contributionRequestCount = 0;
      vi.mocked(VoyageClient.fetchVoyageSummary).mockImplementation(
        () => summaryResponses[summaryRequestCount++]!.promise,
      );
      vi.mocked(VoyageClient.fetchVoyageContributions).mockImplementation(
        () => contributionResponses[contributionRequestCount++]!.promise,
      );

      const store = useVoyageStore();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const firstCaller = store.refresh();
      await Promise.resolve();
      const queuedCaller = store.refresh();

      summaryResponses[0]!.reject(new Error("Temporary read failure"));
      contributionResponses[0]!.resolve([]);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      summaryResponses[1]!.resolve({
        event: { id: 2, clan_tag: "#CLAN1", status: "ACTIVE", target_crowns: 1200, start_at: "2026-01-01T00:00:00Z", end_at: null },
        total_voyage_crowns: 900,
        progress_ratio: 0.75,
      });
      contributionResponses[1]!.resolve([]);
      await Promise.all([firstCaller, queuedCaller]);

      expect(summaryRequestCount).toBe(2);
      expect(contributionRequestCount).toBe(2);
      expect(errorSpy).toHaveBeenCalledWith("[Voyage] Refresh failed:", "Temporary read failure");
      expect(store.summary?.event.id).toBe(2);
      expect(store.loading).toBe(false);
    });

    it("keeps the last summary when a later read fails instead of showing no voyage", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const activeSummary = {
        event: { id: 1, clan_tag: "#CLAN1", status: "ACTIVE", target_crowns: 1000, start_at: "2026-01-01T00:00:00Z", end_at: null },
        total_voyage_crowns: 500,
        progress_ratio: 0.5,
      };
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValueOnce(activeSummary as any);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);
      const store = useVoyageStore();
      await store.refresh();

      vi.mocked(VoyageClient.fetchVoyageSummary).mockRejectedValueOnce(new Error("Fetch Error"));
      await store.refresh();

      expect(store.status).toBe("ACTIVE");
      expect(store.summary?.total_voyage_crowns).toBe(500);
    });

    it("should cap progress ratio at 1.0", async () => {
       const mockSummary = {
        event: { status: "COMPLETED", target_crowns: 1000 },
        total_voyage_crowns: 1200,
        progress_ratio: 1.2
      };
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(mockSummary as any);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);

      const store = useVoyageStore();
      await store.refresh();

      expect(store.progressRatio).toBe(1.0);
      expect(store.isVictory).toBe(true);
    });

    it("should setup realtime listeners when status is ACTIVE", async () => {
      const mockSummary = {
        event: { status: "ACTIVE" },
        total_voyage_crowns: 0,
        progress_ratio: 0
      };
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(mockSummary as any);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);

      const store = useVoyageStore();
      await store.refresh();

      expect(SupabaseClient.createSupabaseClient).toHaveBeenCalled();
    });

    it("should setup realtime listeners when status is PENDING", async () => {
      const mockSummary = {
        event: { status: "PENDING" },
        total_crowns: 0,
        progress_ratio: 0
      };
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(mockSummary as any);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);

      const store = useVoyageStore();
      await store.refresh();

      expect(SupabaseClient.createSupabaseClient).toHaveBeenCalled();
    });
  });

  describe("computed properties", () => {
    it("should correctly compute isPending", () => {
      const store = useVoyageStore();

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "PENDING", start_at: "2026-01-02T00:00:00Z" } };
      expect(store.isPending).toBe(true);

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "PENDING", start_at: "2025-12-31T23:59:59Z" } };
      expect(store.isPending).toBe(false);

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "ACTIVE", start_at: "2026-01-02T00:00:00Z" } };
      expect(store.isPending).toBe(false);
    });

    it("should correctly compute isAwaitingEnd", () => {
      const store = useVoyageStore();

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "ACTIVE", end_at: null } };
      expect(store.isAwaitingEnd).toBe(true);

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "ACTIVE", end_at: "2026-01-07T00:00:00Z" } };
      expect(store.isAwaitingEnd).toBe(false);

      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { status: "IDLE", end_at: null } };
      expect(store.isAwaitingEnd).toBe(false);
    });
  });

  describe("scheduleVoyage", () => {
    it("should call scheduleVoyageEvent and refresh on success", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(null);

      const store = useVoyageStore();
      await store.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 });

      expect(VoyageClient.scheduleVoyageEvent).toHaveBeenCalledWith(1000, "2026-01-02T00:00:00.000Z");
      expect(VoyageClient.fetchVoyageSummary).toHaveBeenCalled();
    });

    it("should throw on RPC failure", async () => {
      vi.mocked(VoyageClient.scheduleVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: false, error: "Concurrency issue" }
      } as any);

      const store = useVoyageStore();
      await expect(store.scheduleVoyage(1000, { days: 1, hours: 0, minutes: 0 })).rejects.toThrow("Concurrency issue");
    });
  });

  describe("cancelSchedule", () => {
    it("should call cancelScheduledVoyageEvent and refresh on success", async () => {
      vi.mocked(VoyageClient.cancelScheduledVoyageEvent).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(null);

      const store = useVoyageStore();
      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = { event: { id: 101, status: "PENDING" } };

      await store.cancelSchedule();

      expect(VoyageClient.cancelScheduledVoyageEvent).toHaveBeenCalledWith(101);
      expect(VoyageClient.fetchVoyageSummary).toHaveBeenCalled();
    });

    it("should throw if no scheduled voyage exists", async () => {
      const store = useVoyageStore();
      await expect(store.cancelSchedule()).rejects.toThrow("No scheduled voyage is active.");
    });
  });

  describe("activateVoyage", () => {
    const target = 1000;
    const startsIn = { days: 0, hours: 0, minutes: 0 };
    const endsIn = { days: 7, hours: 0, minutes: 0 };

    it("should call initializeVoyage and refresh on success", async () => {
      vi.mocked(VoyageClient.initializeVoyage).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(null);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);

      const store = useVoyageStore();
      await store.activateVoyage(target, startsIn, endsIn);

      expect(VoyageClient.initializeVoyage).toHaveBeenCalledWith(
        target,
        "2026-01-01T00:00:00.000Z",
        "2026-01-08T00:00:00.000Z"
      );
      // Verify refresh was called by checking its dependencies
      expect(VoyageClient.fetchVoyageSummary).toHaveBeenCalled();
    });

    it("should throw error on logic failure", async () => {
      vi.mocked(VoyageClient.initializeVoyage).mockResolvedValue({
        success: true,
        data: { success: false, error: "Already active" }
      } as any);

      const store = useVoyageStore();
      await expect(store.activateVoyage(target, startsIn, endsIn)).rejects.toThrow("Already active");
    });

    it("should throw error on network/auth failure", async () => {
      vi.mocked(VoyageClient.initializeVoyage).mockResolvedValue({
        success: false,
        error: "Unauthorized"
      } as any);

      const store = useVoyageStore();
      await expect(store.activateVoyage(target, startsIn, endsIn)).rejects.toThrow("Unauthorized");
    });
  });

  describe("setVoyageEnd", () => {
    it("should call setVoyageEnd RPC and refresh on success", async () => {
      vi.mocked(VoyageClient.setVoyageEnd).mockResolvedValue({
        success: true,
        data: { success: true }
      } as any);
      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(null);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue([]);

      const store = useVoyageStore();
      // Seed an ACTIVE voyage so the store can retrieve the ID
      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = {
        event: { id: 42, status: "ACTIVE", target_crowns: 1000, start_at: "2026-01-01T00:00:00Z", end_at: null, clan_tag: "#CLAN", activated_by: null, is_victory: false },
        contributions: [],
        total_voyage_crowns: 0,
        progress_ratio: 0
      };

      await store.setVoyageEnd({ days: 3, hours: 0, minutes: 0 });

      expect(VoyageClient.setVoyageEnd).toHaveBeenCalledWith(
        42,
        "2026-01-04T00:00:00.000Z"
      );
      expect(VoyageClient.fetchVoyageSummary).toHaveBeenCalled();
    });

    it("should throw if no active voyage is found", async () => {
      const store = useVoyageStore();
      await expect(store.setVoyageEnd({ days: 1, hours: 0, minutes: 0 })).rejects.toThrow("No active voyage found.");
    });

    it("should throw on RPC logic failure", async () => {
      vi.mocked(VoyageClient.setVoyageEnd).mockResolvedValue({
        success: true,
        data: { success: false, error: "Not ACTIVE" }
      } as any);

      const store = useVoyageStore();
      // @ts-expect-error -- test mock/state does not satisfy the full type
      store.summary = {
        event: { id: 42, status: "ACTIVE", target_crowns: 1000, start_at: "2026-01-01T00:00:00Z", end_at: null, clan_tag: "#CLAN", activated_by: null, is_victory: false },
        contributions: [],
        total_voyage_crowns: 0,
        progress_ratio: 0
      };

      await expect(store.setVoyageEnd({ days: 1, hours: 0, minutes: 0 })).rejects.toThrow("Not ACTIVE");
    });
  });
});
