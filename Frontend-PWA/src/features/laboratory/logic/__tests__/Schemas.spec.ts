// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RaritySchema,
  RawCardSchema,
  RawInventorySchema,
  ProfileInputSchema
} from "../Schemas";

describe("Laboratory Schemas", () => {
  describe("RaritySchema", () => {
    it("should pass valid rarities", () => {
      expect(v.parse(RaritySchema, "Common")).toBe("Common");
      expect(v.parse(RaritySchema, "Rare")).toBe("Rare");
      expect(v.parse(RaritySchema, "Epic")).toBe("Epic");
      expect(v.parse(RaritySchema, "Legendary")).toBe("Legendary");
      expect(v.parse(RaritySchema, "Champion")).toBe("Champion");
    });

    it("should normalize lowercase and trimmed rarities", () => {
      expect(v.parse(RaritySchema, " common ")).toBe("Common");
      expect(v.parse(RaritySchema, "RARE")).toBe("Rare");
      expect(v.parse(RaritySchema, "ePic")).toBe("Epic");
    });

    it("should fallback to Common for unknown rarities", () => {
      expect(v.parse(RaritySchema, "unknown")).toBe("Common");
      expect(v.parse(RaritySchema, "")).toBe("Common");
      expect(v.parse(RaritySchema, 123)).toBe("Common");
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
        rarity: "common",
        level: 14,
        count: 5000,
        isTowerTroop: false,
      };
      const result = v.parse(RawCardSchema, input);
      expect(result).toEqual({
        name: "Knight",
        rarity: "Common",
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

    it("should parse valid inventory data", () => {
      const input = {
        gold: 100000,
        gems: 500,
        wildCards: {
          Common: 100,
          Rare: 50,
        },
      };
      const result = v.parse(RawInventorySchema, input);
      expect(result.gold).toBe(100000);
      expect(result.gems).toBe(500);
      expect(result.wildCards.Common).toBe(100);
      expect(result.wildCards.Rare).toBe(50);
      expect(result.wildCards.Epic).toBe(0); // default
    });
  });

  describe("ProfileInputSchema", () => {
    it("should parse InternalProfileSchema branch", () => {
      const input = {
        profile: {
          name: "Player 1",
          tag: "ABC",
          kingLevel: 14,
        },
        cards: [{ name: "Archer Queen", rarity: "Champion" }],
        inventory: { gold: 1000 },
      };
      const result = v.parse(ProfileInputSchema, input);
      // We check for properties specific to InternalProfileSchema
      if ("profile" in result) {
        expect(result.profile.name).toBe("Player 1");
        expect(result.cards?.[0].name).toBe("Archer Queen");
        expect(result.inventory?.gold).toBe(1000);
      } else {
        throw new Error("Should have matched InternalProfileSchema");
      }
    });

    it("should parse ExternalProfileSchema branch", () => {
      const input = {
        name: "Player 2",
        tag: "XYZ",
        expLevel: 15,
        expPoints: 50000,
        cards: [{ name: "Pekka", rarity: "Epic" }],
        towerTroops: [{ name: "Tower Princess", rarity: "Common" }],
      };
      const result = v.parse(ProfileInputSchema, input);
      // We check for properties specific to ExternalProfileSchema
      if ("expLevel" in result) {
        expect(result.name).toBe("Player 2");
        expect(result.expLevel).toBe(15);
        expect(result.cards?.[0].name).toBe("Pekka");
        expect(result.towerTroops?.[0].name).toBe("Tower Princess");
      } else {
        throw new Error("Should have matched ExternalProfileSchema");
      }
    });

    it("should handle malformed data by attempting to match one of the branches", () => {
      // If it matches neither perfectly but has some common fields, union behavior depends on schema definitions.
      // Both schemas have optional fields.
      const input = { name: "Malformed" };
      // This actually matches ExternalProfileSchema because it has 'name' which is in both,
      // but 'expLevel' and 'expPoints' are optional in External.
      // Internal requires 'profile' object which is missing.
      const result = v.parse(ProfileInputSchema, input);
      expect(result).toHaveProperty("name", "Malformed");
    });
  });
});
