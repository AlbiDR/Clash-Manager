// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RaritySchema,
  RawCardSchema,
  RawInventorySchema,
  ProfileInputSchema,
  InternalProfileSchema,
  ExternalProfileSchema,
  MemberSchema,
  RecruitSchema,
  WebAppDataSchema
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

  describe("InternalProfileSchema", () => {
    it("should parse valid internal profile", () => {
      const input = {
        profile: {
          name: "Internal Player",
          tag: "TAG1",
          kingLevel: 14,
          xpIntoLevel: 1000,
        },
        cards: [{ name: "Knight" }],
        inventory: { gold: 5000 }
      };
      const result = v.parse(InternalProfileSchema, input);
      expect(result.profile.name).toBe("Internal Player");
      expect(result.profile.kingLevel).toBe(14);
      expect(result.inventory?.gold).toBe(5000);
    });

    it("should use defaults for empty internal profile", () => {
      const result = v.parse(InternalProfileSchema, { profile: {} });
      expect(result.profile.name).toBe("Unknown");
      expect(result.cards).toEqual([]);
      expect(result.inventory).toEqual({
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
  });

  describe("ExternalProfileSchema", () => {
    it("should parse valid external profile", () => {
      const input = {
        name: "External Player",
        tag: "TAG2",
        expLevel: 15,
        expPoints: 10000,
        cards: [{ name: "Archer" }],
        towerTroops: []
      };
      const result = v.parse(ExternalProfileSchema, input);
      expect(result.name).toBe("External Player");
      expect(result.expLevel).toBe(15);
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

  describe("SafeNumberPipe & SafeStringPipe (via MemberSchema)", () => {
    const baseMember = {
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

    it("SafeNumberPipe: should handle formatted strings (commas, percentages)", () => {
      const input = { ...baseMember, t: "1,234", performanceScore: "85%" };
      const result = v.parse(MemberSchema, input);
      expect(result.t).toBe(1234);
      expect(result.performanceScore).toBe(85);
    });

    it("SafeNumberPipe: should handle empty strings as 0", () => {
      const input = { ...baseMember, t: "  " };
      const result = v.parse(MemberSchema, input);
      expect(result.t).toBe(0);
    });

    it("SafeNumberPipe: should reject non-numeric strings", () => {
      const input = { ...baseMember, t: "not-a-number" };
      expect(() => v.parse(MemberSchema, input)).toThrow();
    });

    it("SafeStringPipe: should coerce numbers and booleans to strings", () => {
      const input = { ...baseMember, id: 12345, n: true };
      const result = v.parse(MemberSchema, input);
      expect(result.id).toBe("12345");
      expect(result.n).toBe("true");
    });

    it("SafeStringPipe: should handle null/undefined as empty strings", () => {
      const input = { ...baseMember, id: null, n: undefined };
      const result = v.parse(MemberSchema, input);
      expect(result.id).toBe("");
      expect(result.n).toBe("");
    });
  });

  describe("MemberSchema Optional/Nullable Fields", () => {
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

    it("should parse member with all optional fields", () => {
      const input = {
        ...validMember,
        dt: 123456,
        d: {
          ...validMember.d,
          seen: "2h ago",
          rate: "100%",
          wfame: 500
        }
      };
      const result = v.parse(MemberSchema, input);
      expect(result.dt).toBe(123456);
      expect(result.d.seen).toBe("2h ago");
      expect(result.d.rate).toBe("100%");
      expect(result.d.wfame).toBe(500);
    });

    it("should handle null for seen and rate", () => {
      const input = {
        ...validMember,
        d: {
          ...validMember.d,
          seen: null,
          rate: null
        }
      };
      const result = v.parse(MemberSchema, input);
      expect(result.d.seen).toBeNull();
      expect(result.d.rate).toBeNull();
    });
  });

  describe("RecruitSchema Optional Fields", () => {
    const validRecruit = {
      id: "R1",
      n: "Recruit 1",
      t: 2000,
      d: {
        don: 100,
        war: 10,
        ago: "2d"
      }
    };

    it("should parse recruit with all optional fields", () => {
      const input = {
        ...validRecruit,
        potentialScore: 90,
        potentialRawScore: 1500,
        lastScan: 123456,
        d: {
          ...validRecruit.d,
          cards: 40
        }
      };
      const result = v.parse(RecruitSchema, input);
      expect(result.potentialScore).toBe(90);
      expect(result.potentialRawScore).toBe(1500);
      expect(result.lastScan).toBe(123456);
      expect(result.d.cards).toBe(40);
    });
  });

  describe("LaxNumberPipe", () => {
    it("should accept numbers", () => {
      // Testing via WebAppDataSchema which uses LaxNumberPipe for its metadata fields
      const input = { lb: [], hh: [], timestamp: 1, remoteTimestamp: 123 };
      expect(v.parse(WebAppDataSchema, input).remoteTimestamp).toBe(123);
    });

    it("should coerce numeric strings", () => {
      const input = { lb: [], hh: [], timestamp: 1, lastCompiled: "456" };
      expect(v.parse(WebAppDataSchema, input).lastCompiled).toBe(456);
    });

    it("should fallback to 0 for invalid input instead of throwing", () => {
      const input = { lb: [], hh: [], timestamp: 1, lastFetched: "garbage" };
      expect(v.parse(WebAppDataSchema, input).lastFetched).toBe(0);
      
      const inputNull = { lb: [], hh: [], timestamp: 1, lastFetched: null };
      expect(v.parse(WebAppDataSchema, inputNull).lastFetched).toBe(0);
    });
  });

  describe("WebAppDataSchema", () => {
    const validAppData = {
      lb: [
        {
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
        }
      ],
      hh: [
        {
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
        }
      ],
      playerTag: "MYTAG",
      timestamp: 123456789,
      dataSource: "SUPABASE",
      remoteTimestamp: "invalid_date" // LaxNumberPipe will handle this
    };

    it("should parse valid WebAppData with Supabase attribution", () => {
      const result = v.parse(WebAppDataSchema, validAppData);
      expect(result.dataSource).toBe("SUPABASE");
      expect(result.remoteTimestamp).toBe(0); // Coerced to 0
      expect(result.lb).toHaveLength(1);
    });

    it("should fail for missing required fields (Validation Boundary)", () => {
      const invalidAppData = { ...validAppData };
      delete (invalidAppData as any).timestamp;

      const result = v.safeParse(WebAppDataSchema, invalidAppData);
      expect(result.success).toBe(false);
    });

    it("should fail for invalid data types in core fields", () => {
      const invalidAppData = { ...validAppData, timestamp: "not-a-number" };
      const result = v.safeParse(WebAppDataSchema, invalidAppData);
      expect(result.success).toBe(false);
    });
  });


});
