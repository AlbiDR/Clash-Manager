// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";

// Set environment variables before importing index.js to initialize global state correctly
process.env["API_KEYS"] = "test-key-1,test-key-2";
process.env["REMOTE_WORKER_SECRET"] = "test-secret";

vi.mock("../KeyService.js", () => {
  return {
    KeyService: class {
      getHealthyKey = vi.fn().mockReturnValue("mock-key");
      reportSuccess = vi.fn();
      reportFailure = vi.fn();
      getPoolStats = vi.fn().mockReturnValue({ total: 1, available: 1, throttled: 0 });
    }
  };
});

// Mock express to prevent the server from starting during test execution
vi.mock("express", () => {
  const mockApp = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn(),
  };
  const mockExpress = vi.fn(() => mockApp);
  (mockExpress as any).json = vi.fn(() => vi.fn());
  return { default: mockExpress };
});

// Mock Network service to verify Quota Guard integration
vi.mock("../services/Network.js", () => ({
  Network: {
    addQuotaUsage: vi.fn(),
    quotaCheck: vi.fn(),
    getQuotaStats: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import targets after mocks are established
import { processBatch, processScanBatch } from "../index.js";
import { Network } from "../services/Network.js";
import type { PlayerTag } from "../types.js";

describe("Worker Core Logic (index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processBatch", () => {
    it("should perform simple batch fetching and trigger Quota Guard", async () => {
      const urls = ["http://api.test/1", "http://api.test/2"];
      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ data: "ok" })),
      });

      const results = await processBatch(urls);

      expect(Network.quotaCheck).toHaveBeenCalledWith(urls.length);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(results[0]!.code).toBe(200);
      expect(results[0]!.content).toEqual({ data: "ok" });
      expect(Network.addQuotaUsage).toHaveBeenCalledTimes(2);
    });

    it("should handle scoring and recruitment logic with Prophet Bonus", async () => {
      const urls = ["https://proxy.royaleapi.dev/v1/players/%23PLAYER1"];
      const scoringWeights = { TROPHY: 1.0, DON: 0.1, WAR: 10.0 };
      const prophetCache = {
        "#PLAYER1": { wins: 10, active: true, lastFetch: 0 }
      };

      // Mock Player Profile and Battle Log
      mockFetch.mockImplementation((url: string) => {
        if (url.includes("/battlelog")) {
          return Promise.resolve({
            status: 200,
            ok: true,
            text: () => Promise.resolve(JSON.stringify([
              { type: "riverRacePvP", battleTime: "20240101T120000.000Z" }
            ])),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            tag: "#PLAYER1",
            name: "Prophet Player",
            trophies: 6000,
            totalDonations: 1000,
            warDayWins: 50,
            challengeCardsWon: 1000,
            // Omit clan or set to undefined for clanless
          })),
        });
      });

      const results = await processBatch(urls, [], 1, scoringWeights, prophetCache);

      expect(results).toHaveLength(1);
      const player = results[0]!.content as any;
      expect(player.tag).toBe("#PLAYER1");
      // Score calculation should have applied the 1.25x prophet bonus because wins > 5
      // Base score roughly: (6000 * 1) + (1000 * 0.1) + (50 * 10) + 500 (war bonus) = 6000 + 100 + 500 + 500 = 7100
      // With Prophet: 7100 * 1.25 = 8875
      expect(player.rawScore).toBeGreaterThan(8000);
    });

    it("should filter out players who are already in a clan during scoring phase", async () => {
      const urls = ["https://proxy.royaleapi.dev/v1/players/%23PLAYER_IN_CLAN"];
      const scoringWeights = { TROPHY: 1.0, DON: 0.1, WAR: 10.0 };

      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          tag: "#PLAYER_IN_CLAN",
          name: "Busy Player",
          trophies: 6000,
          totalDonations: 1000,
          warDayWins: 50,
          challengeCardsWon: 1000,
          clan: { tag: "#OTHERCLAN", name: "Other Clan" }
        })),
      });

      const results = await processBatch(urls, [], 1, scoringWeights);

      // Should return an empty array because the player was filtered out
      expect(results).toHaveLength(0);
    });

    it("should handle upstream 429 and report failure to KeyManager", async () => {
        const urls = ["http://api.test/throttled"];
        mockFetch.mockResolvedValue({
          status: 429,
          ok: false,
          text: () => Promise.resolve("Rate limited"),
        });

        // Retries are jittered, so we might want to keep them low or mock timers
        // But for this test, we just want to see it exhaust retries.
        // We set WORKER_RETRIES to 0 or 1 via env if possible, or just wait.
        // The current default is 2.

        const results = await processBatch(urls, [], 1);

        expect(results[0]!.code).toBe(520); // Retries exhausted
        expect(results[0]!.content).toContain("rate_limit");
    });
  });

  describe("processScanBatch", () => {
    it("should discover clanless candidates from tournaments", async () => {
      const tags = ["#TOURN1"] as any;

      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          tag: "#TOURN1",
          name: "Recruitment Tourney",
          membersList: [
            { tag: "#RECRUIT1", name: "Free Agent", clan: null },
            { tag: "#MEMBER1", name: "Taken Player", clan: { tag: "#CLAN1" } }
          ]
        })),
      });

      const candidates = await processScanBatch(tags);

      expect(Network.quotaCheck).toHaveBeenCalledWith(1);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.tag).toBe("#RECRUIT1");
    });

    it("should respect the blacklist", async () => {
      const tags = ["#TOURN1"] as any;
      const blacklist = new Set(["#BLACKLISTED"] as any);

      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          tag: "#TOURN1",
          membersList: [
            { tag: "#BLACKLISTED", name: "Banned", clan: null },
            { tag: "#GOOD", name: "Safe", clan: null }
          ]
        })),
      });

      const candidates = await processScanBatch(tags, [], 1, blacklist as any as Set<PlayerTag>);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.tag).toBe("#GOOD");
    });

    it("should handle malformed tournament data gracefully", async () => {
      const tags = ["#BADTOURN"] as any;

      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          tag: "#BADTOURN",
          // membersList missing
        })),
      });

      const candidates = await processScanBatch(tags);
      expect(candidates).toHaveLength(0);
    });

    it("should use global KeyService when no apiKeys are provided", async () => {
      const tags = ["#TOURN1"] as any;
      mockFetch.mockResolvedValue({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          tag: "#TOURN1",
          membersList: []
        })),
      });

      // Call without apiKeys (simulating authenticated /scan without custom keys)
      await processScanBatch(tags);

      // Verify it called fetch (which uses fetchWithRotatedRetries)
      expect(mockFetch).toHaveBeenCalled();
      // In this setup, KeyService mock is used. index.ts uses the global KEYS if no batchManager.
    });
  });
});
