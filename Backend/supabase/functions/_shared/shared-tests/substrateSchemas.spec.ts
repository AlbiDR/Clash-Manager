// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  PlayerCardSnapshotSchema,
  IntegrityCheckDetailsSchema,
  TelemetrySchema,
  KeyPoolSchema,
  VaultSecretSchema,
} from "../substrateSchemas";

describe("Substrate Infrastructure Schemas", () => {
  describe("PlayerCardSnapshotSchema", () => {
    it("should parse valid player card snapshot data", () => {
      const input = {
        card_name: "Mega Knight",
        rarity: "legendary",
        absolute_level: 15,
        count: 1,
        is_tower_troop: false,
        fetched_at: "2026-08-27T00:00:00.000Z",
        player_name: "Royale King",
        king_level: 15,
        xp_into_level: 45000,
      };
      const result = v.parse(PlayerCardSnapshotSchema, input);
      expect(result.card_name).toBe("Mega Knight");
      expect(result.rarity).toBe("legendary");
      expect(result.absolute_level).toBe(15);
      expect(result.is_tower_troop).toBe(false);
    });

    it("should reject input missing required properties", () => {
      const input = {
        card_name: "Knight",
        rarity: "common",
        // missing absolute_level and other fields
      };
      expect(() => v.parse(PlayerCardSnapshotSchema, input)).toThrow();
    });

    it("should reject input with invalid field types", () => {
      const input = {
        card_name: "Archers",
        rarity: "common",
        absolute_level: "14", // should be number
        count: 100,
        is_tower_troop: false,
        fetched_at: "2026-08-27T00:00:00.000Z",
        player_name: "Player 1",
        king_level: 14,
        xp_into_level: 20000,
      };
      expect(() => v.parse(PlayerCardSnapshotSchema, input)).toThrow();
    });
  });

  describe("IntegrityCheckDetailsSchema", () => {
    it("should parse full integrity check details", () => {
      const input = {
        passed: true,
        details: "All RPC boundaries verified",
        issues: ["minor timing drift"],
      };
      const result = v.parse(IntegrityCheckDetailsSchema, input);
      expect(result.passed).toBe(true);
      expect(result.details).toBe("All RPC boundaries verified");
      expect(result.issues).toEqual(["minor timing drift"]);
    });

    it("should parse when optional fields are omitted", () => {
      const input = {
        passed: false,
      };
      const result = v.parse(IntegrityCheckDetailsSchema, input);
      expect(result.passed).toBe(false);
      expect(result.details).toBeUndefined();
      expect(result.issues).toBeUndefined();
    });

    it("should reject when non-boolean is provided for passed", () => {
      const input = {
        passed: "true",
      };
      expect(() => v.parse(IntegrityCheckDetailsSchema, input)).toThrow();
    });
  });

  describe("TelemetrySchema", () => {
    it("should parse a single telemetry object with a string id", () => {
      const input = { id: "log-123" };
      const result = v.parse(TelemetrySchema, input);
      expect(result).toEqual({ id: "log-123" });
    });

    it("should parse a single telemetry object with a number id", () => {
      const input = { id: 99 };
      const result = v.parse(TelemetrySchema, input);
      expect(result).toEqual({ id: 99 });
    });

    it("should parse an array of telemetry objects", () => {
      const input = [{ id: "log-1" }, { id: 42 }];
      const result = v.parse(TelemetrySchema, input);
      expect(result).toHaveLength(2);
      expect(result).toEqual([{ id: "log-1" }, { id: 42 }]);
    });

    it("should reject invalid telemetry shapes", () => {
      expect(() => v.parse(TelemetrySchema, { name: "invalid" })).toThrow();
      expect(() => v.parse(TelemetrySchema, "invalid-string")).toThrow();
      expect(() => v.parse(TelemetrySchema, [{ no_id: true }])).toThrow();
    });
  });

  describe("KeyPoolSchema", () => {
    it("should handle array of strings", () => {
      const input = ["key-alpha", "key-beta", ""];
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual(["key-alpha", "key-beta"]);
    });

    it("should handle a single non-JSON token string", () => {
      const input = "single-api-key";
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual(["single-api-key"]);
    });

    it("should handle comma-separated string tokens", () => {
      const input = "key1, key2 , key3, ";
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual(["key1", "key2", "key3"]);
    });

    it("should parse a JSON array string", () => {
      const input = '["key1", "key2", ""]';
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual(["key1", "key2"]);
    });

    it("should parse a JSON number string", () => {
      const input = "12345";
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual(["12345"]);
    });

    it("should handle empty strings cleanly", () => {
      const input = "";
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual([]);
    });

    it("should fallback to comma split on unparseable string", () => {
      const input = "invalid-json-{key1, key2}";
      const result = v.parse(KeyPoolSchema, input);
      expect(result).toEqual(["invalid-json-{key1", "key2}"]);
    });
  });

  describe("VaultSecretSchema", () => {
    it("should transform null or undefined to an empty string", () => {
      expect(v.parse(VaultSecretSchema, null)).toBe("");
      expect(v.parse(VaultSecretSchema, undefined)).toBe("");
    });

    it("should preserve valid string secrets as-is", () => {
      expect(v.parse(VaultSecretSchema, "secret_value_123")).toBe(
        "secret_value_123"
      );
    });

    it("should JSON stringify objects or arrays", () => {
      const secretObject = { key: "value", port: 5432 };
      expect(v.parse(VaultSecretSchema, secretObject)).toBe(
        JSON.stringify(secretObject)
      );
    });

    it("should JSON stringify numbers or booleans", () => {
      expect(v.parse(VaultSecretSchema, 42)).toBe("42");
      expect(v.parse(VaultSecretSchema, true)).toBe("true");
    });
  });
});
