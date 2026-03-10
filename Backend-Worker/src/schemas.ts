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
 */
export const TagSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(TAG_REGEX, "Invalid tag format")
);

export const ScoringWeightsSchema = v.object({
  TROPHY: v.number(),
  DON: v.number(),
  WAR: v.number(),
});

/**
 * [SYNC] REQUEST SCHEMAS
 */

export const AuditRequestSchema = v.object({
  apiKeys: v.array(v.string())
});

/**
 * [GUARD] VALIDATION BOUNDARY: Prophet Intelligence
 * Ensures structural integrity for incoming heritage data.
 */
export const ProphetIntelSchema = v.object({
  wins: v.optional(v.number(), 0),
  active: v.optional(v.boolean(), true),
  lastFetch: v.optional(v.number(), 0)
});

export const PublicScanRequestSchema = v.object({
  tags: v.array(TagSchema),
  apiKeys: v.optional(v.array(v.string())),
  blacklist: v.optional(v.array(TagSchema)),
  minTrophies: v.optional(v.number()),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  prophetCache: v.optional(v.record(v.string(), ProphetIntelSchema))
});

export const ScanRequestSchema = v.object({
  tags: v.array(TagSchema),
  apiKeys: v.optional(v.array(v.string())),
  blacklist: v.optional(v.array(TagSchema)),
  minTrophies: v.optional(v.number()),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  prophetCache: v.optional(v.record(v.string(), ProphetIntelSchema))
});

export const ClanFullRequestSchema = v.object({
  tag: TagSchema,
  apiKeys: v.optional(v.array(v.string()))
});

export const ClanApiRequestSchema = v.object({
  tag: TagSchema,
  type: v.picklist(["members", "warlog"]),
  apiKeys: v.optional(v.array(v.string()))
});

export const FetchRequestSchema = v.object({
  urls: v.array(v.string()),
  apiKeys: v.optional(v.array(v.string())),
  scoring: v.optional(v.nullable(ScoringWeightsSchema))
});

export const SubscriptionRequestSchema = v.object({
  endpoint: v.string(),
  keys: v.optional(v.object({
    p256dh: v.string(),
    auth: v.string()
  }))
});

/**
 * [GUARD] VALIDATION BOUNDARY: Royale API Response Schemas
 * Used to validate upstream data before it enters the processing pipeline.
 */
export const RoyaleClanMemberSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  role: v.string(),
  expLevel: v.number(),
  donations: v.number(),
  donationsReceived: v.number(),
});

export const RoyaleClanMembersResponseSchema = v.object({
  items: v.array(RoyaleClanMemberSchema),
});

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
});

export const RoyaleBattleLogItemSchema = v.object({
  type: v.string(),
  battleTime: v.string(),
});

export const RoyaleBattleLogResponseSchema = v.array(RoyaleBattleLogItemSchema);

export const RoyaleTournamentMemberSchema = v.looseObject({
  tag: TagSchema,
  name: v.fallback(v.nullish(v.string()), "Unknown"),
  // NOTE: Tournament members use `score` (their in-tournament score), NOT
  // `trophies` (global ladder trophies). Using the wrong field causes every
  // member to fail validation and silently yield 0 candidates per batch.
  score: v.fallback(v.nullish(v.number()), 0),
  rank: v.nullish(v.number()),
  // NOTE: Clanless members may return `null` instead of omitting the key.
  // `nullish` permits both `undefined` and `null`.
  clan: v.nullish(v.looseObject({
    tag: TagSchema,
    badgeId: v.nullish(v.number()),
  })),
});

export const RoyaleTournamentResponseSchema = v.looseObject({
  tag: TagSchema,
  name: v.fallback(v.nullish(v.string()), "Unnamed Tournament"),
  // NOTE: The Royale API omits `membersList` entirely when a tournament has
  // no participants, or may return null. Use nullish with a fallback.
  membersList: v.fallback(v.nullish(v.array(RoyaleTournamentMemberSchema)), []),
});

export const RoyaleRiverRaceParticipantSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  fame: v.number(),
  repairPoints: v.number(),
  boatAttacks: v.number(),
  decksUsed: v.number(),
  decksUsedToday: v.number(),
});

export const RoyaleRiverRaceClanSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  fame: v.number(),
  participants: v.array(RoyaleRiverRaceParticipantSchema),
});

export const RoyaleRiverRaceStandingSchema = v.object({
  rank: v.number(),
  clan: RoyaleRiverRaceClanSchema,
});

export const RoyaleCurrentRiverRaceSchema = v.object({
  state: v.string(),
  clan: RoyaleRiverRaceClanSchema,
  standings: v.array(RoyaleRiverRaceStandingSchema),
});

export const RoyaleWarLogStandingSchema = v.object({
  rank: v.number(),
  clan: v.object({
    tag: TagSchema,
    name: v.string(),
    fame: v.number(),
    participants: v.optional(v.array(RoyaleRiverRaceParticipantSchema)),
  }),
});

export const RoyaleWarLogItemSchema = v.object({
  createdDate: v.string(),
  seasonId: v.number(),
  standings: v.array(RoyaleWarLogStandingSchema),
});

export const RoyaleWarLogResponseSchema = v.object({
  items: v.array(RoyaleWarLogItemSchema),
});
