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
  DismissalRequestSchema,
  OfflineActionSchema,
  OfflineQueueSchema,
} from "../OfflineSchemas";

describe("OfflineSchemas", () => {
  describe("DismissalRequestSchema", () => {
    it("should parse valid dismissal request", () => {
      const input = { id: "TAG1", score: 80 };
      const result = v.parse(DismissalRequestSchema, input);
      expect(result).toEqual(input);
    });

    it("should coerce types via pipes", () => {
      const input = { id: 12345, score: "95" };
      const result = v.parse(DismissalRequestSchema, input);
      expect(result).toEqual({ id: "12345", score: 95 });
    });

    it("should fail for missing fields", () => {
      const result = v.safeParse(DismissalRequestSchema, { id: "TAG1" });
      expect(result.success).toBe(false);
    });
  });

  describe("OfflineActionSchema", () => {
    it("should parse RECRUIT_DISMISSAL variant", () => {
      const input = {
        type: "RECRUIT_DISMISSAL",
        items: [{ id: "T1", score: 50 }],
        timestamp: 123456789
      };
      const result = v.parse(OfflineActionSchema, input);
      expect(result).toEqual(input);
    });

    it("should parse RECRUIT_RESTORATION variant", () => {
      const input = {
        type: "RECRUIT_RESTORATION",
        ids: ["T1", "T2"],
        timestamp: "123456789" // Should be coerced to number
      };
      const result = v.parse(OfflineActionSchema, input);
      expect(result.type).toBe("RECRUIT_RESTORATION");
      expect(result.timestamp).toBe(123456789);
    });

    it("should fail for invalid variant type", () => {
      const input = {
        type: "INVALID_ACTION",
        timestamp: Date.now()
      };
      const result = v.safeParse(OfflineActionSchema, input);
      expect(result.success).toBe(false);
    });

    it("should fail for variant with missing required array", () => {
      const input = {
        type: "RECRUIT_DISMISSAL",
        timestamp: Date.now()
      };
      const result = v.safeParse(OfflineActionSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe("OfflineQueueSchema", () => {
    it("should parse valid array of actions", () => {
      const input = [
        {
          type: "RECRUIT_DISMISSAL",
          items: [{ id: "T1", score: 50 }],
          timestamp: 123
        },
        {
          type: "RECRUIT_RESTORATION",
          ids: ["T2"],
          timestamp: 456
        }
      ];
      const result = v.parse(OfflineQueueSchema, input);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("RECRUIT_DISMISSAL");
    });

    it("should fail for non-array input", () => {
      const result = v.safeParse(OfflineQueueSchema, {});
      expect(result.success).toBe(false);
    });
  });
});
