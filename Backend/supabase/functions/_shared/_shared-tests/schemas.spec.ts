// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi } from "vitest";

// Mock the Deno-style import for Node/Vitest environment
vi.mock("npm:valibot@1.4.1", () => import("valibot"));

import {
    RoyaleFlexibleListSchema,
    KeyPoolSchema,
    VaultSecretSchema,
    RoyaleClanSchema,
    RoyalePlayerSchema,
    RoyaleBattleLogSchema,
    IngestionTargetsSchema
} from "../schemas";
import * as v from "valibot";

describe("Backend Schemas (Substrate Validation Boundaries)", () => {
    describe("KeyPoolSchema", () => {
        it("should normalize a comma-separated string into a string array", () => {
            const input = "key1, key2 ,key3";
            const result = v.parse(KeyPoolSchema, input);
            expect(result).toEqual(["key1", "key2", "key3"]);
        });

        it("should normalize a JSON array string into a string array", () => {
            const input = '["keyA", "keyB"]';
            const result = v.parse(KeyPoolSchema, input);
            expect(result).toEqual(["keyA", "keyB"]);
        });

        it("should handle raw string arrays", () => {
            const input = ["keyX", "keyY"];
            const result = v.parse(KeyPoolSchema, input);
            expect(result).toEqual(["keyX", "keyY"]);
        });

        it("should filter out empty values and handle null/empty input", () => {
            expect(v.parse(KeyPoolSchema, "")).toEqual([]);
            expect(v.parse(KeyPoolSchema, "key1,,key2")).toEqual(["key1", "key2"]);
            expect(v.parse(KeyPoolSchema, ["key1", "", "key2"])).toEqual(["key1", "key2"]);
        });

        it("should handle a single token string (not JSON, not comma-separated)", () => {
            const input = "single_token_123";
            const result = v.parse(KeyPoolSchema, input);
            expect(result).toEqual(["single_token_123"]);
        });
    });

    describe("VaultSecretSchema", () => {
        it("should return the string as-is if input is a string", () => {
            expect(v.parse(VaultSecretSchema, "secret_value")).toBe("secret_value");
        });

        it("should return an empty string for null or undefined", () => {
            expect(v.parse(VaultSecretSchema, null)).toBe("");
            expect(v.parse(VaultSecretSchema, undefined)).toBe("");
        });

        it("should stringify non-string inputs (numbers, objects)", () => {
            expect(v.parse(VaultSecretSchema, 123)).toBe("123");
            expect(v.parse(VaultSecretSchema, { foo: "bar" })).toBe('{"foo":"bar"}');
        });
    });

    describe("RoyaleFlexibleListSchema", () => {
        it("should accept a raw array and wrap it in an 'items' object", () => {
            const input = [{ tag: "T1" }, { tag: "T2" }];
            const result = v.parse(RoyaleFlexibleListSchema, input);
            expect(result).toEqual({ items: input });
        });

        it("should accept an object that already has an 'items' array", () => {
            const input = { items: [{ tag: "T1" }] };
            const result = v.parse(RoyaleFlexibleListSchema, input);
            expect(result).toEqual(input);
        });
    });

    describe("RoyaleClanSchema", () => {
        it("should validate a valid clan profile", () => {
            const validClan = {
                tag: "#CLAN1",
                name: "The Best Clan",
                type: "inviteOnly",
                clanScore: 50000,
                location: { id: 57000000, name: "International", isCountry: false }
            };
            expect(() => v.parse(RoyaleClanSchema, validClan)).not.toThrow();
        });

        it("should fail if mandatory fields are missing", () => {
            const invalidClan = { tag: "#CLAN1" }; // missing name
            expect(() => v.parse(RoyaleClanSchema, invalidClan)).toThrow();
        });
    });

    describe("RoyalePlayerSchema", () => {
        it("should validate a valid player profile with defaults", () => {
            const player = { tag: "#PLAYER1", name: "Archer" };
            const result = v.parse(RoyalePlayerSchema, player);
            expect(result.trophies).toBe(0);
            expect(result.tag).toBe("#PLAYER1");
        });
    });

    describe("RoyaleBattleLogSchema", () => {
        it("should validate a complex battle log array", () => {
            const log = [
                {
                    type: "riverRaceDuel",
                    battleTime: "20260617T120000.000Z",
                    team: [{ tag: "#P1", name: "P1", crowns: 3 }],
                    opponent: [{ tag: "#OP1", name: "OP1", crowns: 1, clan: { tag: "#OC1" } }]
                }
            ];
            expect(() => v.parse(RoyaleBattleLogSchema, log)).not.toThrow();
        });
    });

    describe("IngestionTargetsSchema", () => {
        it("should validate members and recruits lists", () => {
            const targets = {
                members: ["#M1", "#M2"],
                recruits: ["#R1"]
            };
            expect(() => v.parse(IngestionTargetsSchema, targets)).not.toThrow();
        });
    });
});
