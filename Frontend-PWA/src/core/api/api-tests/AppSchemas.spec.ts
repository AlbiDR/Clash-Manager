// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  WebAppDataSchema,
} from "../AppSchemas";

describe("AppSchemas", () => {
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

    it("accepts optional per-snapshot publication freshness for old caches and unknown markers", () => {
      expect(v.parse(WebAppDataSchema, validAppData).rosterSnapshotRefreshedAt).toBeUndefined();
      expect(v.parse(WebAppDataSchema, {
        ...validAppData,
        rosterSnapshotRefreshedAt: 123,
        headhunterSnapshotRefreshedAt: null,
      })).toMatchObject({
        rosterSnapshotRefreshedAt: 123,
        headhunterSnapshotRefreshedAt: null,
      });
    });

    it("rejects malformed per-snapshot publication timestamps", () => {
      const result = v.safeParse(WebAppDataSchema, {
        ...validAppData,
        rosterSnapshotRefreshedAt: "not-a-timestamp",
      });
      expect(result.success).toBe(false);
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

    it("rejects invalid dataSource picklist values", () => {
      const invalidSource = { ...validAppData, dataSource: "UNSUPPORTED_PROVIDER" };
      const result = v.safeParse(WebAppDataSchema, invalidSource);
      expect(result.success).toBe(false);
    });

    it("defaults blacklist to empty array when omitted and accepts string arrays", () => {
      const withoutBlacklist = v.parse(WebAppDataSchema, validAppData);
      expect(withoutBlacklist.blacklist).toEqual([]);

      const withBlacklist = v.parse(WebAppDataSchema, {
        ...validAppData,
        blacklist: ["#TAG1", "#TAG2"],
      });
      expect(withBlacklist.blacklist).toEqual(["#TAG1", "#TAG2"]);
    });

    it("rejects non-string items or non-array types in blacklist", () => {
      const nonArrayBlacklist = v.safeParse(WebAppDataSchema, {
        ...validAppData,
        blacklist: "NOT_AN_ARRAY",
      });
      expect(nonArrayBlacklist.success).toBe(false);

      const invalidItemsBlacklist = v.safeParse(WebAppDataSchema, {
        ...validAppData,
        blacklist: ["#TAG1", 12345],
      });
      expect(invalidItemsBlacklist.success).toBe(false);
    });

    it("coerces numeric playerTag via SafeStringPipe and handles optional/absent playerTag", () => {
      const parsedWithTag = v.parse(WebAppDataSchema, {
        ...validAppData,
        playerTag: "#2p099v2q",
      });
      expect(parsedWithTag.playerTag).toBe("#2p099v2q");

      const parsedNumericTag = v.parse(WebAppDataSchema, {
        ...validAppData,
        playerTag: 12345678,
      });
      expect(parsedNumericTag.playerTag).toBe("12345678");

      const parsedWithoutTag = { ...validAppData };
      delete (parsedWithoutTag as any).playerTag;
      const resultWithoutTag = v.parse(WebAppDataSchema, parsedWithoutTag);
      expect(resultWithoutTag.playerTag).toBeUndefined();
    });

    it("accepts empty lb and hh arrays, but rejects malformed member/recruit entries", () => {
      const emptyLists = v.parse(WebAppDataSchema, {
        ...validAppData,
        lb: [],
        hh: [],
      });
      expect(emptyLists.lb).toEqual([]);
      expect(emptyLists.hh).toEqual([]);

      const malformedMember = v.safeParse(WebAppDataSchema, {
        ...validAppData,
        lb: [{ invalidMemberKey: true }],
      });
      expect(malformedMember.success).toBe(false);

      const malformedRecruit = v.safeParse(WebAppDataSchema, {
        ...validAppData,
        hh: [{ invalidRecruitKey: true }],
      });
      expect(malformedRecruit.success).toBe(false);
    });
  });
});
