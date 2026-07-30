// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Shared Backend Configuration Kernel (@shared)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized business thresholds, batch limits, and discovery
 * parameters used across the 'headhunter-scanner', 'ingest-royale-data',
 * and 'query-royale-api' pipelines.
 *
 * ARCHITECTURE:
 *    - Constants: Direct, immutable business rules derived from the ADR.
 * ============================================================================
 */

/**
 * PROFILER: Maximum number of candidate tags to profile in a single run.
 * Prevents memory exhaustion and execution timeouts in Edge Functions.
 */
export const PROFILER_BATCH_CEILING = 1000;

/**
 * PROFILER: Time window for filtering recently scanned recruits.
 * Prevents redundant API calls for recruits scanned in the last 30 minutes.
 */
export const RECENT_SCAN_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * RESCAN: Maximum number of stale recruits to re-scan in a single run.
 */
export const RESCAN_BATCH_LIMIT = 250;

/**
 * SHADOW SCOUT: Number of opponent tags to harvest from recent battle logs.
 */
export const SHADOW_DISCOVERY_LIMIT = 75;

/**
 * NATIVE DISCOVERY: Keyword substrate for broad-scanning open tournaments.
 */
export const DISCOVERY_KEYWORDS = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int"];

/**
 * BATCH PROCESSING: Standard concurrency levels.
 */
export const CONCURRENCY_PROFILER = 40;
export const CONCURRENCY_RESCAN = 10;
export const CONCURRENCY_DISCOVERY_KEYWORDS = 3;
export const CONCURRENCY_DISCOVERY_TOURNAMENTS = 5;

/**
 * HARVESTER: Operational thresholds and discovery parameters.
 */
export const PLAYER_LEADERBOARD_LIMIT = 1000;
export const TARGET_HARVEST_FLOOR = 80;
export const MIN_LOCAL_POL_FLOOR = 10;
export const MAX_HARVEST_EPOCHS = 15;
export const GLOBAL_LOCATION = "global";
export const LOCATION_ID_INTERNATIONAL = 57000101;
export const DEFAULT_FALLBACK_COUNTRY = "United States";
export const DEFAULT_FALLBACK_ID = 57000120;

export const TOP_COUNTRY_IDS = [
  "57000120", // United States
  "57000095", // Spain
  "57000038", // Brazil
  "57000117", // Japan
  "57000085", // France
  "57000091", // Germany
];

/**
 * ARRAY UTILS: Standardized indexing.
 */
export const INITIAL_INDEX = 0;

/**
 * RATE LIMITING: Operational bounds for the in-memory caller-rate limiter in
 * `_shared/protocol.ts`. These gate the three anon-reachable Edge Functions
 * (sync-player-cards, query-royale-api, fetch-player-battlelog), which accept the
 * publicly known Supabase anon key as a valid bearer credential -- rate limiting is
 * the actual access-control boundary for those three, not the bearer check.
 *
 * [DECISION LOG] These are mechanical operational bounds (max requests per window,
 * window duration), not scoring/business thresholds, so they are named constants here
 * rather than being treated as "magic numbers" requiring derivation from a formula.
 *
 * Per-IP: bounds total request volume from a single caller IP regardless of which
 * player/clan tag it targets, so an IP cannot bypass a per-target limit by rotating
 * across many different tags.
 */
export const RATE_LIMIT_IP_MAX_REQUESTS = 60;
export const RATE_LIMIT_IP_WINDOW_MS = 60 * 1000;

/**
 * RATE LIMITING: Per (caller IP + target tag/clan) bound. Independent from the
 * IP-only bucket above, so a single caller IP hammering one popular tag is capped
 * without penalizing every other caller of that same popular tag.
 */
export const RATE_LIMIT_IP_TARGET_MAX_REQUESTS = 20;
export const RATE_LIMIT_IP_TARGET_WINDOW_MS = 60 * 1000;

/**
 * RATE LIMITING: Opportunistic cleanup threshold for the in-memory bucket map.
 *
 * @remarks
 * [DECISION LOG] The limiter is an intentionally simple per-warm-instance fixed-window
 * counter (see `protocol.ts`) -- it resets on cold start and is NOT shared across
 * concurrent Edge Function instances. A warm instance that lives for a long time and
 * sees many distinct caller IPs / tags would otherwise accumulate stale bucket entries
 * forever. Rather than a background timer (Edge Functions have no persistent
 * background execution), the map is opportunistically swept for expired entries once
 * its size crosses this threshold, bounding worst-case memory growth without adding
 * any external dependency.
 */
export const RATE_LIMIT_BUCKET_SWEEP_THRESHOLD = 5000;

