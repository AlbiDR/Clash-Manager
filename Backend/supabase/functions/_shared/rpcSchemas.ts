// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";

/**
 * L1 Core: Supabase RPC Schemas
 * Authoritative validation boundaries for data returned by RPC functions.
 */

/**
 * L1 Core: Player Sync Payload Schema.
 *
 * @remarks
 * Used for inbound sync-player-cards requests.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const PlayerSyncPayloadSchema = v.object({
    tag: v.string()
});

/**
 * L1 Core: Shadow Discovery Target Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const ShadowTargetSchema = v.object({
    opponent_player_tag: v.string()
});

/**
 * L1 Core: Stale Recruit Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const StaleRecruitSchema = v.object({
    player_tag: v.string()
});

/**
 * L1 Core: Headhunter Context Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const HeadhunterContextSchema = v.object({
    required_trophies: v.number(),
    exclusion_tags: v.array(v.string())
});

/**
 * L1 Core: Discovery Anchor Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const DiscoveryAnchorSchema = v.object({
    keyword: v.string()
});

/**
 * L1 Core: Discovery Cache Item Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const DiscoveryCacheItemSchema = v.object({
    player_tag: v.string()
});

/**
 * L1 Core: Ingestion Targets Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const IngestionTargetsSchema = v.object({
    members: v.array(v.string()),
    recruits: v.array(v.string())
});

/**
 * L1 Core: Recruit Fate Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RecruitFateSchema = v.object({
    status: v.string(),
    raw_potential_score: v.union([v.number(), v.string()])
});
