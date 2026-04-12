// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [VALIDATION] SCHEMAS: Backend Worker
 * ----------------------------------------------------------------------------
 * Valibot schemas for enforcing runtime integrity at the Layer 1 boundary.
 * Rationale: Every external boundary is a potential entry point for hostile
 * or malformed input. Loud failure at the boundary prevents silent corruption.
 * ============================================================================
 */

import * as v from "valibot";

/**
 * Common regex for Clash Royale tags (Player, Clan, Tournament)
 */
const TAG_REGEX = /^[#]?[0-9A-Za-z]{3,12}$/;

/**
 * [VALIDATION] Branded Types Validators
 *
 * @remarks
 * THREAT: Non-normalized tags (lowercase or missing '#') bypassing the recruitment blacklist
 * or causing duplicate entries in the database.
 * This schema enforces strict normalization: converting to uppercase and ensuring
 * the '#' prefix is present.
 */
export const TagSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(TAG_REGEX, "Invalid tag format"),
  v.transform((inputTag) => {
    // Normalize to uppercase and ensure '#' prefix to prevent duplicate entries
    // and bypass of the recruitment blacklist.
    const upper = inputTag.toUpperCase();
    return upper.startsWith("#") ? upper : `#${upper}`;
  })
);

/**
 * [VALIDATION] Scoring Weights Schema
 *
 * @remarks
 * Defines the relative importance of different player metrics (Trophies, Donations, War)
 * during the recruitment scoring process.
 */
export const ScoringWeightsSchema = v.object({
  TROPHY: v.number(),
  DON: v.number(),
  WAR: v.number(),
  WAR_BASELINE_BONUS: v.optional(v.number(), 500),
});

/**
 * [SYNC] REQUEST SCHEMAS
 * ----------------------------------------------------------------------------
 * Validation boundaries for incoming requests from external systems (GAS/PWA).
 */

/**
 * [GUARD] API Key Audit Request
 *
 * @remarks
 * Validates the payload for the `/audit` endpoint, ensuring an array of
 * potential API keys is provided for health verification.
 */
export const AuditRequestSchema = v.object({
  apiKeys: v.array(v.string())
});

/**
 * [GUARD] VALIDATION BOUNDARY: Prophet Intelligence
 *
 * @remarks
 * Ensures structural integrity for incoming heritage data (Strategy 2: Deep Delegation).
 * Defines historical player performance metrics used for recruitment scoring multipliers.
 */
export const ProphetIntelSchema = v.object({
  wins: v.optional(v.number(), 0),
  active: v.optional(v.boolean(), true),
  lastFetch: v.optional(v.number(), 0)
});

/**
 * [GUARD] Public Recruitment Scan Request
 *
 * @remarks
 * Boundary for the `/public/scan` endpoint. Handles unauthenticated requests
 * for tournament discovery and initial recruit scoring.
 *
 * THREAT: Unauthenticated quota depletion via large tag arrays. Bounded to 25.
 * THREAT: Un-normalized prophetCache keys bypass heritage lookups for recruits.
 */
export const PublicScanRequestSchema = v.object({
  tags: v.pipe(v.array(TagSchema), v.maxLength(25)),
  apiKeys: v.optional(v.array(v.string())),
  blacklist: v.optional(v.pipe(v.array(TagSchema), v.maxLength(25))),
  minTrophies: v.optional(v.number()),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  prophetCache: v.optional(v.record(TagSchema, ProphetIntelSchema))
});

/**
 * [GUARD] Internal Recruitment Scan Request
 *
 * @remarks
 * Boundary for the privileged `/scan` endpoint. Supports full-precision
 * discovery and heritage-augmented scoring.
 *
 * THREAT: Privileged resource exhaustion via large tag arrays. Bounded to 100.
 * THREAT: Un-normalized prophetCache keys bypass heritage lookups for recruits.
 */
export const ScanRequestSchema = v.object({
  tags: v.pipe(v.array(TagSchema), v.maxLength(100)),
  apiKeys: v.optional(v.array(v.string())),
  blacklist: v.optional(v.pipe(v.array(TagSchema), v.maxLength(100))),
  minTrophies: v.optional(v.number()),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  prophetCache: v.optional(v.record(TagSchema, ProphetIntelSchema))
});

/**
 * [GUARD] Clan Full Snapshot Request
 *
 * @remarks
 * Validates the payload for `/clan/full`. Fetches a composite snapshot of
 * members, current race status, and historical war logs.
 */
