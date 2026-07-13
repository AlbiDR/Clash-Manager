// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  MaintenanceResponseSchema,
  PushSubscriptionSchema,
} from "../MaintenanceSchemas";

describe("MaintenanceSchemas", () => {
  describe("MaintenanceResponseSchema", () => {
    it("should parse valid maintenance response", () => {
      const input = { success: true, message: "Backend sync triggered" };
      const result = v.parse(MaintenanceResponseSchema, input);
      expect(result.success).toBe(true);
      expect(result.message).toBe("Backend sync triggered");
    });

    it("should fail if success is missing", () => {
      const input = { message: "Oops" };
      const result = v.safeParse(MaintenanceResponseSchema, input);
      expect(result.success).toBe(false);
    });

    it("should fail if message is missing", () => {
      const input = { success: true };
      const result = v.safeParse(MaintenanceResponseSchema, input);
      expect(result.success).toBe(false);
    });

    it("should fail for incorrect types", () => {
      expect(v.safeParse(MaintenanceResponseSchema, { success: "true", message: "OK" }).success).toBe(false);
      expect(v.safeParse(MaintenanceResponseSchema, { success: true, message: 123 }).success).toBe(false);
    });
  });

  describe("PushSubscriptionSchema", () => {
    const validSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/endpoint-id",
      keys: {
        p256dh: "BIP9B6...",
        auth: "8eDyX..."
      }
    };

    it("should parse valid push subscription", () => {
      const result = v.parse(PushSubscriptionSchema, validSub);
      expect(result.endpoint).toBe(validSub.endpoint);
      expect(result.keys.p256dh).toBe(validSub.keys.p256dh);
    });

    it("should parse with optional expirationTime", () => {
      const input = { ...validSub, expirationTime: 123456789 };
      const result = v.parse(PushSubscriptionSchema, input);
      expect(result.expirationTime).toBe(123456789);
    });

    it("should parse with null expirationTime", () => {
      const input = { ...validSub, expirationTime: null };
      const result = v.parse(PushSubscriptionSchema, input);
      expect(result.expirationTime).toBeNull();
    });

    it("should fail for invalid URL endpoint", () => {
      const input = { ...validSub, endpoint: "not-a-url" };
      const result = v.safeParse(PushSubscriptionSchema, input);
      expect(result.success).toBe(false);
    });

    it("should fail if keys are missing", () => {
      const input = { endpoint: "https://valid.url" };
      const result = v.safeParse(PushSubscriptionSchema, input);
      expect(result.success).toBe(false);
    });

    it("should fail if key fields are missing", () => {
      const input = {
        endpoint: "https://valid.url",
        keys: { p256dh: "key" } // Missing auth
      };
      const result = v.safeParse(PushSubscriptionSchema, input);
      expect(result.success).toBe(false);
    });

    it("should fail for malformed types", () => {
       expect(v.safeParse(PushSubscriptionSchema, { ...validSub, expirationTime: "soon" }).success).toBe(false);
       expect(v.safeParse(PushSubscriptionSchema, { ...validSub, keys: "keys" }).success).toBe(false);
    });
  });
});
