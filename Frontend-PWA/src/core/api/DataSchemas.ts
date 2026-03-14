// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/**
 * 🛡️ VALIDATION BOUNDARY: Core Data Schemas
 * Enforces structural integrity for raw data across the application.
 * Rationale: Centralizing schemas prevents "any Plague" and ensures
 * consistency between API boundaries and domain logic.
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

/**
 * [GUARD] RAW CARD SCHEMA
 * Validates card objects from various external sources.
 */
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

/**
 * [GUARD] INTERNAL PROFILE SCHEMA
 * Validates the player profile format used internally by the system.
 */
export const InternalProfileSchema = v.object({
  profile: v.object({
    name: v.optional(v.string(), "Unknown"),
    tag: v.optional(v.string(), "0"),
    kingLevel: v.optional(v.number(), 1),
    xpIntoLevel: v.optional(v.number(), 0),
  }),
  cards: v.optional(v.array(RawCardSchema), []),
  inventory: v.optional(RawInventorySchema, {}),
});

/**
 * [GUARD] EXTERNAL PROFILE SCHEMA
 * Validates the player profile format returned by external Royale APIs.
 */
export const ExternalProfileSchema = v.object({
  name: v.optional(v.string(), "Unknown"),
  tag: v.optional(v.string(), "0"),
  expLevel: v.optional(v.number(), 1),
  expPoints: v.optional(v.number(), 0),
  cards: v.optional(v.array(RawCardSchema), []),
  towerTroops: v.optional(v.array(RawCardSchema), []),
});

/**
 * [GUARD] PROFILE INPUT SCHEMA
 * Unified entry point for profile data, supporting both internal and external formats.
 */
export const ProfileInputSchema = v.union([
  InternalProfileSchema,
  ExternalProfileSchema
]);

export type RawProfileInput = v.InferOutput<typeof ProfileInputSchema>;