export const ClanFullRequestSchema = v.object({
  tag: TagSchema,
  apiKeys: v.optional(v.array(v.string()))
});

/**
 * [GUARD] Individual Clan API Request
 *
 * @remarks
 * Validates requests for individual clan resources (members list or war log).
 */
export const ClanApiRequestSchema = v.object({
  tag: TagSchema,
  type: v.picklist(["members", "warlog"]),
  apiKeys: v.optional(v.array(v.string()))
});

/**
 * [GUARD] Generic Bulk Fetch Request
 *
 * @remarks
 * Validates the payload for the `/fetch` endpoint, supporting high-concurrency
 * retrieval of arbitrary Royale API URLs with optional scoring.
 */
export const FetchRequestSchema = v.object({
  urls: v.array(v.string()),
  apiKeys: v.optional(v.array(v.string())),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  minTrophies: v.optional(v.number())
});

/**
 * [GUARD] Push Subscription Request
 *
 * @remarks
 * Validates the browser-standard PushSubscription object for notification registration.
 */
export const SubscriptionRequestSchema = v.object({
  endpoint: v.string(),
  keys: v.optional(v.object({
    p256dh: v.string(),
    auth: v.string()
  }))
});

/**
 * [GUARD] VALIDATION BOUNDARY: Royale API Response Schemas
 * ----------------------------------------------------------------------------
 * Structural definitions for validating untrusted data from the Royale API.
 */

/**
 * [GUARD] Clan Member Schema
 *
 * @remarks
 * Validates individual clan members returned by the /members endpoint.
 */
export const RoyaleClanMemberSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  role: v.string(),
  expLevel: v.number(),
  trophies: v.number(), // THREAT: Trophies were being stripped by Valibot due to a schema omission.
  donations: v.number(),
  donationsReceived: v.number(),
});

/**
 * [GUARD] Clan Members Response
 *
 * @remarks
 * Encapsulates the member array within the standard Royale API response wrapper.
 */
export const RoyaleClanMembersResponseSchema = v.object({
  items: v.array(RoyaleClanMemberSchema),
});

/**
 * [GUARD] Player Profile Schema
 *
 * @remarks
 * Validates a full player profile. Used in both Roster auditing and
 * recruitment scoring (Strategy 2: Deep Delegation).
 */
export const RoyalePlayerSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  trophies: v.number(),
  totalDonations: v.number(),
  warDayWins: v.number(),
  challengeCardsWon: v.number(),
  expLevel: v.optional(v.number()),
  clan: v.optional(v.object({
    tag: TagSchema,
    name: v.string(),
  })),
  leagueStatistics: v.optional(v.object({
    currentSeason: v.optional(v.object({
      trophies: v.optional(v.number(), 0),
    })),
  })),
});

/**
 * [GUARD] Battle Log Item Schema
 *
 * @remarks
 * Structural validation for a single battle log entry. Used primarily to
 * detect recent War activity via the `type` field.
 */
export const RoyaleBattleLogItemSchema = v.object({
  type: v.string(),
  battleTime: v.string(),
});

/**
 * [GUARD] Battle Log Response
 *
 * @remarks
 * The battle log endpoint returns a flat array of entries.
 */
export const RoyaleBattleLogResponseSchema = v.array(RoyaleBattleLogItemSchema);

/**
 * [GUARD] Tournament Member Schema
 *
 * @remarks
 * Handles structural variability in tournament member listings.
 *
 * NOTE: Tournament members use `score` (their in-tournament score), NOT
 * `trophies` (global ladder trophies). Using the wrong field causes every
 * member to fail validation and silently yield 0 candidates per batch.
 */
export const RoyaleTournamentMemberSchema = v.looseObject({
  tag: TagSchema,
  name: v.fallback(v.nullish(v.string()), "Unknown"),
  score: v.fallback(v.nullish(v.number()), 0),
  rank: v.nullish(v.number()),
  // NOTE: Clanless members may return `null` instead of omitting the key.
  // `nullish` permits both `undefined` and `null`.
  clan: v.nullish(v.looseObject({
    tag: TagSchema,
    badgeId: v.nullish(v.number()),
  })),
});

/**
 * [GUARD] Tournament Response Schema
 *
 * @remarks
 * Top-level validation for tournament discovery.
 *
 * NOTE: The Royale API omits `membersList` entirely when a tournament has
 * no participants, or may return null. Use nullish with a fallback.
 */
export const RoyaleTournamentResponseSchema = v.looseObject({
  tag: TagSchema,
  name: v.fallback(v.nullish(v.string()), "Unnamed Tournament"),
  membersList: v.fallback(v.nullish(v.array(RoyaleTournamentMemberSchema)), []),
});

