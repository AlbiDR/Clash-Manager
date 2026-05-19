// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import type { LeaderboardMember, Recruit } from "@core/types";
import { SbRosterRowSchema, SbHeadhunterRowSchema } from "./DataSchemas";

/**
 * DATA MAPPERS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Separates domain mapping logic from transport implementation.
 * Ensures SupabaseClient focuses strictly on connectivity and orchestration.
 * ----------------------------------------------------------------------------
 */

/**
 * Transforms a Supabase roster row into a LeaderboardMember.
 *
 * @remarks
 * [GUARD] DATA NORMALIZATION: Resolves schema-specific projections to
 * unified L1 Core types.
 *
 * @param rosterRow - Validated row from roster_view.
 * @returns A domain-compliant LeaderboardMember object.
 */
export function mapSbRosterRow(rosterRow: v.InferOutput<typeof SbRosterRowSchema>): LeaderboardMember {
  return {
    id: rosterRow.player_tag?.replace('#', '') || '',
    n: rosterRow.player_name || '',
    t: Number(rosterRow.trophies) || 0,
    performanceScore: Number(rosterRow.performance_score) || 0,
    performanceRawScore: Number(rosterRow.raw_performance_score) || 0,
    dt: 0, // roster_view currently does not provide a score delta
    d: {
      role: rosterRow.role || '',
      days: Math.floor(Number(rosterRow.tenure_days)) || 0,
      avg: Number(rosterRow.donations) || 0,
      seen: rosterRow.last_seen_at || '-',
      rate: rosterRow.war_participation != null ? `${Math.round(Number(rosterRow.war_participation))}%` : '-',
      wfame: Math.round(Number(rosterRow.avg_fame || rosterRow.week_fame)) || 0,
      hist: rosterRow.hist || '-', // roster_view currently does not provide a war history string
    },
  };
}

/**
 * Transforms a Supabase headhunter row into a Recruit.
 *
 * @remarks
 * [GUARD] DATA NORMALIZATION: Resolves schema-specific projections to
 * unified L1 Core types.
 *
 * @param headhunterRow - Validated row from headhunter_view.
 * @returns A domain-compliant Recruit object.
 */
export function mapSbHeadhunterRow(headhunterRow: v.InferOutput<typeof SbHeadhunterRowSchema>): Recruit {
  return {
    id: headhunterRow.player_tag?.replace('#', '') || '',
    n: headhunterRow.player_name || '',
    t: Number(headhunterRow.trophies) || 0,
    potentialScore: Number(headhunterRow.potential_score) || 0,
    potentialRawScore: Number(headhunterRow.raw_potential_score) || 0,
    longevity: Number(headhunterRow.longevity) || 0,
    longevityLabel: headhunterRow.longevity_label || '-',
    tenureDays: headhunterRow.tenure_days != null ? Number(headhunterRow.tenure_days) : undefined,
    tenureLabel: headhunterRow.tenure_label || undefined,
    lastScan: headhunterRow.last_seen_at ? new Date(headhunterRow.last_seen_at).getTime() : Date.now(),
    d: {
      don: Number(headhunterRow.donations) || 0,
      war: Number(headhunterRow.war_wins) || 0,
      ago: headhunterRow.found_date || '-',
      cards: Number(headhunterRow.cards) || 0,
    },
  };
}
