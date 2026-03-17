// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RaritySchema,
  RawCardSchema,
  RawInventorySchema,
  ProfileInputSchema,
  MemberSchema,
  RecruitSchema
} from "../DataSchemas";

describe("Core DataSchemas", () => {
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

  describe("ProfileInputSchema", () => {
    it("should parse InternalProfileSchema branch", () => {
      const input = {
        profile: {
          name: "Internal Player",
          tag: "TAG1",
          kingLevel: 14,
        },
        cards: [{ name: "Knight" }],
        inventory: { gold: 5000 }
      };
      const result = v.parse(ProfileInputSchema, input);
      expect(result).toHaveProperty("profile");
      if ("profile" in result) {
        expect(result.profile.name).toBe("Internal Player");
      }
    });

    it("should parse ExternalProfileSchema branch", () => {
      const input = {
        name: "External Player",
        tag: "TAG2",
        expLevel: 15,
        expPoints: 10000,
        cards: [{ name: "Archer" }]
      };
      const result = v.parse(ProfileInputSchema, input);
      expect(result).toHaveProperty("expLevel");
      if ("expLevel" in result) {
        expect(result.name).toBe("External Player");
      }
    });
  });

  describe("MemberSchema", () => {
    const validMember = {
      id: "M1",
      n: "Member 1",
      t: 1000,
      performanceScore: 85,
      performanceRawScore: 1200,
      d: {
        role: "elder",
        days: 30,
        avg: 500,
        hist: "1|2|3"
      }
    };

    it("should parse valid member", () => {
      const result = v.parse(MemberSchema, validMember);
      expect(result.id).toBe("M1");
      expect(result.n).toBe("Member 1");
    });

    it("should fail for missing required fields", () => {
      const invalidMember = { ...validMember };
      delete (invalidMember as any).id;
      expect(() => v.parse(MemberSchema, invalidMember)).toThrow();
    });

    it("should fail for invalid types", () => {
      const invalidMember = { ...validMember, performanceScore: "high" };
      expect(() => v.parse(MemberSchema, invalidMember)).toThrow();
    });
  });

  describe("RecruitSchema", () => {
    const validRecruit = {
      id: "R1",
      n: "Recruit 1",
      t: 2000,
      potentialScore: 90,
      potentialRawScore: 1500,
      d: {
        don: 100,
        war: 10,
        ago: "2d"
      }
    };

    it("should parse valid recruit", () => {
      const result = v.parse(RecruitSchema, validRecruit);
      expect(result.id).toBe("R1");
      expect(result.potentialScore).toBe(90);
    });

    it("should fail for missing required fields", () => {
      const invalidRecruit = { ...validRecruit };
      delete (invalidRecruit as any).d;
      expect(() => v.parse(RecruitSchema, invalidRecruit)).toThrow();
    });
  });
});
