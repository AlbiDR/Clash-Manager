// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RaritySchema,
  RawCardSchema,
  RawInventorySchema,
} from "../BaseSchemas";

describe("BaseSchemas", () => {
  describe("RaritySchema", () => {
    it("should pass valid rarities", () => {
      expect(v.parse(RaritySchema, "Common")).toBe("Common");
      expect(v.parse(RaritySchema, "Rare")).toBe("Rare");
      expect(v.parse(RaritySchema, "Epic")).toBe("Epic");
      expect(v.parse(RaritySchema, "Legendary")).toBe("Legendary");
      expect(v.parse(RaritySchema, "Champion")).toBe("Champion");
    });

    it("should normalize and transform input", () => {
      expect(v.parse(RaritySchema, " common ")).toBe("Common");
      expect(v.parse(RaritySchema, "RARE")).toBe("Rare");
      expect(v.parse(RaritySchema, "ePic")).toBe("Epic");
    });

    it("should fallback to Common for unknown input", () => {
      expect(v.parse(RaritySchema, "unknown")).toBe("Common");
      expect(v.parse(RaritySchema, null)).toBe("Common");
      expect(v.parse(RaritySchema, undefined)).toBe("Common");
    });
  });

  describe("RawCardSchema", () => {
    it("should use default values for empty object", () => {
      const result = v.parse(RawCardSchema, {});
      expect(result).toEqual({
        name: "Unknown Card",
        rarity: "Common",
        level: 1,
        count: 0,
        isTowerTroop: false,
      });
    });

    it("should parse valid card data", () => {
      const input = {
        name: "Knight",
        rarity: "rare",
        level: 14,
        count: 5000,
        isTowerTroop: false,
      };
      const result = v.parse(RawCardSchema, input);
      expect(result).toEqual({
        name: "Knight",
        rarity: "Rare",
        level: 14,
        count: 5000,
        isTowerTroop: false,
      });
    });
  });

  describe("RawInventorySchema", () => {
    it("should use default values for empty object", () => {
      const result = v.parse(RawInventorySchema, {});
      expect(result).toEqual({
        gold: 0,
        gems: 0,
        wildCards: {
          Common: 0,
          Rare: 0,
          Epic: 0,
          Legendary: 0,
          Champion: 0,
        },
      });
    });

    it("should handle partial wildcards", () => {
      const input = {
        gold: 100,
        wildCards: {
          Epic: 10
        }
      };
      const result = v.parse(RawInventorySchema, input);
      expect(result.gold).toBe(100);
      expect(result.gems).toBe(0);
      expect(result.wildCards.Epic).toBe(10);
      expect(result.wildCards.Common).toBe(0);
    });
  });
});
