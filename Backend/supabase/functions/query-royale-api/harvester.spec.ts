// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { mockFetchWithRotation, mockProcessBatch } = vi.hoisted(() => {
  const mockFetchWithRotation = vi.fn();
  const mockProcessBatch = vi.fn(async (tasks: Array<() => Promise<unknown>>) => {
    const results: unknown[] = [];
    for (const task of tasks) {
      results.push(await task());
    }
    return results;
  });

  return { mockFetchWithRotation, mockProcessBatch };
});

vi.mock("../_shared/muscle.ts", () => ({
  fetchWithRotation: mockFetchWithRotation,
  processBatch: mockProcessBatch,
}));

beforeAll(() => {
  // Ensure basic Deno global exists to prevent reference errors
  globalThis.Deno = {
    env: {
      get: (key: string) => "",
    },
  } as any;
});

let harvestClanlessPlayers: any;
let harvestInternationalPlayers: any;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const harvesterModule = await import("./harvester.ts");
  harvestClanlessPlayers = harvesterModule.harvestClanlessPlayers;
  harvestInternationalPlayers = harvesterModule.harvestInternationalPlayers;
});

function makeAuditCollector() {
  const entries: Array<{ stage: string; action: string; details?: unknown }> = [];
  const logAudit = vi.fn((stage: string, action: string, details?: unknown) => {
    entries.push({ stage, action, details });
  });
  return { entries, logAudit };
}

