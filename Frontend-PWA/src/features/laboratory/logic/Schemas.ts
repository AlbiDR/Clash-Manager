import * as v from "valibot";

/**
 * 🛡️ VALIDATION BOUNDARY: Laboratory Input
 * Enforces structural integrity for raw data entering the Laboratory engine.
 * Rationale: Laboratory accepts data from both internal cache and external API.
 * This schema ensures that malformed input is caught before it reaches the simulation loop.
 */

export const RawCardSchema = v.object({
  name: v.optional(v.string(), "Unknown Card"),
  rarity: v.optional(v.string(), "Common"),
  level: v.optional(v.number(), 1),
  count: v.optional(v.number(), 0),
  isTowerTroop: v.optional(v.boolean(), false),
});

export const RawInventorySchema = v.object({
  gold: v.optional(v.number(), 0),
  gems: v.optional(v.number(), 0),
  wildCards: v.optional(
    v.record(v.string(), v.number()),
    { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
  ),
});

const InternalProfileSchema = v.object({
  profile: v.object({
    name: v.optional(v.string(), "Unknown"),
    tag: v.optional(v.string(), "0"),
    kingLevel: v.optional(v.number(), 1),
    xpIntoLevel: v.optional(v.number(), 0),
  }),
  cards: v.optional(v.array(RawCardSchema), []),
  inventory: v.optional(RawInventorySchema, {}),
});

const ExternalProfileSchema = v.object({
  name: v.optional(v.string(), "Unknown"),
  tag: v.optional(v.string(), "0"),
  expLevel: v.optional(v.number(), 1),
  expPoints: v.optional(v.number(), 0),
  cards: v.optional(v.array(RawCardSchema), []),
  towerTroops: v.optional(v.array(RawCardSchema), []),
});

export const ProfileInputSchema = v.union([
  InternalProfileSchema,
  ExternalProfileSchema
]);

export type RawProfileInput = v.InferOutput<typeof ProfileInputSchema>;
