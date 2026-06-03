// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * [GUARD] MEMBER SCHEMA
 * Domain-compliant schema for clan roster members.
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
  }),
});

/**
 * [GUARD] SUPABASE ROSTER ROW SCHEMA
 * Validates the raw shape of a row from the roster_view.
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
});
