// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { RoyaleTagSchema } from "./royaleSchemas.ts";

/**
 * L1 Core: Supabase RPC Schemas
 * Authoritative validation boundaries for data returned by RPC functions.
 */

/**
 * L1 Core: Player Sync Payload Schema.
 *
 * @remarks
 * Used for inbound sync-player-cards requests. `tag` is validated against
 * `RoyaleTagSchema`, mirroring the `features.player_card_snapshots.player_tag`
 * CHECK constraint (`^#[0289CGJLPQRUVY]+$`) in
 * `Backend/supabase/migrations/20260531232406_master_migration.sql`, so an
 * unbounded/malformed string cannot reach the DB before `normalizeTag()` runs.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const PlayerSyncPayloadSchema = v.object({
    tag: RoyaleTagSchema
});

/**
 * L1 Core: Shadow Discovery Target Schema (RPC).
 *
 * @remarks
 * Validates target player payloads returned from shadow discovery RPC procedures.
 * Enforces string typing on `opponent_player_tag` prior to downstream harvesting.
 *
 * [THREAT: UNVALIDATED_TAG_INJECTION]
 * Prevents non-string or malformed structures from propagating into the shadow scout pipeline.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const ShadowTargetSchema = v.object({
    opponent_player_tag: v.string()
});

/**
 * L1 Core: Stale Recruit Schema (RPC).
 *
 * @remarks
 * Validates stale recruit player tag records retrieved from database cleanup RPC procedures.
 *
 * [THREAT: STALE_PURGE_CORRECTNESS]
 * Guarantees incoming RPC target payloads strictly match expected object shapes before invoking purge routines.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const StaleRecruitSchema = v.object({
    player_tag: v.string()
});

/**
 * L1 Core: Headhunter Context Schema (RPC).
 *
 * @remarks
 * Validates headhunter scanning context parameters including minimum trophy requirements and exclusion tag sets.
 *
 * [THREAT: BOUNDARY_TYPE_CORRUPTION]
 * Prevents invalid trophy counts or non-array exclusion lists from breaking scanner filtering logic.
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
 * Validates anchor keyword parameters used in deep-depth discovery RPC queries.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const DiscoveryAnchorSchema = v.object({
    keyword: v.string()
});

/**
 * L1 Core: Discovery Cache Item Schema.
 *
 * @remarks
 * Validates cached player tag entries returned from local or RPC discovery caches.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const DiscoveryCacheItemSchema = v.object({
    player_tag: v.string()
});

/**
 * L1 Core: Ingestion Targets Schema.
 *
 * @remarks
 * Validates and transforms schema-qualified targets returned by `get_ingestion_targets()`.
 *
 * [DECISION LOG] SCHEMA DECOUPLING:
 * The `get_ingestion_targets()` RPC returns schema-qualified keys (`"drivers.members"`, `"drivers.recruits"`).
 * The transform step normalises them to bare `members`/`recruits` so callers remain decoupled from the
 * Postgres schema-prefix convention.
 *
 * [THREAT: DATABASE_SCHEMA_LEAKAGE]
 * Decouples internal database namespace structure from Edge Function consumption contracts.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const IngestionTargetsSchema = v.pipe(
    v.object({
        "drivers.members":  v.array(v.string()),
        "drivers.recruits": v.array(v.string())
    }),
    // Transform schema-qualified RPC fields into domain-clean properties.
    v.transform((raw) => ({
        members:  raw["drivers.members"],
        recruits: raw["drivers.recruits"]
    }))
);

/**
 * L1 Core: Recruit Fate Schema (RPC).
 *
 * @remarks
 * Validates recruit status and potential score evaluation results returned from database scoring RPCs.
 * Accepts numeric or string representations of `raw_potential_score` to accommodate Postgres decimal returns.
 *
 * [THREAT: TYPE_COERCION_MISMATCH]
 * Handles union types for raw potential scores to prevent parsing failures when database drivers return numeric strings.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RecruitFateSchema = v.object({
    status: v.string(),
    raw_potential_score: v.union([v.number(), v.string()])
});
