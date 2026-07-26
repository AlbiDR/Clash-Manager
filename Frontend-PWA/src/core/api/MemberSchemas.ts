// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * MEMBER SCHEMAS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes validation boundaries for clan roster data.
 * Ensures structural integrity between the Supabase persistence layer and
 * the PWA domain logic.
 *
 * ARCHITECTURAL CONTEXT:
 * - Layer: Layer 1 (@core)
 * - ADR Reference: Section III: Data Flow & Transactional Integrity
 * ----------------------------------------------------------------------------
 */

/**
 * [GUARD] MEMBER SCHEMA
 * Authoritative domain-compliant schema for clan roster members.
 *
 * @remarks
 * Satisfies ADR Section III: Domain Model Transformation.
 * This schema defines a 'Persistence-Ignorant' domain object, decoupled from
 * raw database column names. It serves as the target for DTO mapping in Layer 1.
 *
 * [THREAT:] Structural drift in domain models can cause silent failures in
 * UI components that rely on specific property paths.
 */
export const MemberSchema = v.object({
  id: SafeStringPipe,
  n: SafeStringPipe,
  t: SafeNumberPipe,
  performanceScore: SafeNumberPipe,
  performanceRawScore: SafeNumberPipe,
  dt: v.optional(SafeNumberPipe),
  d: v.object({
    role: SafeStringPipe,
    days: SafeNumberPipe,
    avg: SafeNumberPipe,
    seen: v.optional(v.nullable(SafeStringPipe)),
    rate: v.optional(v.nullable(SafeStringPipe)),
    wfame: v.optional(SafeNumberPipe),
    hist: SafeStringPipe,
    v_hist: v.optional(SafeStringPipe),
    war: v.optional(SafeNumberPipe, 0),
  }),
});

/**
 * [GUARD] SUPABASE ROSTER ROW SCHEMA
 * Validates the raw shape of a row from the roster_view.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundary (Schema-Gatekeeper).
 * This schema acts as the primary gatekeeper for raw data entering from
 * the Supabase 'roster_view'. It handles optionality and nullability
 * to ensure stable ingestion even if the underlying view undergoes minor shifts.
 *
 * [THREAT:] Database schema evolution without corresponding frontend updates
 * can lead to hydration failures.
 * [DECISION LOG] Utilizing 'v.optional' with sensible defaults to prevent
 * runtime crashes if specific columns are temporarily missing or null.
 */
export const SbRosterRowSchema = v.object({
  player_tag: v.optional(SafeStringPipe, ""),
  player_name: v.optional(SafeStringPipe, "Unknown"),
  role: v.optional(SafeStringPipe, ""),
  ingame_link: v.optional(SafeStringPipe, ""),
  royaleapi_link: v.optional(SafeStringPipe, ""),
  exp_level: v.optional(SafeNumberPipe, 1),
  trophies: v.optional(SafeNumberPipe, 0),
  donations: v.optional(SafeNumberPipe, 0),
  donations_received: v.optional(SafeNumberPipe, 0),
  clan_rank: v.optional(SafeNumberPipe, 0),
  decks_used_today: v.optional(SafeNumberPipe, 0),
  decks_used_weekly: v.optional(SafeNumberPipe, 0),
  week_fame: v.optional(SafeNumberPipe, 0),
  avg_fame: v.optional(SafeNumberPipe, 0),
  raw_performance_score: v.optional(SafeNumberPipe, 0),
  rpes: v.optional(SafeNumberPipe, 0),
  performance_score: v.optional(SafeNumberPipe, 0),
  pes: v.optional(SafeNumberPipe, 0),
  stability_index: v.optional(SafeNumberPipe, 0),
  last_seen_at: v.optional(v.nullable(SafeStringPipe)),
  last_ingested_at: v.optional(v.nullable(SafeStringPipe)),
  last_seen_label: v.optional(SafeStringPipe, "-"),
  tenure_label: v.optional(SafeStringPipe, "-"),
  tenure_days: v.optional(SafeNumberPipe, 0),
  hist: v.optional(SafeStringPipe, ""),
  v_hist: v.optional(v.nullable(SafeStringPipe)),
  war_participation: v.optional(SafeNumberPipe, 0),
  avg_daily_donations: v.optional(v.nullable(SafeNumberPipe)),
  war_wins: v.optional(SafeNumberPipe, 0),
});
