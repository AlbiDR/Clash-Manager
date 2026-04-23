/**
 * ============================================================================
 * MODULE: VALIDATION SCEMAS
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized registry of Valibot schemas for API payload validation.
 * ROLE: Ingress Filtering & Boundary Hardening.
 * VERSION: 1.0.0
 * ============================================================================
 */

import * as v from 'valibot';

const VER_VALIDATION = "1.0.0";

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

// Base schema to extract 'action' field safely
export const BaseActionSchema = v.object({
  action: v.optional(v.string())
});

export const DismissRecruitItemSchema = v.union([
  v.string(),
  v.object({
    id: v.string(),
    score: v.optional(v.union([v.string(), v.number()])),
    potentialRawScore: v.optional(v.union([v.string(), v.number()])),
    rawScore: v.optional(v.union([v.string(), v.number()]))
  })
]);

export const DismissRecruitsPayloadSchema = v.object({
  action: v.optional(v.string()),
  items: v.optional(v.array(DismissRecruitItemSchema)),
  ids: v.optional(v.array(v.string()))
});

export const UndismissRecruitsPayloadSchema = v.object({
  action: v.optional(v.string()),
  ids: v.array(v.string())
});

export const TriggerUpdatePayloadSchema = v.object({
  action: v.optional(v.string()),
  target: v.string()
});

export const PlayerProfilePayloadSchema = v.object({
  action: v.optional(v.string()),
  tag: TagSchema
});

/**
 * [GUARD] Player Profile Schema
 *
 * @remarks
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

export const ClanMemberSnapshotSchema = v.object({
  tag: v.string(),
  name: v.string(),
  role: v.string(),
  trophies: v.number(),
  donations: v.number(),
  donationsReceived: v.number(),
  lastSeen: v.string()
});

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
    RoyalePlayerSchema,
    LoggerPayloadSchema,
    GasGetEventSchema,
    GenericPayloadSchema,
    TagSchema,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
