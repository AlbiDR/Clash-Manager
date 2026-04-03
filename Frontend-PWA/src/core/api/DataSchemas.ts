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
  inventory: v.optional(RawInventorySchema, {
    gold: 0,
    gems: 0,
    wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
  }),
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

/**
 * [GUARD] CORE COERCION PIPES
 * Rationale: Matrix data is often heterogeneous (e.g., numbers for tags).
 * We coerce at the boundary but reject total garbage to maintain test integrity.
 */
const SafeNumberPipe = v.pipe(
  v.unknown(),
  v.transform((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      // Handle comma-separated or percentage-based strings from sheets
      const cleaned = val.replace(/,/g, "").replace(/%/g, "").trim();
      if (cleaned === "") return 0;
      const n = parseFloat(cleaned);
      // Only return the number if it's actually numeric
      if (!isNaN(n)) return n;
    }
    return val; // Pass through to v.number() for rejection
  }),
  v.number() // The final gatekeeper
);

/**
 * [GUARD] LAX NUMBER PIPE: Metadata Resilience
 * Rationale: Metadata fields like timestamps must NEVER trigger a full 
 * validation failure, as it results in a silent fallback to GAS.
 */
const LaxNumberPipe = v.pipe(
  v.unknown(),
  v.transform((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }),
  v.number() // The final gatekeeper
);

const SafeStringPipe = v.pipe(
  v.unknown(),
  v.transform((val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    return val; // Pass through to v.string() for rejection
  }),
  v.string() // The final gatekeeper
);

export const MemberSchema = v.object({
  id: SafeStringPipe,
  n: SafeStringPipe,
  t: SafeNumberPipe,
  performanceScore: SafeNumberPipe,
  performanceRawScore: SafeNumberPipe,
  dt: v.optional(SafeNumberPipe),
  d: v.object({
    role: SafeStringPipe,
    days: SafeNumberPipe,
    avg: SafeNumberPipe,
    seen: v.optional(v.nullable(SafeStringPipe)),
    rate: v.optional(v.nullable(SafeStringPipe)),
    wfame: v.optional(SafeNumberPipe),
    hist: SafeStringPipe,
  }),
});

export const RecruitSchema = v.object({
  id: SafeStringPipe,
  n: SafeStringPipe,
  t: SafeNumberPipe,
  potentialScore: v.optional(SafeNumberPipe),
  potentialRawScore: v.optional(SafeNumberPipe),
  d: v.object({
    don: SafeNumberPipe,
    war: SafeNumberPipe,
    ago: SafeStringPipe,
    cards: v.optional(SafeNumberPipe),
  }),
  lastScan: v.optional(SafeNumberPipe),
});

/**
 * [GUARD] WEB APP DATA SCHEMA
 * Authoritative validation boundary for the full application state.
 */
export const WebAppDataSchema = v.object({
  lb: v.array(MemberSchema),
  hh: v.array(RecruitSchema),
  playerTag: v.optional(SafeStringPipe),
  timestamp: SafeNumberPipe,
  dataSource: v.optional(v.picklist(["WORKER", "GAS"])),
  hubTimestamp: v.optional(LaxNumberPipe),
  lastCompiled: v.optional(LaxNumberPipe),
  lastFetched: v.optional(LaxNumberPipe),
});

/**
 * [GUARD] HUB STATE SCHEMA
 * Validates the raw matrix state returned by the Worker Hub.
 */
export const HubStateSchema = v.object({
  metadata: v.object({
    timestamp: SafeStringPipe,
    lastCompiled: SafeStringPipe,
    lastFetched: SafeStringPipe,
    status: SafeStringPipe,
    version: SafeStringPipe,
    source: SafeStringPipe,
  }),
  data: v.object({
    roster: v.array(v.array(v.unknown())),
    headhunter: v.array(v.array(v.unknown())),
  }),
});