/**
 * [GUARD] River Race Participant Schema
 *
 * @remarks
 * Validates individual participants in a river race. Used to calculate fame
 * and deck usage metrics for the Roster view.
 */
export const RoyaleRiverRaceParticipantSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  fame: v.number(),
  repairPoints: v.number(),
  boatAttacks: v.number(),
  decksUsed: v.number(),
  decksUsedToday: v.number(),
});

/**
 * [GUARD] River Race Clan Schema
 *
 * @remarks
 * Structural validation for a clan's performance within a river race.
 */
export const RoyaleRiverRaceClanSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  fame: v.number(),
  participants: v.array(RoyaleRiverRaceParticipantSchema),
});

/**
 * [GUARD] River Race Standing Schema
 *
 * @remarks
 * Validates a single rank entry in the river race standings.
 */
export const RoyaleRiverRaceStandingSchema = v.object({
  rank: v.number(),
  clan: RoyaleRiverRaceClanSchema,
});

/**
 * [GUARD] Current River Race Response
 *
 * @remarks
 * Validates the response from the /currentriverrace endpoint.
 */
export const RoyaleCurrentRiverRaceSchema = v.object({
  state: v.string(),
  clan: RoyaleRiverRaceClanSchema,
  standings: v.array(RoyaleRiverRaceStandingSchema),
});

/**
 * [GUARD] War Log Standing Schema
 *
 * @remarks
 * Validates historical clan performance in previous war weeks.
 */
export const RoyaleWarLogStandingSchema = v.object({
  rank: v.number(),
  clan: v.object({
    tag: TagSchema,
    name: v.string(),
    fame: v.number(),
    participants: v.optional(v.array(RoyaleRiverRaceParticipantSchema)),
  }),
});

/**
 * [GUARD] War Log Item Schema
 *
 * @remarks
 * Validates a single historical war log entry.
 */
export const RoyaleWarLogItemSchema = v.object({
  createdDate: v.string(),
  seasonId: v.number(),
  standings: v.array(RoyaleWarLogStandingSchema),
});

/**
 * [GUARD] War Log Response
 *
 * @remarks
 * Top-level validation for the /riverracelog endpoint.
 */
export const RoyaleWarLogResponseSchema = v.object({
  items: v.array(RoyaleWarLogItemSchema),
});

/**
 * [GUARD] VALIDATION BOUNDARY: Worker Hub Schemas
 * ----------------------------------------------------------------------------
 * Structural definitions for the distributed data synchronization system.
 */

/**
 * [GUARD] GAS Raw Feed Schema
 *
 * @remarks
 * Rationale: Ensures structural integrity for data synchronization between
 * the GAS "Dumb Store" and the high-performance Worker subsystem.
 */
export const GasRawFeedSchema = v.object({
  timestamp: v.string(),
  source: v.string(),
  tables: v.object({
    roster: v.array(v.array(v.unknown())),
    headhunter: v.array(v.array(v.unknown())),
  }),
});

/**
 * [GUARD] Hub Error Schema
 *
 * @remarks
 * Standardized error format for the Worker Hub system. Used by both the
 * Worker during synchronization and the PWA during ingress.
 */
export const HubErrorSchema = v.object({
  code: v.string(),
  message: v.string(),
  layer: v.optional(v.picklist(['WORKER_HUB', 'WORKER_PAYLOAD_KERNEL', 'WORKER_PERSISTENCE', 'GAS_API_RAW']), 'WORKER_HUB'),
});

/**
 * [GUARD] FS Error Schema
 *
 * @remarks
 * Validates standard Node.js filesystem errors. Used to detect missing state
 * files (ENOENT) in the persistence layer.
 */
export const FsErrorSchema = v.object({
  code: v.string(),
});

/**
 * [GUARD] Hub State Response Schema
 *
 * @remarks
 * Boundary for the PWA `/hub/state` request. Ensures the delivered payload
 * is consistent with the CleanStack structural matrix.
 */
export const HubStateSchema = v.object({
  metadata: v.object({
    timestamp: v.string(),
    lastCompiled: v.string(),
    lastFetched: v.string(),
    status: v.picklist(["healthy", "degraded", "offline"]),
    version: v.string(),
    source: v.string(),
  }),
  data: v.object({
    roster: v.array(v.array(v.unknown())),
    headhunter: v.array(v.array(v.unknown())),
  }),
});
