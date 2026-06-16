// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * [GUARD] RECRUIT SCHEMA
 * Domain-compliant schema for potential recruits.
 */
export const RecruitSchema = v.object({
  id: SafeStringPipe,
  n: SafeStringPipe,
  t: SafeNumberPipe,
  potentialScore: v.optional(SafeNumberPipe, 0),
  potentialRawScore: v.optional(SafeNumberPipe, 0),
  d: v.object({
    don: SafeNumberPipe,
    war: SafeNumberPipe,
    ago: SafeStringPipe,
    cards: v.optional(SafeNumberPipe, 0),
  }),
  lastScan: v.optional(SafeNumberPipe, 0),
});

/**
 * [GUARD] SUPABASE HEADHUNTER ROW SCHEMA
 * Validates the raw shape of a row from the headhunter_view.
 */
export const SbHeadhunterRowSchema = v.object({
  player_name: v.optional(SafeStringPipe, "Unknown"),
  player_tag: v.optional(SafeStringPipe, ""),
  trophies: v.optional(SafeNumberPipe, 0),
  donations: v.optional(SafeNumberPipe, 0),
  cards: v.optional(SafeNumberPipe, 0),
  war_wins: v.optional(SafeNumberPipe, 0),
  raw_potential_score: v.optional(SafeNumberPipe, 0),
  potential_score: v.optional(SafeNumberPipe, 0),
  longevity_label: v.optional(SafeStringPipe, "-"),
  longevity: v.optional(SafeNumberPipe, 0),
  tenure_label: v.optional(SafeStringPipe, ""),
  tenure_days: v.optional(SafeNumberPipe, 0),
  tier: v.optional(SafeStringPipe, "MID"),
  heritage_status: v.optional(SafeStringPipe, "NEW_CANDIDATE"),
  has_heritage_blessing: v.optional(v.boolean(), false),
  last_seen_at: v.optional(v.nullable(SafeStringPipe)),
  found_date: v.optional(SafeStringPipe, ""),
  ingame_link: v.optional(SafeStringPipe, ""),
  royaleapi_link: v.optional(SafeStringPipe, ""),
});

/**
 * [GUARD] RECRUIT TOMBSTONE SCHEMA
 * Validates the collection of dismissed recruit IDs stored in LocalStorage.
 */
export const RecruitTombstoneSchema = v.array(v.string());

/**
 * [GUARD] HARVESTED PLAYER SCHEMA
 * Validates the shape of a single player harvested from the leaderboard proxy.
 */
export const HarvestedPlayerSchema = v.object({
  tag: SafeStringPipe,
  name: SafeStringPipe,
  clan: v.optional(v.nullable(v.unknown()))
});

/**
 * [GUARD] LEADERBOARD HARVEST SCHEMA
 * Authoritative validation boundary for the query-royale-api response.
 */
export const LeaderboardHarvestSchema = v.object({
  items: v.array(HarvestedPlayerSchema),
  region: v.optional(SafeStringPipe, "Unknown")
});
