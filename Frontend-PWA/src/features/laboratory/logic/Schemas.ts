// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/**
 * 🛡️ VALIDATION BOUNDARY: Laboratory Input
 * Enforces structural integrity for raw data entering the Laboratory engine.
 * Rationale: Laboratory accepts data from both internal cache and external API.
 * This schema ensures that malformed input is caught before it reaches the simulation loop.
 * Target B [1]: Enforce strict validation boundary for Royale API data.
 */

export * from "@core/api/DataSchemas";

/**
 * [GUARD] Optimization Settings Schema
 * Rationale: Validates user-defined constraints stored in LocalStorage.
 * Prevents "The any Plague" from entering the Pinia store via persistence.
 */
export const OptimizationSettingsSchema = v.object({
  strategy: v.picklist(["Level Projection", "Resource Efficiency"]),
  allowGemSpending: v.boolean(),
  infiniteResources: v.boolean(),
  targetLevel: v.optional(v.number()),
});

/**
 * [GUARD] Inventory Override Schema
 * Rationale: Validates manual inventory overrides stored in LocalStorage.
 * Ensures that corrupted persistence data does not poison the simulation state.
 */
export const InventoryOverrideSchema = v.partial(v.object({
  gold: v.number(),
  gems: v.number(),
  wildCards: v.partial(v.record(v.picklist(["Common", "Rare", "Epic", "Legendary", "Champion"]), v.number()))
}));
