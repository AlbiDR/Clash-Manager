// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/**
 * [GUARD] CORE COERCION PIPES
 * Rationale: Matrix data is often heterogeneous (e.g., numbers for tags).
 * We coerce at the boundary but reject total garbage to maintain test integrity.
 */
export const SafeNumberPipe = v.pipe(
  v.unknown(),
  v.transform((candidateValue) => {
    if (typeof candidateValue === "number") return candidateValue;
    // THREAT: Missing matrix columns causing validation failure.
    // Rationale: Defaulting to 0 for missing numeric fields ensures
    // that the PWA can still display a partial roster if the backend
    // schema is slightly out of sync or if optional columns are omitted.
    if (candidateValue === null || candidateValue === undefined) return 0;
    if (typeof candidateValue === "string") {
      // Handle comma-separated or percentage-based strings from remote sources
      const cleaned = candidateValue.replace(/,/g, "").replace(/%/g, "").trim();
      if (cleaned === "") return 0;
      const n = parseFloat(cleaned);
      // Only return the number if it's actually numeric
      if (!isNaN(n)) return n;
    }
    return candidateValue; // Pass through to v.number() for rejection
  }),
  v.number() // The final gatekeeper
);

/**
 * [GUARD] LAX NUMBER PIPE: Metadata Resilience
 * Rationale: Metadata fields like timestamps must NEVER trigger a full
 * validation failure, as missing metadata should not block UI hydration.
 */
export const LaxNumberPipe = v.pipe(
  v.unknown(),
  v.transform((candidateValue) => {
    if (typeof candidateValue === "number") return candidateValue;
    if (typeof candidateValue === "string") {
      const n = parseFloat(candidateValue);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }),
  v.number() // The final gatekeeper
);

export const SafeStringPipe = v.pipe(
  v.unknown(),
  v.transform((candidateValue) => {
    if (candidateValue === null || candidateValue === undefined) return "";
    if (typeof candidateValue === "string") return candidateValue;
    if (typeof candidateValue === "number" || typeof candidateValue === "boolean") return String(candidateValue);
    return candidateValue; // Pass through to v.string() for rejection
  }),
  v.string() // The final gatekeeper
);

/**
 * [GUARD] RARITY SCHEMA
 * Normalizes and validates rarity strings.
 */
export const RaritySchema = v.fallback(
  v.pipe(
    v.string(),
    v.trim(),
    v.toLowerCase(),
    v.transform((rawRarity) => {
      const map: Record<string, string> = {
        "common": "Common",
        "rare": "Rare",
        "epic": "Epic",
        "legendary": "Legendary",
        "champion": "Champion"
      };
      return map[rawRarity] || "Common";
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
  maxLevel: v.optional(v.number()),
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
