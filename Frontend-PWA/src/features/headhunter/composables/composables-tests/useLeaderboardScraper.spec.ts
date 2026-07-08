// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useLeaderboardScraper } from "../useLeaderboardScraper";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpdateFabState, mockInfo, mockError, mockTap } = vi.hoisted(() => ({
  mockUpdateFabState: vi.fn(),
  mockInfo: vi.fn(),
  mockError: vi.fn(),
  mockTap: vi.fn(),
}));

vi.mock("@core/services/useUiCoordinator", () => ({
  useUiCoordinator: () => ({
    updateFabState: mockUpdateFabState,
  }),
}));

vi.mock("@core/services/useToast", () => ({
  useToast: () => ({
    info: mockInfo,
    error: mockError,
  }),
}));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: mockTap,
  }),
}));

vi.mock("@core/api/RecruitClient", () => ({
  scoutLeaderboard: vi.fn(),
}));

describe("useLeaderboardScraper", () => {
  let selectionStore: ReturnType<typeof useSelectionStore>;
  let mockBlitzTrigger: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    selectionStore = useSelectionStore();
    mockBlitzTrigger = vi.fn();
  });

  it("handles successful global harvest and triggers Blitz", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    const mockItems = [
      { tag: "#PRO1", name: "Pro One", clan: { name: "Some Clan" } },
      { tag: "#FREE1", name: "Free One" }, // Clanless
    ];

    vi.mocked(scoutLeaderboard).mockResolvedValue({
      items: mockItems,
      region: "Global",
    });

    const { executeHarvest } = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    await executeHarvest("global");

    // Must set loading state during harvest
    expect(mockUpdateFabState).toHaveBeenCalledWith(
      expect.objectContaining({
        isHarvesting: true,
        activeHarvester: "global",
      })
    );

    // Converts player tag correctly by removing leading hash
    expect(selectionStore.selectedIds.value).toEqual(["FREE1"]);
    expect(mockBlitzTrigger).toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith("Successfully harvested 1 recruits from Global leaderboard.");
    expect(mockTap).toHaveBeenCalled();
  });

  it("handles empty harvest gracefully", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    const mockItems = [
      { tag: "#PRO1", name: "Pro One", clan: { name: "Some Clan" } },
    ];

    vi.mocked(scoutLeaderboard).mockResolvedValue({
      items: mockItems,
      region: "France",
    });

    const { executeHarvest } = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    await executeHarvest("local");

    expect(selectionStore.selectedIds.value).toEqual([]);
    expect(mockBlitzTrigger).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith("Harvest complete: zero clanless players found on local leaderboards.");
  });

  it("handles fetch failure by showing toast error", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    vi.mocked(scoutLeaderboard).mockRejectedValue(
      new Error("Internal Server Error"),
    );

    const { executeHarvest } = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    await executeHarvest("global");

    expect(mockBlitzTrigger).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledWith("Internal Server Error");
    expect(mockUpdateFabState).toHaveBeenCalledWith(
      expect.objectContaining({
        isHarvesting: false,
        activeHarvester: null,
      })
    );
  });

  it("supports harvest abort mechanism", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    vi.mocked(scoutLeaderboard).mockImplementation(() => {
      return new Promise((_, reject) => {
        const err = new Error("The user aborted a request.");
        err.name = "AbortError";
        reject(err);
      });
    });

    const { executeHarvest, abortHarvest } = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    const harvestPromise = executeHarvest("global");
    abortHarvest();

    await harvestPromise;

    expect(mockBlitzTrigger).not.toHaveBeenCalled();
    // Verify that the loading state gets cleared when abort occurs
    expect(mockUpdateFabState).toHaveBeenCalledWith(
      expect.objectContaining({
        isHarvesting: false,
        activeHarvester: null,
      })
    );
  });
});
