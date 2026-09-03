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
  SwSupabaseRowSchema,
  SwSupabaseResponseSchema,
  SwConfigSchema
} from "../swSchemas";

describe("swSchemas", () => {
  describe("SwSupabaseRowSchema", () => {
    it("should validate a correct row", () => {
      const mockRowCandidate = { s: 80 };
      expect(v.safeParse(SwSupabaseRowSchema, mockRowCandidate).success).toBe(true);
    });

    it("should fail for out of bounds score", () => {
      expect(v.safeParse(SwSupabaseRowSchema, { s: -1 }).success).toBe(false);
      expect(v.safeParse(SwSupabaseRowSchema, { s: 101 }).success).toBe(false);
    });

    it("should fail for invalid types", () => {
      expect(v.safeParse(SwSupabaseRowSchema, { s: "80" }).success).toBe(false);
      expect(v.safeParse(SwSupabaseRowSchema, {}).success).toBe(false);
    });
  });

  describe("SwSupabaseResponseSchema", () => {
    it("should validate a correct array of rows", () => {
      const mockResponsePayload = [{ s: 0 }, { s: 100 }, { s: 50 }];
      expect(v.safeParse(SwSupabaseResponseSchema, mockResponsePayload).success).toBe(true);
    });

    it("should validate an empty array", () => {
      expect(v.safeParse(SwSupabaseResponseSchema, []).success).toBe(true);
    });

    it("should fail if any item is invalid", () => {
      const invalidResponseCandidate = [{ s: 80 }, { s: 150 }];
      expect(v.safeParse(SwSupabaseResponseSchema, invalidResponseCandidate).success).toBe(false);
    });
  });

  describe("SwConfigSchema", () => {
    const validConfig = {
      supabaseUrl: "https://example.supabase.co",
      supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      notificationThreshold: 75,
      notificationsEnabled: true
    };

    it("should validate a correct config", () => {
      expect(v.safeParse(SwConfigSchema, validConfig).success).toBe(true);
    });

    it("should allow threshold 50", () => {
      expect(v.safeParse(SwConfigSchema, { ...validConfig, notificationThreshold: 50 }).success).toBe(true);
    });

    it("should fail for invalid URL", () => {
      expect(v.safeParse(SwConfigSchema, { ...validConfig, supabaseUrl: "not-a-url" }).success).toBe(false);
    });

    it("should fail for empty key", () => {
      expect(v.safeParse(SwConfigSchema, { ...validConfig, supabaseKey: "" }).success).toBe(false);
    });

    it("should fail for invalid threshold", () => {
      expect(v.safeParse(SwConfigSchema, { ...validConfig, notificationThreshold: 80 }).success).toBe(false);
    });

    it("should fail for missing fields", () => {
      const { notificationsEnabled: _notificationsEnabled, ...incomplete } = validConfig;
      expect(v.safeParse(SwConfigSchema, incomplete).success).toBe(false);
    });
  });
});
