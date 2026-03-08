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
  tag: v.string()
});

export const LoggerPayloadSchema = v.object({
  action: v.optional(v.string()),
  level: v.optional(v.string()),
  message: v.optional(v.string()),
  context: v.optional(v.string())
});

export const GenericPayloadSchema = v.objectWithRest(
  { action: v.optional(v.string()) },
  v.any()
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
  trophies: v.number(),
  donations: v.number(),
  cards: v.number(),
  war: v.number(),
  foundDate: v.any(), // Date or ISO string
  invited: v.boolean(),
  rawScore: v.number(),
  potentialScore: v.optional(v.number()),
  lastScan: v.optional(v.number()),
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
  lastSeen: v.any(),
  warRateVal: v.number(),
  avgWarFame: v.number(),
  historyString: v.string(),
  scores: v.object({ raw: v.number(), perf: v.number() }),
  cleanKey: v.string()
});

(function(scope: any) {
  Object.assign(scope, { VER_VALIDATION });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
