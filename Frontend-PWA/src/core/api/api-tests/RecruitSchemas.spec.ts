// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RecruitSchema,
  SbHeadhunterRowSchema,
  RecruitTombstoneSchema,
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

  describe("SbHeadhunterRowSchema", () => {
    it("should parse valid headhunter row", () => {
      const input = {
        player_tag: "#XYZ",
        player_name: "Recruit",
        trophies: 4000,
        potential_score: 90,
        donations: 500
      };
      const result = v.parse(SbHeadhunterRowSchema, input);
      expect(result.player_tag).toBe("#XYZ");
      expect(result.potential_score).toBe(90);
    });

    it("should handle missing fields with defaults", () => {
      const result = v.parse(SbHeadhunterRowSchema, {});
      expect(result.player_name).toBe("Unknown");
      expect(result.donations).toBe(0);
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
});
