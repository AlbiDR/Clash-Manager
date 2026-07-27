// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  MemberSchema,
  SbRosterRowSchema,
} from "../MemberSchemas";

describe("MemberSchemas", () => {
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

    it("should not strip d.winRate -- MemberSchema is the re-validation boundary WebAppDataSchema applies to synced/cached LeaderboardMembers", () => {
      const input = { ...validMember, d: { ...validMember.d, winRate: 0.564 } };
      const result = v.parse(MemberSchema, input);
      expect(result.d.winRate).toBe(0.564);
    });

    it("should default d.winRate to 0 when omitted", () => {
      const result = v.parse(MemberSchema, validMember);
      expect(result.d.winRate).toBe(0);
    });
  });

  describe("SbRosterRowSchema", () => {
    it("should parse valid roster row", () => {
      const input = {
        player_tag: "#ABC",
        player_name: "Hero",
        trophies: 5000,
        performance_score: 80,
        role: "elder",
        tenure_days: 100
      };
      const result = v.parse(SbRosterRowSchema, input);
      expect(result.player_tag).toBe("#ABC");
      expect(result.trophies).toBe(5000);
    });

    it("should handle missing fields with defaults", () => {
      const result = v.parse(SbRosterRowSchema, {});
      expect(result.player_name).toBe("Unknown");
      expect(result.trophies).toBe(0);
      expect(result.exp_level).toBe(1);
      expect(result.win_rate).toBe(0);
    });

    it("should parse win_rate when present", () => {
      const result = v.parse(SbRosterRowSchema, { win_rate: 0.564 });
      expect(result.win_rate).toBe(0.564);
    });

    it("should handle null/undefined fields via pipes", () => {
      const input = {
        player_tag: null,
        trophies: undefined,
        last_seen_at: null
      };
      const result = v.parse(SbRosterRowSchema, input);
      expect(result.player_tag).toBe("");
      expect(result.trophies).toBe(0);
      expect(result.last_seen_at).toBeNull();
    });
  });
});