/**
 * FETCH-PLAYER-BATTLELOG: Hard ceiling on how many pooled Royale API keys a single
 * request fans out to in parallel.
 *
 * @remarks
 * [THREAT:] The key pool (`CONFIG.ROYALE_API_KEYS`) is operator-configured and can
 * grow without bound. Fanning out to every key in the pool on every anon-reachable
 * request means pool growth directly multiplies the blast radius of a single request
 * (and of an abusive caller looping requests).
 * [DECISION LOG] A random subset of the pool (rather than a fixed prefix) is selected
 * up to this ceiling on each request, preserving the "freshest across several proxy
 * nodes" intent of the fan-out while capping upstream call volume per request.
 */
export const MAX_BATTLELOG_FANOUT_KEYS = 5;

/**
 * RPOS: Trophy weight coefficient. Anchors the score to the player's current
 * competitive level, and is also the base for the adaptive win rate weight
 * (see RPOS_WIN_RATE_RATIO below).
 */
export const RPOS_TROPHY_WEIGHT = 1.0;

/**
 * RPOS: Lifetime career donation weight coefficient. Applies to the player
 * profile's `totalDonations` (lifetime), not the weekly `drivers.members.donations`.
 */
export const RPOS_DONATION_WEIGHT = 0.1;

/**
 * RPOS: Scaling ratio that derives the adaptive win rate weight from the
 * trophy score (e.g. 0.35 = 35% of trophy score). See calculateRpos() in
 * utils.ts for the derivation: RPOS_WIN_RATE_WEIGHT = (trophies *
 * RPOS_TROPHY_WEIGHT) * RPOS_WIN_RATE_RATIO. This keeps the win rate
 * component proportionate whether the profile is early-game or endgame,
 * instead of a fixed magic-number weight.
 */
export const RPOS_WIN_RATE_RATIO = 0.35;

/**
 * RPOS: Point value multiplier applied to three-crown wins inside the
 * weighted win rate calculation. A three-crown win counts as 1.25 wins
 * instead of a standard 1.0 win, reflecting dominant execution.
 */
export const RPOS_THREE_CROWN_MULT = 1.25;

/**
 * RPOS: Legacy Clan Wars 1 (CW1) war day win micro-bonus coefficient.
 * `warDayWins` has been frozen since CW1 retired on 2020-08-31, so this is a
 * small tenure signal only for veteran players, applied with no offset and
 * no floor: zero war day wins contributes exactly zero.
 */
export const RPOS_LEGACY_WAR_WEIGHT = 10;

/**
 * RPOS: Challenge card count micro-bonus coefficient.
 */
export const RPOS_CHALLENGE_CARD_WEIGHT = 0.1;

/**
 * RPOS: Cap on the challenge card count that counts toward the score.
 * Challenges are infinitely available, so an uncapped count would let pure
 * grinding inflate the score without evidence of quality.
 */
export const RPOS_CHALLENGE_CARD_CAP = 10000;

/**
 * RPOS: Grand Challenge bonus weight, expressed as a ratio of the adaptive
 * win rate weight (RPOS_WIN_RATE_WEIGHT * RPOS_GC_BONUS_RATIO) so that tuning
 * the win rate weight automatically rescales the bonus.
 */
export const RPOS_GC_BONUS_RATIO = 0.4;

/**
 * RPOS: Minimum `challengeMaxWins` required to trigger the Grand Challenge bonus.
 */
export const GRAND_CHALLENGE_WIN_THRESHOLD = 12;

/**
 * CORS: Resolves the configured allow-list of browser origins permitted to receive a
 * reflected `Access-Control-Allow-Origin` header from the anon-reachable proxy
 * functions (sync-player-cards, query-royale-api, fetch-player-battlelog).
 *
 * @remarks
 * Read from the comma-separated `ALLOWED_ORIGINS` env var (e.g.
 * `"https://app.example.com,https://staging.example.com"`), mirroring the env-read
 * idiom already used elsewhere in this kernel (see `vault.ts`/`muscle.ts`, which read
 * `Deno.env` lazily inside a function body rather than at module scope so that
 * non-Deno test runners never touch the global).
 *
 * [DECISION LOG] A request whose `Origin` header is entirely absent (server-to-server
 * / pg_cron callers) is never subject to this check -- there is nothing to reflect,
 * and the caller does not enforce CORS anyway. A request whose `Origin` does not
 * match this list simply does not get the header reflected back, which is sufficient
 * to block a disallowed browser page from reading the response without needing to
 * reject the request outright (see `resolveCorsHeaders` in `protocol.ts`).
 * [GUARD] `typeof Deno === "undefined"` short-circuits to an empty list under Node/
 * Vitest test runs that never stub the Deno global (e.g. `protocol.spec.ts`), instead
 * of throwing a ReferenceError.
 */
export function getAllowedOrigins(): string[] {
  if (typeof Deno === "undefined") return [];
  return (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