describe("Harvester Utility Logic Spec", () => {
  describe("fetchRankings (internal logic via harvestClanlessPlayers)", () => {
    it("filters out players who have a clan and includes only clanless ones", async () => {
      // Setup the mock response to return 10 clanless players (>= MIN_LOCAL_POL_FLOOR) and one with a clan
      const mockItems = Array.from({ length: 10 }, (_, i) => ({
        tag: `#CLANLESS${i}`,
        name: `Solo Player ${i}`,
        rank: i + 1,
        clan: null,
      })).concat([
        { tag: "#CLANNED1", name: "In Clan", rank: 11, clan: { tag: "#CLAN1", name: "Some Clan" } },
      ]);

      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: mockItems,
        }),
      });

      const { logAudit } = makeAuditCollector();
      const results = await harvestClanlessPlayers("57000120", logAudit);

      expect(results).toHaveLength(10);
      expect(results[0]).toEqual({
        tag: "#CLANLESS0",
        name: "Solo Player 0",
        clan: null,
      });
    });

    it("throws an error when the fetch request is non-2xx", async () => {
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      });

      const { logAudit } = makeAuditCollector();
      await expect(harvestClanlessPlayers("57000120", logAudit)).rejects.toThrow(
        "Failed to fetch player rankings: 404"
      );
    });

    it("throws an error when the payload fails structural validation (mismatched schema)", async () => {
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          invalidKey: "no-items-here",
        }),
      });

      const { logAudit } = makeAuditCollector();
      await expect(harvestClanlessPlayers("57000120", logAudit)).rejects.toThrow(
        "Player rankings payload failed structural validation."
      );
    });
  });

  describe("harvestInternationalPlayers", () => {
    it("a total regional outage is distinguishable from a genuinely empty harvest", async () => {
      // Every per-country failure is swallowed into an empty player list, and
      // populated_regions only counts countries that RETURNED players. So a batch
      // where every region errored used to emit the identical audit entry to a
      // batch that queried perfectly and found nobody: CONCURRENT_BATCH_SUCCESS,
      // total_harvested 0, populated_regions []. Discovery could go blind and
      // nothing recorded that it had.
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 111, name: "Country A", isCountry: true },
            { id: 222, name: "Country B", isCountry: true },
          ],
        }),
      });

      // Every country query fails outright.
      mockFetchWithRotation.mockRejectedValue(new Error("upstream 503"));

      const { entries, logAudit } = makeAuditCollector();

      // An outage is an error, not an empty result. In this exact case the old
      // empty return carried no players either, so surfacing it loses nothing
      // but the false reassurance.
      await expect(harvestInternationalPlayers(logAudit)).rejects.toThrow(/failed across all/);

      const failure = entries.find(e => e.stage === "CONCURRENT_BATCH_FAILED");
      expect(failure, "a total outage must not be logged as a successful batch").toBeTruthy();
      expect(entries.some(e => e.stage === "CONCURRENT_BATCH_SUCCESS")).toBe(false);
      expect(failure?.details?.failed_regions?.length).toBeGreaterThan(0);
      expect(failure?.details?.failed_regions?.length).toBe(failure?.details?.queried_regions_count);
    });

    it("fetches locations catalog, shuffles and queries selected countries, and merges unique players", async () => {
      // 1. Locations catalog mock
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 111, name: "Country A", isCountry: true },
            { id: 222, name: "Country B", isCountry: true },
            { id: 999, name: "Region C", isCountry: false }, // should be filtered out
          ],
        }),
      });

      // 2. Fetch rankings mocks for the country queries
      // We will mock two country fetches. Since country catalog is shuffled,
      // both country IDs (111 and 222) will be queried.
      // Return 10 players for each to exceed MIN_LOCAL_POL_FLOOR so it returns immediately.
      const mockCountryAPlayers = Array.from({ length: 10 }, (_, i) => ({
        tag: `#P${i}`,
        name: `Player ${i}`,
        rank: i + 1,
        clan: null,
      }));

      const mockCountryBPlayers = Array.from({ length: 10 }, (_, i) => ({
        tag: i === 0 ? "#P0" : `#P_B_${i}`, // duplicate #P0
        name: i === 0 ? "Player 0" : `Player B ${i}`,
        rank: i + 1,
        clan: null,
      }));

      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: mockCountryAPlayers,
        }),
      });
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: mockCountryBPlayers,
        }),
      });

      const { entries, logAudit } = makeAuditCollector();
      const results = await harvestInternationalPlayers(logAudit);

      // Verify logAudit steps
      expect(entries.some(e => e.stage === "INTERNATIONAL_DETECTED")).toBe(true);
      expect(entries.some(e => e.stage === "COUNTRIES_DIRECTORY_FETCH")).toBe(true);
      expect(entries.some(e => e.stage === "CONCURRENT_BATCH_START")).toBe(true);
      expect(entries.some(e => e.stage === "CONCURRENT_BATCH_SUCCESS")).toBe(true);

      // Verify that duplicate tags were deduplicated: 10 + 9 unique = 19
      expect(results.items).toHaveLength(19);
      expect(results.items.map(p => p.tag)).toContain("#P0");
      expect(results.items.map(p => p.tag)).toContain("#P_B_1");
      expect(results.region).toContain("International (");
    });

    it("caches the locations catalog and does not fetch locations on a second run", async () => {
      // Locations catalog mock
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 111, name: "Country A", isCountry: true },
          ],
        }),
      });

      // Rankings mocks (for the first run's country fetch, and second run's country fetch)
      mockFetchWithRotation.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
        }),
      });

      const { entries: entries1, logAudit: logAudit1 } = makeAuditCollector();
      await harvestInternationalPlayers(logAudit1);
      expect(entries1.some(e => e.stage === "COUNTRIES_DIRECTORY_FETCH")).toBe(true);

      const { entries: entries2, logAudit: logAudit2 } = makeAuditCollector();
      await harvestInternationalPlayers(logAudit2);
      // On second run, it should NOT request locations directory fetch
      expect(entries2.some(e => e.stage === "COUNTRIES_DIRECTORY_FETCH")).toBe(false);
    });

    it("falls back to default country when catalog yields zero countries", async () => {
      // Locations catalog mock returning empty country list
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 999, name: "Region C", isCountry: false },
          ],
        }),
      });

      // Fallback local query rankings fetch
      const mockFallbackPlayers = Array.from({ length: 10 }, (_, i) => ({
        tag: `#FALLBACK${i}`,
        name: `Fallback Player ${i}`,
        rank: i + 1,
        clan: null,
      }));

      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: mockFallbackPlayers,
        }),
      });

      const { entries, logAudit } = makeAuditCollector();
      const results = await harvestInternationalPlayers(logAudit);

      expect(entries.some(e => e.stage === "COUNTRIES_CATALOG_EMPTY_FALLBACK")).toBe(true);
      expect(results.items).toHaveLength(10);
      expect(results.items[0].tag).toBe("#FALLBACK0");
      expect(results.region).toBe("United States");
    });

    it("throws an error when the locations directory fetch is non-2xx", async () => {
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      const { logAudit } = makeAuditCollector();
      await expect(harvestInternationalPlayers(logAudit)).rejects.toThrow(
        "Failed to retrieve locations catalog: 500"
      );
    });

    it("throws an error when the locations catalog fails schema validation", async () => {
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          invalidKey: "mismatched",
        }),
      });

      const { logAudit } = makeAuditCollector();
      await expect(harvestInternationalPlayers(logAudit)).rejects.toThrow(
        "Locations catalog failed structural validation."
      );
    });

    it("gracefully isolates single country query failures inside the concurrent batch", async () => {
      // Locations catalog mock
      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: 111, name: "Country A", isCountry: true },
            { id: 222, name: "Country B", isCountry: true },
          ],
        }),
      });

      // Country A succeeds with 10 players to avoid rankings fallback query
      const mockCountryAPlayers = Array.from({ length: 10 }, (_, i) => ({
        tag: `#P${i}`,
        name: `Player ${i}`,
        rank: i + 1,
        clan: null,
      }));

      mockFetchWithRotation.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          items: mockCountryAPlayers,
        }),
      });

      // Country B fetch rejection
      mockFetchWithRotation.mockRejectedValueOnce(new Error("Downstream timeout"));

      const { entries, logAudit } = makeAuditCollector();
      const results = await harvestInternationalPlayers(logAudit);

      // Concurrency batch must complete successfully despite Country B failure
      expect(results.items).toHaveLength(10);
      expect(results.items[0].tag).toBe("#P0");
      // The region list contains whichever country succeeded under the random shuffle
      expect(["International (Country A)", "International (Country B)"]).toContain(results.region);
    });
  });

  describe("harvestClanlessPlayers (Global and Local paths)", () => {
    describe("Global Location ('global')", () => {
      it("returns immediately if global Path of Legends results meet the target harvest floor", async () => {
        // Generate 85 players to satisfy TARGET_HARVEST_FLOOR = 80
        const mockPlayers = Array.from({ length: 85 }, (_, i) => ({
          tag: `#GLOBAL${i}`,
          name: `Global Player ${i}`,
          rank: i + 1,
          clan: null,
        }));

        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: mockPlayers }),
        });

        const { logAudit } = makeAuditCollector();
        const results = await harvestClanlessPlayers("global", logAudit);

        expect(results).toHaveLength(85);
        // Ensure no local/country queries were triggered
        expect(mockFetchWithRotation).toHaveBeenCalledTimes(1);
      });

      it("queries and merges results from top countries if global PoL yields fewer than the target floor", async () => {
        // Global PoL yields only 5 players (less than 80)
        const mockGlobalPlayers = Array.from({ length: 5 }, (_, i) => ({
          tag: `#GLOBAL${i}`,
          name: `Global Player ${i}`,
          rank: i + 1,
          clan: null,
        }));

        // Spanish PoL yields 80 players
        const mockSpainPlayers = Array.from({ length: 80 }, (_, i) => ({
          tag: `#SPAIN${i}`,
          name: `Spain Player ${i}`,
          rank: i + 1,
          clan: null,
        }));

        // Mock global first
        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: mockGlobalPlayers }),
        });

        // Mock US query (country id 57000120) returning empty
        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
        });

        // Mock Spain query (country id 57000095) returning 80
        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: mockSpainPlayers }),
        });

        const { logAudit } = makeAuditCollector();
        const results = await harvestClanlessPlayers("global", logAudit);

        // Spain's 80 players + Global's 5 players = 85 players total
        expect(results).toHaveLength(85);
      });

      it("propagates the error if the global Path of Legends query fails completely", async () => {
        mockFetchWithRotation.mockRejectedValueOnce(new Error("Global PoL offline"));

        const { logAudit } = makeAuditCollector();
        await expect(harvestClanlessPlayers("global", logAudit)).rejects.toThrow("Global PoL offline");
      });
    });

    describe("Local Location", () => {
      it("returns immediately if local Path of Legends results meet the local PoL floor", async () => {
        // Generate 12 players to satisfy MIN_LOCAL_POL_FLOOR = 10
        const mockPlayers = Array.from({ length: 12 }, (_, i) => ({
          tag: `#LOCAL_POL_${i}`,
          name: `Local PoL Player ${i}`,
          rank: i + 1,
          clan: null,
        }));

        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: mockPlayers }),
        });

        const { logAudit } = makeAuditCollector();
        const results = await harvestClanlessPlayers("57000120", logAudit);

        expect(results).toHaveLength(12);
        // Ensure no local rankings query was triggered
        expect(mockFetchWithRotation).toHaveBeenCalledTimes(1);
      });

      it("queries and merges both local PoL and local rankings if PoL yields fewer than the local floor", async () => {
        // Local PoL yields 3 players (less than 10)
        const mockPolPlayers = Array.from({ length: 3 }, (_, i) => ({
          tag: `#LOCAL_POL_${i}`,
          name: `Local PoL Player ${i}`,
          rank: i + 1,
          clan: null,
        }));

        // Local rankings yield 15 players
        const mockRankPlayers = Array.from({ length: 15 }, (_, i) => ({
          tag: `#LOCAL_RANK_${i}`,
          name: `Local Rank Player ${i}`,
          rank: i + 1,
          clan: null,
        }));

        // Mock local PoL fetch
        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: mockPolPlayers }),
        });

        // Mock local rankings fetch
        mockFetchWithRotation.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ items: mockRankPlayers }),
        });

        const { logAudit } = makeAuditCollector();
        const results = await harvestClanlessPlayers("57000120", logAudit);

        // Unique merged results: 3 + 15 = 18 players
        expect(results).toHaveLength(18);
        expect(mockFetchWithRotation).toHaveBeenCalledTimes(2);
      });

      it("propagates the error if local queries fail", async () => {
        // Local query failure should throw localError
        // We mock the local PoL query to reject, and check that it throws
        mockFetchWithRotation.mockRejectedValueOnce(new Error("Local endpoint failure"));

        const { logAudit } = makeAuditCollector();
        await expect(harvestClanlessPlayers("57000120", logAudit)).rejects.toThrow("Local endpoint failure");
      });
    });
  });
});
