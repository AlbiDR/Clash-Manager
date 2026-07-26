// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { normalizeTag, normalizeRarity, calculateRpos, calculateWeightedWinRate } from "../utils";

describe("Backend Shared Utilities", () => {
  describe("normalizeTag", () => {
    it("should uppercase the tag", () => {
      expect(normalizeTag("abc123")).toBe("#ABC123");
    });

    it("should add the hash prefix if missing", () => {
      expect(normalizeTag("V0P0V0")).toBe("#V0P0V0");
    });

    it("should not add a second hash if already present", () => {
      expect(normalizeTag("#V0P0V0")).toBe("#V0P0V0");
    });

    it("should trim whitespace", () => {
      expect(normalizeTag("  #v0p0v0  ")).toBe("#V0P0V0");
    });

    it("should handle mixed case tags", () => {
      expect(normalizeTag("#aBc123")).toBe("#ABC123");
    });
  });

  describe("normalizeRarity", () => {
    it("should map lowercase rarity to Title Case", () => {
      expect(normalizeRarity("common")).toBe("Common");
      expect(normalizeRarity("rare")).toBe("Rare");
      expect(normalizeRarity("epic")).toBe("Epic");
      expect(normalizeRarity("legendary")).toBe("Legendary");
      expect(normalizeRarity("champion")).toBe("Champion");
    });

    it("should map uppercase rarity to Title Case", () => {
      expect(normalizeRarity("COMMON")).toBe("Common");
    });

    it("should map mixed case rarity to Title Case", () => {
      expect(normalizeRarity("ePiC")).toBe("Epic");
    });

    it("should trim whitespace", () => {
      expect(normalizeRarity("  legendary  ")).toBe("Legendary");
    });

    it("should fallback to Common for unknown rarities", () => {
      expect(normalizeRarity("mythic")).toBe("Common");
      expect(normalizeRarity("")).toBe("Common");
    });

    it("should fallback to Common for null or undefined", () => {
      // @ts-expect-error - testing runtime safety
      expect(normalizeRarity(null)).toBe("Common");
      // @ts-expect-error - testing runtime safety
      expect(normalizeRarity(undefined)).toBe("Common");
    });
  });

  describe("calculateWeightedWinRate", () => {
    it("should have no floor: a low battle count contributes its raw ratio directly", () => {
      // performanceWins = (1 - 0) + 0 * 1.25 = 1; ratio = 1 / 1 = 1
      expect(calculateWeightedWinRate(1, 1, 0)).toBe(1);
    });

    it("should guard only against division by zero, returning 0 rather than NaN", () => {
      expect(calculateWeightedWinRate(0, 0, 0)).toBe(0);
      expect(calculateWeightedWinRate(25, 0, 10)).toBe(0);
    });

    it("should weight three-crown wins at the three-crown multiplier", () => {
      // performanceWins = (10 - 4) + 4 * 1.25 = 6 + 5 = 11; ratio = 11 / 20 = 0.55
      expect(calculateWeightedWinRate(10, 20, 4)).toBe(0.55);
    });
  });

  describe("calculateRpos", () => {
    const zeroParams = {
      trophies: 0,
      lifetime_donations: 0,
      legacy_war_wins: 0,
      wins: 0,
      battle_count: 0,
      three_crown_wins: 0,
      challenge_cards_won: 0,
      challenge_max_wins: 0,
    };

    it("should correctly calculate RPoS using the full formula", () => {
      // trophies: 5000 * 1.0 = 5000
      // lifetime_donations: 1000 * 0.1 = 100
      // performanceWins = (100 - 50) + 50 * 1.25 = 112.5; weightedWinRate = 112.5 / 200 = 0.5625
      // winRateWeight = (5000 * 1.0) * 0.35 = 1750; weighted term = 0.5625 * 1750 = 984.375
      // legacy_war_wins: 50 * 10 = 500
      // challenge_cards_won: min(500, cap) * 0.1 = 50
      // challenge_max_wins 5 < 12, no GC bonus
      // total = 5000 + 100 + 984.375 + 500 + 50 + 0 = 6634.375
      expect(
        calculateRpos({
          trophies: 5000,
          lifetime_donations: 1000,
          legacy_war_wins: 50,
          wins: 100,
          battle_count: 200,
          three_crown_wins: 50,
          challenge_cards_won: 500,
          challenge_max_wins: 5,
        }),
      ).toBe(6634.375);
    });

    it("should return exactly 0 for all-zero inputs", () => {
      expect(calculateRpos(zeroParams)).toBe(0);
    });

    it("should trigger the Grand Challenge bonus exactly at challenge_max_wins = 12", () => {
      const scoreAtThreshold = calculateRpos({
        ...zeroParams,
        trophies: 10000,
        challenge_max_wins: 12,
      });
      // winRateWeight = (10000 * 1.0) * 0.35 = 3500; bonus = 3500 * 0.4 = 1400
      // total = 10000 + 1400 = 11400
      expect(scoreAtThreshold).toBe(11400);
    });

    it("should not trigger the Grand Challenge bonus at challenge_max_wins = 11", () => {
      const scoreBelowThreshold = calculateRpos({
        ...zeroParams,
        trophies: 10000,
        challenge_max_wins: 11,
      });
      expect(scoreBelowThreshold).toBe(10000);
    });

    it("should cap challenge cards so values above the cap do not increase the score further", () => {
      const scoreAtCap = calculateRpos({ ...zeroParams, challenge_cards_won: 10000 });
      const scoreAboveCap = calculateRpos({ ...zeroParams, challenge_cards_won: 50000 });

      expect(scoreAtCap).toBe(1000);
      expect(scoreAboveCap).toBe(1000);
      expect(scoreAboveCap).toBe(scoreAtCap);
    });

    it("should contribute 0 for zero legacy war wins and a small positive amount for non-zero", () => {
      const scoreNoWar = calculateRpos({ ...zeroParams, legacy_war_wins: 0 });
      const scoreWithWar = calculateRpos({ ...zeroParams, legacy_war_wins: 5 });

      expect(scoreNoWar).toBe(0);
      expect(scoreWithWar).toBe(50);
      expect(scoreWithWar).toBeGreaterThan(scoreNoWar);
    });
  });
});
