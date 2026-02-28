/**
 * ============================================================================
 * 🛡️ VALIDATION SCHEMAS: Backend Worker
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
const TAG_REGEX = /^[#]?[0-9A-Z]{3,12}$/;

/**
 * 🏷️ Branded Types Validators
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
 * 📨 REQUEST SCHEMAS
 */

export const AuditRequestSchema = v.object({
  apiKeys: v.array(v.string())
});

export const PublicScanRequestSchema = v.object({
  tags: v.array(TagSchema),
  apiKeys: v.optional(v.array(v.string())),
  blacklist: v.optional(v.array(TagSchema)),
  minTrophies: v.optional(v.number()),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  prophetCache: v.optional(v.record(v.string(), v.any()))
});

export const ScanRequestSchema = v.object({
  tags: v.array(TagSchema),
  apiKeys: v.optional(v.array(v.string())),
  blacklist: v.optional(v.array(TagSchema)),
  minTrophies: v.optional(v.number()),
  scoring: v.optional(v.nullable(ScoringWeightsSchema)),
  prophetCache: v.optional(v.record(v.string(), v.any()))
});

export const ClanFullRequestSchema = v.object({
  tag: TagSchema,
  apiKeys: v.array(v.string())
});

export const ClanApiRequestSchema = v.object({
  tag: TagSchema,
  type: v.picklist(["members", "warlog"]),
  apiKeys: v.array(v.string())
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
