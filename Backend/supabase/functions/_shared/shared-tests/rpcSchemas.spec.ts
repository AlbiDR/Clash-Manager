// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  PlayerSyncPayloadSchema,
  ShadowTargetSchema,
  StaleRecruitSchema,
  HeadhunterContextSchema,
  DiscoveryAnchorSchema,
  DiscoveryCacheItemSchema,
  IngestionTargetsSchema,
  RecruitFateSchema,
} from "../rpcSchemas";

describe("L1 Core Supabase RPC Schemas", () => {
  describe("PlayerSyncPayloadSchema", () => {
    it("should parse valid player tags with and without '#' prefix", () => {
      expect(v.parse(PlayerSyncPayloadSchema, { tag: "#PP80QG99" })).toEqual({
        tag: "#PP80QG99",
      });
      expect(v.parse(PlayerSyncPayloadSchema, { tag: "PP80QG99" })).toEqual({
        tag: "PP80QG99",
      });
    });

    it("should reject invalid/malformed player tags", () => {
      expect(() =>
        v.parse(PlayerSyncPayloadSchema, { tag: "#INVALID_CHAR!" })
      ).toThrow();
      expect(() => v.parse(PlayerSyncPayloadSchema, { tag: "#12" })).toThrow();
      expect(() => v.parse(PlayerSyncPayloadSchema, {})).toThrow();
    });
  });

  describe("ShadowTargetSchema", () => {
    it("should parse valid shadow target payload", () => {
      const input = { opponent_player_tag: "#2P0YY99L" };
      expect(v.parse(ShadowTargetSchema, input)).toEqual(input);
    });

    it("should reject payload missing opponent_player_tag or with non-string type", () => {
      expect(() => v.parse(ShadowTargetSchema, {})).toThrow();
      expect(() =>
        v.parse(ShadowTargetSchema, { opponent_player_tag: 12345 })
      ).toThrow();
    });
  });

  describe("StaleRecruitSchema", () => {
    it("should parse valid stale recruit payload", () => {
      const input = { player_tag: "#80QG99P" };
      expect(v.parse(StaleRecruitSchema, input)).toEqual(input);
    });

    it("should reject invalid stale recruit payload", () => {
      expect(() => v.parse(StaleRecruitSchema, {})).toThrow();
      expect(() =>
        v.parse(StaleRecruitSchema, { player_tag: null })
      ).toThrow();
    });
  });

  describe("HeadhunterContextSchema", () => {
    it("should parse valid headhunter context payload", () => {
      const input = {
        required_trophies: 6000,
        exclusion_tags: ["#TAG1", "#TAG2"],
      };
      expect(v.parse(HeadhunterContextSchema, input)).toEqual(input);
    });

    it("should reject payload missing required fields or having wrong types", () => {
      expect(() =>
        v.parse(HeadhunterContextSchema, {
          required_trophies: "6000",
          exclusion_tags: [],
        })
      ).toThrow();
      expect(() =>
        v.parse(HeadhunterContextSchema, { required_trophies: 6000 })
      ).toThrow();
    });
  });

  describe("DiscoveryAnchorSchema", () => {
    it("should parse valid discovery anchor payload", () => {
      const input = { keyword: "ROYALE" };
      expect(v.parse(DiscoveryAnchorSchema, input)).toEqual(input);
    });

    it("should reject missing keyword or non-string keyword", () => {
      expect(() => v.parse(DiscoveryAnchorSchema, {})).toThrow();
      expect(() =>
        v.parse(DiscoveryAnchorSchema, { keyword: true })
      ).toThrow();
    });
  });

  describe("DiscoveryCacheItemSchema", () => {
    it("should parse valid discovery cache item", () => {
      const input = { player_tag: "#V8L90C" };
      expect(v.parse(DiscoveryCacheItemSchema, input)).toEqual(input);
    });

    it("should reject invalid discovery cache item", () => {
      expect(() => v.parse(DiscoveryCacheItemSchema, {})).toThrow();
    });
  });

  describe("IngestionTargetsSchema", () => {
    it("should parse and transform drivers.members and drivers.recruits to bare keys", () => {
      const input = {
        "drivers.members": ["#MEMBER1", "#MEMBER2"],
        "drivers.recruits": ["#RECRUIT1"],
      };
      const result = v.parse(IngestionTargetsSchema, input);
      expect(result).toEqual({
        members: ["#MEMBER1", "#MEMBER2"],
        recruits: ["#RECRUIT1"],
      });
    });

    it("should reject missing drivers.members or drivers.recruits", () => {
      expect(() =>
        v.parse(IngestionTargetsSchema, {
          "drivers.members": ["#MEMBER1"],
        })
      ).toThrow();
      expect(() =>
        v.parse(IngestionTargetsSchema, {
          members: ["#MEMBER1"],
          recruits: ["#RECRUIT1"],
        })
      ).toThrow();
    });

    it("should reject non-array items in drivers.members or drivers.recruits", () => {
      expect(() =>
        v.parse(IngestionTargetsSchema, {
          "drivers.members": "not-an-array",
          "drivers.recruits": [],
        })
      ).toThrow();
    });
  });

  describe("RecruitFateSchema", () => {
    it("should parse valid recruit fate with numeric raw_potential_score", () => {
      const input = {
        status: "ACCEPTED",
        raw_potential_score: 95.5,
      };
      expect(v.parse(RecruitFateSchema, input)).toEqual(input);
    });

    it("should parse valid recruit fate with string raw_potential_score", () => {
      const input = {
        status: "REJECTED",
        raw_potential_score: "N/A",
      };
      expect(v.parse(RecruitFateSchema, input)).toEqual(input);
    });

    it("should reject invalid raw_potential_score types or missing status", () => {
      expect(() =>
        v.parse(RecruitFateSchema, {
          status: "PENDING",
          raw_potential_score: true,
        })
      ).toThrow();
      expect(() =>
        v.parse(RecruitFateSchema, {
          raw_potential_score: 100,
        })
      ).toThrow();
    });
  });
});
