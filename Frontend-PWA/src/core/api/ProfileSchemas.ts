// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { RawCardSchema, RawInventorySchema } from "./BaseSchemas";

/**
 * [GUARD] INTERNAL PROFILE SCHEMA
 * Validates the player profile format used internally by the system.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * This schema defines the structure of the profile data as persisted in the
 * system's local storage and internal state.
 *
 * [THREAT:] Structural drift between local and remote state can cause UI deadlocks.
 * [DECISION LOG] Optional fields with safe defaults ensure the UI remains functional
 * even if partial data is retrieved from IndexedDB.
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
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Maps the raw response from the Clash Royale API or the proxy layer.
 *
 * [THREAT:] External API contract changes are the primary source of runtime failures.
 * [DECISION LOG] Use v.optional for all fields to allow the system to gracefully
 * handle missing data from the public API.
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
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Used by ProfileClient to normalize incoming data before it reaches the simulation engine.
 */
export const ProfileInputSchema = v.union([
  InternalProfileSchema,
  ExternalProfileSchema
]);
