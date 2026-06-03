// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * [GUARD] VOYAGE EVENT SCHEMA
 * Validates the shape of a Clan Voyage event.
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
 * Validates player performance within a voyage.
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
 * Validates the raw output of the `features.voyage_summary` view.
 */
export const VoyageSummarySchema = v.object({
  event: VoyageEventSchema,
  total_voyage_crowns: SafeNumberPipe,
  progress_ratio: SafeNumberPipe,
});
