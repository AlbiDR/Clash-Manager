// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { normalizeTag, normalizeRarity, calculateRpos } from "../utils";

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

  describe("calculateRpos", () => {
    it("should correctly calculate RPoS using the authoritative formula", () => {
      // Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
      // 5000 + (1000 * 0.1) + (50 + 500) * 20
      // 5000 + 100 + 11000 = 16100
      expect(calculateRpos(5000, 1000, 50)).toBe(16100);
    });

    it("should handle zero values correctly", () => {
      // 0 + 0 + (0 + 500) * 20 = 10000
      expect(calculateRpos(0, 0, 0)).toBe(10000);
    });

    it("should handle high values without overflow", () => {
      // 9000 + (500000 * 0.1) + (1000 + 500) * 20
      // 9000 + 50000 + 30000 = 89000
      expect(calculateRpos(9000, 500000, 1000)).toBe(89000);
    });

    it("should handle negative values (though unlikely in production)", () => {
      // -100 + (-1000 * 0.1) + (-100 + 500) * 20
      // -100 - 100 + 8000 = 7800
      expect(calculateRpos(-100, -1000, -100)).toBe(7800);
    });

    it("should prioritize war wins in the score calculation", () => {
      const score1 = calculateRpos(5000, 0, 10); // 5000 + 0 + (510 * 20) = 15200
      const score2 = calculateRpos(6000, 0, 0);  // 6000 + 0 + (500 * 20) = 16000
      // Increase war wins by 50
      const score3 = calculateRpos(5000, 0, 60); // 5000 + 0 + (560 * 20) = 16200

      expect(score3).toBeGreaterThan(score2);
    });
  });
});
