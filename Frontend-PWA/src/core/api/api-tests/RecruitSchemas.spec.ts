// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RecruitSchema,
  SbHeadhunterRowSchema,
  RecruitTombstoneSchema,
  DismissResponseSchema,
  HarvestedPlayerSchema,
  LeaderboardHarvestSchema,
  BlacklistEventSchema,
} from "../RecruitSchemas";

describe("RecruitSchemas", () => {
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
          cards: 40,
          winRate: 0.564
        }
      };
      const result = v.parse(RecruitSchema, input);
      expect(result.potentialScore).toBe(90);
      expect(result.potentialRawScore).toBe(1500);
      expect(result.lastScan).toBe(123456);
      expect(result.d.cards).toBe(40);
      expect(result.d.winRate).toBe(0.564);
    });

    it("should default d.winRate to 0 when omitted", () => {
      const result = v.parse(RecruitSchema, validRecruit);
      expect(result.d.winRate).toBe(0);
    });
  });

  describe("SbHeadhunterRowSchema", () => {
    it("should parse valid headhunter row", () => {
      const input = {
        player_tag: "#XYZ",
        player_name: "Recruit",
        trophies: 4000,
        potential_score: 90,
        donations: 500,
        win_rate: 0.564
      };
      const result = v.parse(SbHeadhunterRowSchema, input);
      expect(result.player_tag).toBe("#XYZ");
      expect(result.potential_score).toBe(90);
      expect(result.win_rate).toBe(0.564);
    });

    it("should handle missing fields with defaults", () => {
      const result = v.parse(SbHeadhunterRowSchema, {});
      expect(result.player_name).toBe("Unknown");
      expect(result.donations).toBe(0);
      expect(result.win_rate).toBe(0);
    });
  });

  describe("RecruitTombstoneSchema", () => {
    it("should parse valid tombstone array", () => {
      const input = ["#ID1", "#ID2"];
      const result = v.parse(RecruitTombstoneSchema, input);
      expect(result).toEqual(input);
    });

    it("should fail for non-array input", () => {
      const result = v.safeParse(RecruitTombstoneSchema, { not: "an array" });
      expect(result.success).toBe(false);
    });

    it("should fail for array with non-string elements", () => {
      const result = v.safeParse(RecruitTombstoneSchema, [123]);
      expect(result.success).toBe(false);
    });
  });

  describe("DismissResponseSchema", () => {
    it("should parse valid dismiss response", () => {
      const input = { success: true, count: 3, message: "OK" };
      const result = v.parse(DismissResponseSchema, input);
      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.message).toBe("OK");
    });

    it("should parse valid dismiss response with only required fields", () => {
      const input = { success: false };
      const result = v.parse(DismissResponseSchema, input);
      expect(result.success).toBe(false);
      expect(result.count).toBeUndefined();
    });

    it("should fail if success field is missing", () => {
      const input = { count: 1 };
      const result = v.safeParse(DismissResponseSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe("HarvestedPlayerSchema", () => {
    it("should parse valid harvested player", () => {
      const input = { tag: "#ABC", name: "Player", clan: { name: "Clan" } };
      const result = v.parse(HarvestedPlayerSchema, input);
      expect(result.tag).toBe("#ABC");
      expect(result.name).toBe("Player");
    });

    it("should handle optional clan field", () => {
      const input = { tag: "#XYZ", name: "Solo" };
      const result = v.parse(HarvestedPlayerSchema, input);
      expect(result.tag).toBe("#XYZ");
      expect(result.clan).toBeUndefined();
    });

    it("should fail if tag is missing", () => {
      const input = { name: "No Tag" };
      const result = v.safeParse(HarvestedPlayerSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe("LeaderboardHarvestSchema", () => {
    it("should parse valid leaderboard harvest", () => {
      const input = {
        items: [
          { tag: "#P1", name: "Player 1" },
          { tag: "#P2", name: "Player 2" }
        ],
        region: "Global"
      };
      const result = v.parse(LeaderboardHarvestSchema, input);
      expect(result.items).toHaveLength(2);
      expect(result.region).toBe("Global");
    });

    it("should handle default region", () => {
      const input = { items: [] };
      const result = v.parse(LeaderboardHarvestSchema, input);
      expect(result.region).toBe("Unknown");
    });

    it("should fail if items field is missing", () => {
      const input = { region: "Mars" };
      const result = v.safeParse(LeaderboardHarvestSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe("BlacklistEventSchema", () => {
    it("should parse valid INSERT event", () => {
      const input = { new: { player_tag: "#NEW123" } };
      const result = v.parse(BlacklistEventSchema, input);
      expect('new' in result && result.new.player_tag).toBe("#NEW123");
    });

    it("should parse valid DELETE event", () => {
      const input = { old: { player_tag: "#OLD456" } };
      const result = v.parse(BlacklistEventSchema, input);
      expect('old' in result && result.old.player_tag).toBe("#OLD456");
    });

    it("should fail for malformed payloads", () => {
      expect(v.safeParse(BlacklistEventSchema, { foo: "bar" }).success).toBe(false);
      expect(v.safeParse(BlacklistEventSchema, { new: {} }).success).toBe(false);
      expect(v.safeParse(BlacklistEventSchema, { old: { tag: "#NO" } }).success).toBe(false);
    });
  });
});
