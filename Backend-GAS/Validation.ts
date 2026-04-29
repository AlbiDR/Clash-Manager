// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * MODULE: VALIDATION SCHEMAS
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized registry of Valibot schemas for API payload validation.
 * ROLE: Layer 2 Shared Driver (@shared).
 * VERSION: 1.1.0
 * ============================================================================
 */

import * as v from 'valibot';

export const VER_VALIDATION = "1.2.0";

/**
 * Common regex for Clash Royale tags (Player, Clan, Tournament)
 */
const TAG_REGEX = /^[#]?[0-9A-Z]{3,15}$/i;

/**
 * [VALIDATION] Branded Types Validators
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 *
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
 * [GUARD] BASE ACTION SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Used to safely extract the 'action' field from incoming payloads before
 * routing to specialized handlers.
 */
export const BaseActionSchema = v.object({
  action: v.optional(v.string())
});

/**
 * [GUARD] DISMISS RECRUIT ITEM SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates individual recruit entries within a dismissal payload. Supports
 * both simple ID strings and structured objects with score metadata.
 */
export const DismissRecruitItemSchema = v.union([
  v.string(),
  v.object({
    id: v.string(),
    score: v.optional(v.union([v.string(), v.number()])),
    potentialRawScore: v.optional(v.union([v.string(), v.number()])),
    rawScore: v.optional(v.union([v.string(), v.number()]))
  })
]);

/**
 * [GUARD] DISMISS RECRUITS PAYLOAD SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates the batch dismissal request from the PWA.
 */
export const DismissRecruitsPayloadSchema = v.object({
  action: v.optional(v.string()),
  items: v.optional(v.array(DismissRecruitItemSchema)),
  ids: v.optional(v.array(v.string()))
});

/**
 * [GUARD] UNDISMISS RECRUITS PAYLOAD SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates requests to restore previously dismissed recruits.
 */
export const UndismissRecruitsPayloadSchema = v.object({
  action: v.optional(v.string()),
  ids: v.array(v.string())
});

/**
 * [GUARD] TRIGGER UPDATE PAYLOAD SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates manual trigger requests for system updates (e.g., Roster or Headhunter refresh).
 */
export const TriggerUpdatePayloadSchema = v.object({
  action: v.optional(v.string()),
  target: v.string()
});

/**
 * [GUARD] PLAYER PROFILE PAYLOAD SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates requests for specific player profile lookups.
 */
export const PlayerProfilePayloadSchema = v.object({
  action: v.optional(v.string()),
  tag: TagSchema
});

/**
 * [GUARD] PROPHET INTELLIGENCE SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Ensures structural integrity for incoming heritage data (Strategy 2: Deep Delegation).
 * Defines historical player performance metrics used for recruitment scoring multipliers.
 */
export const ProphetIntelSchema = v.object({
  wins: v.optional(v.number(), 0),
  active: v.optional(v.boolean(), true),
  lastFetch: v.optional(v.number(), 0)
});

/**
 * [GUARD] BLACKLIST ENTRY SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates entries in the technical Blacklist sheet.
 */
export const BlacklistEntrySchema = v.object({
  tag: TagSchema,
  expiry: v.number(),
  rawScore: v.number()
});

/**
 * [GUARD] Clan Member Schema
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates individual clan members returned by the /members endpoint.
 */
export const RoyaleClanMemberSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  role: v.string(),
  expLevel: v.number(),
  trophies: v.number(),
  donations: v.number(),
  donationsReceived: v.number(),
});

/**
 * [GUARD] Clan Response Schema
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates the full clan object from the Royale API.
 */
export const RoyaleClanSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  memberList: v.array(RoyaleClanMemberSchema),
});

/**
 * [GUARD] War Log Standing Schema
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates historical clan performance in previous war weeks.
 */
export const RoyaleWarLogStandingSchema = v.object({
  rank: v.number(),
  clan: v.object({
    tag: TagSchema,
    name: v.string(),
    fame: v.number(),
  }),
});

/**
 * [GUARD] War Log Item Schema
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates a single historical war log entry.
 */
export const RoyaleWarLogItemSchema = v.object({
  createdDate: v.string(),
  standings: v.array(RoyaleWarLogStandingSchema),
});

/**
 * [GUARD] War Log Response Schema
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Top-level validation for the /riverracelog endpoint.
 */
export const RoyaleWarLogResponseSchema = v.object({
  items: v.array(RoyaleWarLogItemSchema),
});

/**
 * [GUARD] Player Profile Schema
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates a full player profile. Used in both Roster auditing and
 * recruitment scoring.
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
 * [GUARD] LOGGER PAYLOAD SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates diagnostic logs sent from the PWA to the GAS backend.
 */
