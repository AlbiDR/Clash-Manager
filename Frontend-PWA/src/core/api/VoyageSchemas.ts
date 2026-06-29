// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * [GUARD] VOYAGE EVENT SCHEMA
 * Authoritative validation boundary for Clan Voyage events.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * This schema ensures that voyage lifecycle events (IDLE, PENDING, ACTIVE, COMPLETED)
 * are strictly validated before entering the feature state.
 *
 * [THREAT:] Undefined voyage states can lead to UI rendering deadlocks.
 * [DECISION LOG] Utilizing SafeNumberPipe and SafeStringPipe to handle
 * potential nullability from the Supabase view.
 */
export const VoyageEventSchema = v.object({
  id: SafeNumberPipe,
  clan_tag: v.optional(SafeStringPipe, ""),
  status: v.picklist(["IDLE", "PENDING", "ACTIVE", "COMPLETED"]),
  target_crowns: SafeNumberPipe,
  start_at: SafeStringPipe,
  end_at: v.nullable(SafeStringPipe),
  activated_by: v.optional(v.nullable(SafeStringPipe)),
  is_victory: v.optional(v.nullable(v.boolean())),
});

/**
 * [GUARD] VOYAGE CONTRIBUTION SCHEMA
 * Validates player performance metrics within a specific voyage event.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Normalizes contribution percentages and performance scores for display.
 *
 * [THREAT:] Floating point precision issues in remote calculations can
 * cause validation rejection if not coerced via SafeNumberPipe.
 */
export const VoyageContributionSchema = v.object({
  player_tag: SafeStringPipe,
  player_name: v.optional(SafeStringPipe),
  total_voyage_crowns: SafeNumberPipe,
  percentage_voyage_crowns: SafeNumberPipe,
  performance_score: v.optional(SafeNumberPipe),
});

/**
 * [GUARD] VOYAGE SUMMARY SCHEMA
 * Validates the aggregate output of the voyage summary view.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Acts as the primary orchestrator for the Voyage feature's initial hydration.
 *
 * [THREAT:] Structural drift in the 'features.voyage_summary' view can
 * break the dashboard if defaults are not provided.
 */
export const VoyageSummarySchema = v.object({
  event: VoyageEventSchema,
  total_voyage_crowns: SafeNumberPipe,
  progress_ratio: SafeNumberPipe,
});

/**
 * [GUARD] VOYAGE RPC RESULT SCHEMA
 * Validates the standard response shape for Voyage database procedures.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Ensures consistent error handling for critical mutations (scheduling/canceling).
 *
 * [THREAT:] Silent RPC failures can lead to "optimistic UI" desynchronization.
 * [DECISION LOG] Explicitly requiring the 'success' boolean to ensure the
 * UI can react to transaction failures.
 */
export const VoyageRpcResultSchema = v.object({
  success: v.boolean(),
  error: v.optional(v.nullable(SafeStringPipe)),
});
