// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  InternalProfileSchema,
  ExternalProfileSchema,
  ProfileInputSchema,
} from "../ProfileSchemas";

describe("ProfileSchemas", () => {
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
});