export const LoggerPayloadSchema = v.object({
  action: v.optional(v.string()),
  level: v.optional(v.string()),
  message: v.optional(v.string()),
  context: v.optional(v.string())
});

/**
 * [GUARD] GAS GET EVENT SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates the Google Apps Script 'doGet' event object.
 * THREAT: Malformed request parameters causing unexpected behavior or
 * bypassing the zero-trust token boundary.
 */
export const GasGetEventSchema = v.object({
  parameter: v.object({
    token: v.optional(v.string()),
    action: v.optional(v.string())
  }),
  parameters: v.optional(v.record(v.string(), v.array(v.string())))
});

/**
 * [GUARD] GENERIC PAYLOAD: Catch-all for unclassified actions.
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * THREAT: The "any Plague" (Target B [4]).
 * Rationale: Replacing v.any() with v.unknown() ensures that unvalidated
 * data cannot be accessed without explicit type narrowing or parsing.
 */
export const GenericPayloadSchema = v.objectWithRest(
  { action: v.optional(v.string()) },
  v.unknown()
);

/**
 * INTERNAL SCHEMAS (L2 Hardening)
 */

/**
 * [GUARD] MARKET INTELLIGENCE SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates the aggregated historical performance data for a player.
 * THREAT: Internal state corruption leading to incorrect scoring or tenure tracking.
 */
export const MarketIntelligenceSchema = v.object({
  firstSeen: v.date(),
  weeklyMax: v.instance(Map),
  battleWeeks: v.instance(Set),
  totalBattleCredits: v.number(),
  discoveredBattleDays: v.instance(Set),
  dailyBattleCredits: v.instance(Map),
  fameHistory: v.instance(Map)
});

/**
 * [GUARD] CLAN MEMBER SNAPSHOT SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates the core metrics of a clan member as stored in the Database sheet.
 * THREAT: Malformed database rows leading to incorrect tenure or credit calculations.
 */
export const ClanMemberSnapshotSchema = v.object({
  tag: TagSchema,
  name: v.string(),
  role: v.string(),
  trophies: v.number(),
  donations: v.number(),
  donationsReceived: v.number(),
  lastSeen: v.string(),
  // Fields for Market Intelligence
  date: v.optional(v.string()),
  warFame: v.optional(v.union([v.number(), v.string()]), 0),
  battleCredits: v.optional(v.union([v.number(), v.string()]), 0)
});

/**
 * [GUARD] RECRUIT SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates individual recruit entries as stored in the Headhunter sheet.
 */
export const RecruitSchema = v.object({
  tag: v.string(),
  name: v.string(),
  trophies: v.optional(v.number(), 0),
  donations: v.optional(v.number(), 0),
  cards: v.optional(v.number(), 0),
  war: v.optional(v.number(), 0),
  foundDate: v.unknown(), // Date or ISO string
  invited: v.boolean(),
  rawScore: v.optional(v.number(), 0),
  potentialScore: v.optional(v.number(), 0),
  lastScan: v.optional(v.number(), 0),
  source: v.optional(v.union([v.literal("TOURNAMENT"), v.literal("SHADOW")]))
});

/**
 * [GUARD] PLAYER RESULT SCHEMA
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * Validates the composite result of a player's performance analysis,
 * combining tenure, donations, and war activity.
 */
export const PlayerResultSchema = v.object({
  tag: v.string(),
  name: v.string(),
  role: v.string(),
  trophies: v.number(),
  daysTracked: v.number(),
  avgDailyDonations: v.number(),
  totalDonations: v.number(),
  lastSeen: v.unknown(),
  warRateVal: v.number(),
  avgWarFame: v.number(),
  historyString: v.string(),
  scores: v.object({ raw: v.number(), perf: v.number() }),
  cleanKey: v.string()
});

(function(scope: any) {
  Object.assign(scope, {
    VER_VALIDATION,
    BaseActionSchema,
    DismissRecruitsPayloadSchema,
    UndismissRecruitsPayloadSchema,
    TriggerUpdatePayloadSchema,
    PlayerProfilePayloadSchema,
    ProphetIntelSchema,
    RoyalePlayerSchema,
    LoggerPayloadSchema,
    GasGetEventSchema,
    GenericPayloadSchema,
    ClanMemberSnapshotSchema,
    MarketIntelligenceSchema,
    TagSchema,
    BlacklistEntrySchema,
    RoyaleClanMemberSchema,
    RoyaleClanSchema,
    RoyaleWarLogStandingSchema,
    RoyaleWarLogItemSchema,
    RoyaleWarLogResponseSchema,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
