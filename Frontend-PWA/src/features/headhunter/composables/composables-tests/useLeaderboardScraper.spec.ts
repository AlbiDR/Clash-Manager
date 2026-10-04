// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { useLeaderboardScraper } from "../useLeaderboardScraper";

const { mockInfo, mockError, mockTap } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockError: vi.fn(),
  mockTap: vi.fn(),
}));

vi.mock("@core/services/useToast", () => ({ useToast: () => ({ info: mockInfo, error: mockError }) }));
vi.mock("@shared/composables/useHaptics", () => ({ useHaptics: () => ({ tap: mockTap }) }));
vi.mock("@core/api/RecruitClient", () => ({ scoutLeaderboard: vi.fn() }));

describe("useLeaderboardScraper", () => {
  let selectionStore: ReturnType<typeof useSelectionStore>;
  let mockBlitzTrigger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    selectionStore = useSelectionStore();
    mockBlitzTrigger = vi.fn();
  });

  it("owns successful global-harvest activity and triggers Blitz", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    vi.mocked(scoutLeaderboard).mockResolvedValue({
      items: [
        { tag: "#PRO1", name: "Pro One", clan: { name: "Some Clan" } },
        { tag: "#FREE1", name: "Free One" },
      ],
      region: "Global",
    });
    const scraper = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    const harvestPromise = scraper.executeHarvest("global");
    expect(scraper.isHarvesting.value).toBe(true);
    expect(scraper.activeHarvestMode.value).toBe("global");
    await harvestPromise;

    expect(selectionStore.selectedIds.value).toEqual(["FREE1"]);
    expect(mockBlitzTrigger).toHaveBeenCalledOnce();
    expect(mockInfo).toHaveBeenCalledWith("Successfully harvested 1 recruits from Global leaderboard.");
    expect(mockTap).toHaveBeenCalled();
    expect(scraper.isHarvesting.value).toBe(false);
    expect(scraper.activeHarvestMode.value).toBeNull();
  });

  it("handles an empty harvest", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    vi.mocked(scoutLeaderboard).mockResolvedValue({
      items: [{ tag: "#PRO1", name: "Pro One", clan: { name: "Some Clan" } }],
      region: "France",
    });
    const scraper = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    await scraper.executeHarvest("local");
    expect(selectionStore.selectedIds.value).toEqual([]);
    expect(mockBlitzTrigger).not.toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith("Harvest complete: zero clanless players found on local leaderboards.");
    expect(scraper.isHarvesting.value).toBe(false);
  });

  it("clears feature-owned activity after failure", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    vi.mocked(scoutLeaderboard).mockRejectedValue(new Error("Internal Server Error"));
    const scraper = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    await scraper.executeHarvest("global");
    expect(mockError).toHaveBeenCalledWith("Internal Server Error");
    expect(scraper.isHarvesting.value).toBe(false);
    expect(scraper.activeHarvestMode.value).toBeNull();
  });

  it("supports cancellation", async () => {
    const { scoutLeaderboard } = await import("@core/api/RecruitClient");
    vi.mocked(scoutLeaderboard).mockImplementation((_mode, signal) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        const abortError = new Error("The user aborted a request.");
        abortError.name = "AbortError";
        reject(abortError);
      });
    }));
    const scraper = useLeaderboardScraper(selectionStore, mockBlitzTrigger);

    const harvestPromise = scraper.executeHarvest("global");
    scraper.abortHarvest();
    await harvestPromise;

    expect(mockBlitzTrigger).not.toHaveBeenCalled();
    expect(scraper.isHarvesting.value).toBe(false);
    expect(scraper.activeHarvestMode.value).toBeNull();
  });
});
