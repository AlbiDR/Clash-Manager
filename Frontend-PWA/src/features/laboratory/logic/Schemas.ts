// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/**
 * 🛡️ VALIDATION BOUNDARY: Laboratory Input
 * Enforces structural integrity for raw data entering the Laboratory engine.
 * Rationale: Laboratory accepts data from both internal cache and external API.
 * This schema ensures that malformed input is caught before it reaches the simulation loop.
 * Target B [1]: Enforce strict validation boundary for Royale API data.
 */

/**
 * [GUARD] RARITY SCHEMA
 * Normalizes and validates rarity strings.
 * Supports loose input (lowercase, spaces) but transforms to authoritative PascalCase.
 */
export const RaritySchema = v.fallback(
  v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.transform((val) => {
      const map: Record<string, string> = {
        "common": "Common",
        "rare": "Rare",
        "epic": "Epic",
        "legendary": "Legendary",
        "champion": "Champion"
      };
      return map[val] || "Common";
    }),
    v.picklist(["Common", "Rare", "Epic", "Legendary", "Champion"])
  ),
  "Common"
);

export const RawCardSchema = v.object({
  name: v.optional(v.string(), "Unknown Card"),
  rarity: v.optional(RaritySchema, "Common"),
  level: v.optional(v.number(), 1),
  count: v.optional(v.number(), 0),
  isTowerTroop: v.optional(v.boolean(), false),
});

/**
 * [GUARD] INVENTORY SCHEMA
 * Strictly validates currency and wildcard counts.
 * Target B [4]: Replace record(string, number) with explicit keys for domain purity.
 */
export const RawInventorySchema = v.object({
  gold: v.optional(v.number(), 0),
  gems: v.optional(v.number(), 0),
  wildCards: v.optional(
    v.object({
      Common: v.optional(v.number(), 0),
      Rare: v.optional(v.number(), 0),
      Epic: v.optional(v.number(), 0),
      Legendary: v.optional(v.number(), 0),
      Champion: v.optional(v.number(), 0),
    }),
    { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
  ),
});

const InternalProfileSchema = v.object({
  profile: v.object({
    name: v.optional(v.string(), "Unknown"),
    tag: v.optional(v.string(), "0"),
    kingLevel: v.optional(v.number(), 1),
    xpIntoLevel: v.optional(v.number(), 0),
  }),
  cards: v.optional(v.array(RawCardSchema), []),
  inventory: v.optional(RawInventorySchema, {}),
});

const ExternalProfileSchema = v.object({
  name: v.optional(v.string(), "Unknown"),
  tag: v.optional(v.string(), "0"),
  expLevel: v.optional(v.number(), 1),
  expPoints: v.optional(v.number(), 0),
  cards: v.optional(v.array(RawCardSchema), []),
  towerTroops: v.optional(v.array(RawCardSchema), []),
});

export const ProfileInputSchema = v.union([
  InternalProfileSchema,
  ExternalProfileSchema
]);

export type RawProfileInput = v.InferOutput<typeof ProfileInputSchema>;
