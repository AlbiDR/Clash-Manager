// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { RawCardSchema, RawInventorySchema } from "./BaseSchemas";

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
