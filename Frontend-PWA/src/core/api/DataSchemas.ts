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
  // Absolute level on the unified 1-16 scale. For data returned by the
  // sync-player-cards Edge Function this is already normalized; for any future
  // raw-API path the ProfileHydrator clamps it via normalizeLevel.
  level: v.optional(v.number(), 1),
  // Raw maxLevel as returned by the Clash Royale API (rarity-relative cap).
  // Common=16, Rare=14, Epic=11, Legendary=8, Champion=6.
  // Present only on data sourced directly from the API; absent on internal rows.
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
    // THREAT: Missing matrix columns causing validation failure.
    // Rationale: Defaulting to 0 for missing numeric fields ensures
    // that the PWA can still display a partial roster if the backend
    // schema is slightly out of sync or if optional columns are omitted.
    if (val === null || val === undefined) return 0;
    if (typeof val === "string") {
      // Handle comma-separated or percentage-based strings from remote sources
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
 * validation failure, as missing metadata should not block UI hydration.
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
  potentialScore: v.optional(SafeNumberPipe, 0),
  potentialRawScore: v.optional(SafeNumberPipe, 0),
  d: v.object({
    don: SafeNumberPipe,
    war: SafeNumberPipe,
    ago: SafeStringPipe,
    cards: v.optional(SafeNumberPipe, 0),
  }),
  // Rationale: Ensuring lastScan defaults to 0 (epoch) instead of undefined
  // maintains backward compatibility with legacy UI components and tests.
  lastScan: v.optional(SafeNumberPipe, 0),
});

/**
 * [GUARD] WEB APP DATA SCHEMA
 * Authoritative validation boundary for the full application state.
 */
/**
 * [GUARD] SUPABASE ROSTER ROW SCHEMA
 * Validates the raw shape of a row from the roster_view.
 * Rationale: Ensures Supabase data is hardened before mapping to domain objects.
 */
export const SbRosterRowSchema = v.object({
  player_tag: v.optional(SafeStringPipe, ""),
  player_name: v.optional(SafeStringPipe, "Unknown"),
  role: v.optional(SafeStringPipe, ""),
  ingame_link: v.optional(SafeStringPipe, ""),
  royaleapi_link: v.optional(SafeStringPipe, ""),
  exp_level: v.optional(SafeNumberPipe, 1),
  trophies: v.optional(SafeNumberPipe, 0),
  donations: v.optional(SafeNumberPipe, 0),
  donations_received: v.optional(SafeNumberPipe, 0),
  clan_rank: v.optional(SafeNumberPipe, 0),
  decks_used_today: v.optional(SafeNumberPipe, 0),
  decks_used_weekly: v.optional(SafeNumberPipe, 0),
  week_fame: v.optional(SafeNumberPipe, 0),
  avg_fame: v.optional(SafeNumberPipe, 0),
  raw_performance_score: v.optional(SafeNumberPipe, 0),
  rpes: v.optional(SafeNumberPipe, 0),
  performance_score: v.optional(SafeNumberPipe, 0),
  pes: v.optional(SafeNumberPipe, 0),
  stability_index: v.optional(SafeNumberPipe, 0),
  last_seen_at: v.optional(v.nullable(SafeStringPipe)),
  last_ingested_at: v.optional(v.nullable(SafeStringPipe)),
  last_seen_label: v.optional(SafeStringPipe, "-"),
  tenure_label: v.optional(SafeStringPipe, "-"),
  tenure_days: v.optional(SafeNumberPipe, 0),
  hist: v.optional(SafeStringPipe, ""),
  war_participation: v.optional(SafeNumberPipe, 0),
});

/**
 * [GUARD] SUPABASE HEADHUNTER ROW SCHEMA
 * Validates the raw shape of a row from the headhunter_view.
 * Rationale: Protects recruitment discovery pipeline from malformed edge data.
 */
export const SbHeadhunterRowSchema = v.object({
  player_name: v.optional(SafeStringPipe, "Unknown"),
  player_tag: v.optional(SafeStringPipe, ""),
  trophies: v.optional(SafeNumberPipe, 0),
  donations: v.optional(SafeNumberPipe, 0),
  cards: v.optional(SafeNumberPipe, 0),
  war_wins: v.optional(SafeNumberPipe, 0),
  raw_potential_score: v.optional(SafeNumberPipe, 0),
  potential_score: v.optional(SafeNumberPipe, 0),
  longevity_label: v.optional(SafeStringPipe, "-"),
  longevity: v.optional(SafeNumberPipe, 0),
  tenure_label: v.optional(SafeStringPipe, ""),
  tenure_days: v.optional(SafeNumberPipe, 0),
  tier: v.optional(SafeStringPipe, "MID"),
  heritage_status: v.optional(SafeStringPipe, "NEW_CANDIDATE"),
  has_heritage_blessing: v.optional(v.boolean(), false),
  last_seen_at: v.optional(v.nullable(SafeStringPipe)),
  found_date: v.optional(SafeStringPipe, ""),
  ingame_link: v.optional(SafeStringPipe, ""),
  royaleapi_link: v.optional(SafeStringPipe, ""),
});

/**
 * [GUARD] RECRUIT TOMBSTONE SCHEMA
 * Validates the collection of dismissed recruit IDs stored in LocalStorage.
 * Rationale: Ensures that corrupted persistence data does not poison the
 * local recruitment filter.
 */
export const RecruitTombstoneSchema = v.array(v.string());

/**
 * [GUARD] OFFLINE QUEUE SCHEMAS
 * Rationale: Hardens the deferred operations queue in IndexedDB to prevent
 * corrupted or malformed requests from being replayed to the backend.
 */
export const DismissalRequestSchema = v.object({
  id: SafeStringPipe,
  score: SafeNumberPipe,
});

export const OfflineActionSchema = v.variant("type", [
  v.object({
    type: v.literal("RECRUIT_DISMISSAL"),
    items: v.array(DismissalRequestSchema),
    timestamp: SafeNumberPipe,
  }),
  v.object({
    type: v.literal("RECRUIT_RESTORATION"),
    ids: v.array(SafeStringPipe),
    timestamp: SafeNumberPipe,
  }),
]);

export const OfflineQueueSchema = v.array(OfflineActionSchema);

export const WebAppDataSchema = v.object({
  lb: v.array(MemberSchema),
  hh: v.array(RecruitSchema),
  playerTag: v.optional(SafeStringPipe),
  timestamp: SafeNumberPipe,
  dataSource: v.optional(v.picklist(["SUPABASE"])),
  remoteTimestamp: v.optional(LaxNumberPipe),
  lastCompiled: v.optional(LaxNumberPipe),
  lastFetched: v.optional(LaxNumberPipe),
  blacklist: v.optional(v.array(v.string()), []),
});


