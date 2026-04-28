// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecruitmentService } from "../services/RecruitmentService.js";
import { RoyaleApiService } from "../services/RoyaleApiService.js";
import { Network } from "../services/Network.js";
import { KeyService } from "../KeyService.js";
import type { PlayerTag, TournamentTag } from "../types.js";

// Mock RoyaleApiService
vi.mock("../services/RoyaleApiService.js", () => ({
  RoyaleApiService: {
    fetchWithRotatedRetries: vi.fn(),
  },
}));

// Mock Network
vi.mock("../services/Network.js", () => ({
  Network: {
    quotaCheck: vi.fn(),
    addQuotaUsage: vi.fn(),
  },
}));

describe("RecruitmentService", () => {
  const mockKeyService = {
    getHealthyKey: vi.fn().mockReturnValue("mock-key"),
    reportSuccess: vi.fn(),
    reportFailure: vi.fn(),
  } as unknown as KeyService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateWarWeekId", () => {
    it("should return 'Unknown' for empty input", () => {
      expect(RecruitmentService.calculateWarWeekId("")).toBe("Unknown");
    });

    it("should calculate a valid WarWeekId for a Royale API date string", () => {
      // Royale API date format is typically YYYYMMDDTHHMMSS.SSSZ
      const dateString = "20240101T120000.000Z";
      const result = RecruitmentService.calculateWarWeekId(dateString);
      expect(result).toMatch(/^\d{2}W\d{2}$/); // YYWnn format
    });
  });

  describe("processBatch", () => {
    it("should perform simple batch fetching without scoring", async () => {
      const endpoints = ["/endpoint1", "/endpoint2"];
      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValue({
        code: 200,
        content: { data: "success" },
      });

      const results = await RecruitmentService.processBatch(endpoints, [], 2, null, undefined, 0, mockKeyService);

      expect(Network.quotaCheck).toHaveBeenCalledWith(endpoints.length);
      expect(RoyaleApiService.fetchWithRotatedRetries).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(results[0].code).toBe(200);
    });

    it("should handle recruitment scoring and filtering", async () => {
      const endpoints = ["/players/%23PLAYER1"];
      const scoringWeights = { TROPHY: 1.0, DON: 0.1, WAR: 10.0, WAR_BASELINE_BONUS: 500 };

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries)
        .mockResolvedValueOnce({ // Profile fetch
          code: 200,
          content: {
            tag: "#PLAYER1",
            name: "Test Player",
            trophies: 6000,
            totalDonations: 1000,
            warDayWins: 50,
            challengeCardsWon: 100,
          },
        })
        .mockResolvedValueOnce({ // Battle log fetch
          code: 200,
          content: [
            { type: "riverRacePvP", battleTime: "20240101T120000.000Z" }
          ],
        });

      const results = await RecruitmentService.processBatch(endpoints, [], 1, scoringWeights, undefined, 0, mockKeyService);

      expect(results).toHaveLength(1);
      const player = results[0].content as any;
      expect(player.tag).toBe("#PLAYER1");
      expect(player.rawScore).toBeDefined();
    });

    it("should apply prophet bonus when wins > 5", async () => {
      const endpoints = ["/players/%23PROPHET"];
      const scoringWeights = { TROPHY: 1.0, DON: 0, WAR: 0, WAR_BASELINE_BONUS: 0 };
      const prophetCache = {
        "#PROPHET": { wins: 10, active: true, lastFetch: 0 }
      };

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries)
        .mockResolvedValueOnce({
          code: 200,
          content: {
            tag: "#PROPHET",
            name: "Prophet",
            trophies: 5000,
            totalDonations: 0,
            warDayWins: 0,
            challengeCardsWon: 0,
          },
        })
        .mockResolvedValueOnce({
          code: 200,
          content: []
        }); // No war activity

      const results = await RecruitmentService.processBatch(endpoints, [], 1, scoringWeights, prophetCache, 0, mockKeyService);

      expect(results).toHaveLength(1);
      const player = results[0].content as any;
      // Base score 5000. Bonus 1.25x -> 6250
      expect(player.rawScore).toBe(6250);
    });

    it("should discard players below minTrophyThreshold", async () => {
      const endpoints = ["/players/%23LOW"];
      const scoringWeights = { TROPHY: 1.0, DON: 0, WAR: 0 };

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValueOnce({
        code: 200,
        content: { tag: "#LOW", name: "Low", trophies: 3000 },
      });

      const results = await RecruitmentService.processBatch(endpoints, [], 1, scoringWeights, undefined, 5000, mockKeyService);
      expect(results).toHaveLength(0);
    });

    it("should discard players already in a clan", async () => {
      const endpoints = ["/players/%23CLAN"];
      const scoringWeights = { TROPHY: 1.0, DON: 0, WAR: 0 };

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValueOnce({
        code: 200,
        content: {
          tag: "#CLAN",
          name: "In Clan",
          trophies: 6000,
          clan: { tag: "#SOMECLAN", name: "Some Clan" }
        },
      });

      const results = await RecruitmentService.processBatch(endpoints, [], 1, scoringWeights, undefined, 0, mockKeyService);
      expect(results).toHaveLength(0);
    });

    it("should integrate league trophies if trophies >= 9000", async () => {
      const endpoints = ["/players/%23PRO"];
      const scoringWeights = { TROPHY: 1.0, DON: 0, WAR: 0 };

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValueOnce({
        code: 200,
        content: {
          tag: "#PRO",
          name: "Pro",
          trophies: 9000,
          totalDonations: 0,
          warDayWins: 0,
          challengeCardsWon: 0,
          leagueStatistics: { currentSeason: { trophies: 1500 } }
        },
      });

      const results = await RecruitmentService.processBatch(endpoints, [], 1, scoringWeights, undefined, 0, mockKeyService);
      expect(results).toHaveLength(1);
      const player = results[0].content as any;
      expect(player.trophies).toBe(10500); // 9000 + 1500
    });
  });

  describe("processScanBatch", () => {
    it("should discover candidates from tournament members", async () => {
      const tags = ["#TOURN1"] as TournamentTag[];
      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValue({
        code: 200,
        content: {
          tag: "#TOURN1",
          name: "Test Tourney",
          membersList: [
            { tag: "#CANDIDATE1", name: "Free Agent", score: 0, clan: null },
            { tag: "#TAKEN", name: "Taken", score: 0, clan: { tag: "#CLAN1" } }
          ]
        },
      });

      const results = await RecruitmentService.processScanBatch(tags, [], 1, new Set(), undefined, undefined, mockKeyService);

      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe("#CANDIDATE1");
    });

    it("should respect the blacklist", async () => {
      const tags = ["#TOURN1"] as TournamentTag[];
      const blacklist = new Set(["#BANNED"] as PlayerTag[]);

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValue({
        code: 200,
        content: {
          tag: "#TOURN1",
          membersList: [
            { tag: "#BANNED", name: "Banned", clan: null },
            { tag: "#GOOD", name: "Good", clan: null }
          ]
        },
      });

      const results = await RecruitmentService.processScanBatch(tags, [], 1, blacklist, undefined, undefined, mockKeyService);
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe("#GOOD");
    });

    it("should capture diagnostic trace", async () => {
      const tags = ["#TOURN1"] as TournamentTag[];
      const trace = { firstUrl: "", firstStatus: 0, firstContent: "", keyUsed: "" };

      vi.mocked(RoyaleApiService.fetchWithRotatedRetries).mockResolvedValue({
        code: 200,
        content: { tag: "#TOURN1", membersList: [] },
      });

      await RecruitmentService.processScanBatch(tags, [], 1, new Set(), undefined, trace, mockKeyService);

      expect(trace.firstStatus).toBe(200);
      expect(trace.firstUrl).toContain("TOURN1");
    });
  });
});
