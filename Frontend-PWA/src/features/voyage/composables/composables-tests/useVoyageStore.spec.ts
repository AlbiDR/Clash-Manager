// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useVoyageStore } from "../useVoyageStore";
import * as SupabaseClient from "@core/api/SupabaseClient";
import * as VoyageClient from "@core/api/VoyageClient";

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
      const store = useVoyageStore();
      const input = { days: 1, hours: 2, minutes: 30 };
      // 1 day (86400s) + 2 hours (7200s) + 30 mins (1800s) = 95400s = 95400000ms
      const result = store.t2tToTimestamp(input);
      expect(result).toBe("2026-01-02T02:30:00.000Z");
    });
  });

  describe("refresh", () => {
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
        total_crowns: 500,
        progress_ratio: 0.5
      };
      const mockContributions = [
        { player_tag: "#P1", player_name: "Player 1", crowns: 100, voyage_crown_pct: "20", performance_score: 85 }
      ];

      vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(mockSummary as any);
      vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue(mockContributions as any);

      const store = useVoyageStore();
      await store.refresh();

      expect(store.summary).not.toBeNull();
      expect(store.summary?.event.status).toBe("ACTIVE");
      expect(store.summary?.total_crowns).toBe(500);
      expect(store.summary?.contributions[0].voyage_crown_pct).toBe(20);
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
      expect(consoleSpy).toHaveBeenCalledWith("[Voyage] Refresh failed:", expect.any(Error));
    });

    it("should cap progress ratio at 1.0", async () => {
       const mockSummary = {
        event: { status: "COMPLETED", target_crowns: 1000 },
        total_crowns: 1200,
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
      // @ts-ignore
      store.summary = {
        event: { id: 42, status: "ACTIVE", target_crowns: 1000, start_at: "2026-01-01T00:00:00Z", end_at: null, clan_tag: "#CLAN", activated_by: null, is_victory: false },
        contributions: [],
        total_crowns: 0,
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
      // @ts-ignore
      store.summary = {
        event: { id: 42, status: "ACTIVE", target_crowns: 1000, start_at: "2026-01-01T00:00:00Z", end_at: null, clan_tag: "#CLAN", activated_by: null, is_victory: false },
        contributions: [],
        total_crowns: 0,
        progress_ratio: 0
      };

      await expect(store.setVoyageEnd({ days: 1, hours: 0, minutes: 0 })).rejects.toThrow("Not ACTIVE");
    });
  });
});
