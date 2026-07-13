// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * RECRUIT SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Domain-compliant validation schema for potential recruits.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 *
 * [DECISION LOG] Implements strict Valibot piping for string/number safety.
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
 * SUPABASE HEADHUNTER ROW SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Validates the raw shape of a row from the headhunter_view.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 *
 * [THREAT:] Inbound data from Supabase views may contain nulls or missing fields
 * due to view join failures. This schema enforces defaults and safe pipes.
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
 * RECRUIT TOMBSTONE SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Validates the collection of dismissed recruit IDs stored in LocalStorage.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 */
export const RecruitTombstoneSchema = v.array(v.string());

/**
 * DISMISS RESPONSE SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Validates the shape of dismissal RPC results.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 *
 * [DECISION LOG] Replaced unsafe type assertions in RecruitClient with
 * strict schema validation via this contract.
 */
export const DismissResponseSchema = v.object({
  success: v.boolean(),
  count: v.optional(SafeNumberPipe),
  message: v.optional(SafeStringPipe),
});

/**
 * HARVESTED PLAYER SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Validates the shape of a single player harvested from the leaderboard proxy.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 */
export const HarvestedPlayerSchema = v.object({
  tag: SafeStringPipe,
  name: SafeStringPipe,
  clan: v.optional(v.nullable(v.unknown()))
});

/**
 * LEADERBOARD HARVEST SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Authoritative validation boundary for the query-royale-api response.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 */
export const LeaderboardHarvestSchema = v.object({
  items: v.array(HarvestedPlayerSchema),
  region: v.optional(SafeStringPipe, "Unknown")
});

/**
 * BLACKLIST EVENT SCHEMA
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core API (@core/api)
 * - **Role:** Validates the shape of Realtime payloads from drivers.recruit_blacklist.
 * - **Satisfies ADR Section III: Validation Boundaries.**
 *
 * [THREAT:] Unvalidated realtime payloads can cause runtime crashes in feature-layer
 * subscribers if the database trigger or replication payload shape changes.
 */
export const BlacklistEventSchema = v.union([
  v.object({ new: v.object({ player_tag: SafeStringPipe }) }),
  v.object({ old: v.object({ player_tag: SafeStringPipe }) })
]);
