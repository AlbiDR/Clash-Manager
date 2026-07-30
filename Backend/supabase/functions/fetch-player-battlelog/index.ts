// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { clinicalServe } from "../_shared/protocol.ts";
import { normalizeTag } from "../_shared/utils.ts";
import { RoyaleBattleLogSchema, RoyaleTagSchema, KeyPoolSchema } from "../_shared/schemas.ts";
import {
  MAX_BATTLELOG_FANOUT_KEYS,
  RATE_LIMIT_IP_MAX_REQUESTS,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_IP_TARGET_MAX_REQUESTS,
  RATE_LIMIT_IP_TARGET_WINDOW_MS,
} from "../_shared/config.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";

/**
 * Edge Function: fetch-player-battlelog
 * L5 Control Layer: Secure proxy for fetching a single player's live battle log
 * directly from the Clash Royale API.
 *
 * @remarks
 * Intended for testing and diagnostic purposes. Accepts a player tag,
 * fans out the battlelog request across up to MAX_BATTLELOG_FANOUT_KEYS randomly
 * selected keys from the pool in parallel (each key routes to a different proxy
 * node with its own cache state),
 * then returns the response with the most recent battleTime. This maximises
 * the chance of surfacing the freshest available data across the full key pool.
 */

const ROYALE_PROXY_BASE = "https://proxy.royaleapi.dev/v1";
const INITIAL_INDEX = 0;

/**
 * Validation schema for the inbound payload.
 * Requires a player tag in Clash Royale format (e.g. "#PP80QG99").
 *
 * [GUARD] VALIDATION BOUNDARY: mirrors RoyaleTagSchema (see royaleSchemas.ts),
 * itself mirroring the DB's `player_tag`/`clan_tag` CHECK constraint
 * (`^#[0289CGJLPQRUVY]+$`), so an unbounded/malformed string is rejected here
 * rather than passing through as a bare `v.string()`.
 */
const PayloadSchema = v.object({
  playerTag: RoyaleTagSchema,
});

/**
 * Resolves the full key pool from the environment secret.
 *
 * @remarks
 * Mirrors the logic in muscle.ts getKeys() but operates post-syncVault,
 * so it always reflects the freshest set of keys available in CONFIG.
 *
 * [THREAT:] Unvalidated key pool configurations can lead to silent sync failures.
 * [DECISION LOG] Transitioned to KeyPoolSchema for clinical normalization of keys.
 */
function resolveKeyPool(): string[] {
  return v.parse(KeyPoolSchema, CONFIG.ROYALE_API_KEYS);
}

/**
 * Selects at most `maxKeys` keys from the pool to fan a single request out across.
 *
 * @remarks
 * [THREAT:] The key pool is operator-configured and can grow without bound. Fanning a
 * single anon-reachable request out to every key in the pool means pool growth directly
 * multiplies the upstream call volume of one request (and of an abusive caller looping
 * requests).
 * [DECISION LOG] A random subset (Fisher-Yates shuffle, then slice), not a fixed prefix,
 * so the "freshest across several independent proxy nodes" intent of the fan-out is
 * preserved -- a fixed prefix would always hit the same subset of nodes on every call.
 *
 * @param keyPool - The full resolved key pool.
 * @param maxKeys - The hard ceiling on how many keys to select.
 * @returns Up to `maxKeys` keys from `keyPool`, in random order.
 */
function selectFanoutKeys(keyPool: string[], maxKeys: number): string[] {
  if (keyPool.length <= maxKeys) return keyPool;

  const shuffled = [...keyPool];
  for (let shuffleIndex = shuffled.length - 1; shuffleIndex > 0; shuffleIndex--) {
    const swapIndex = Math.floor(Math.random() * (shuffleIndex + 1));
    [shuffled[shuffleIndex], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[shuffleIndex]];
  }
  return shuffled.slice(0, maxKeys);
}

/**
 * Fetches the battle log for a player using a single API key.
 * Returns null on any non-200 response or network error.
 *
 * @param encodedTag - URL-encoded player tag.
 * @param keyToken - The Royale API bearer token to use.
 * @returns A promise resolving to the validated battle log items or null on failure.
 */
async function fetchBattlelogWithKey(
  encodedTag: string,
  keyToken: string,
): Promise<v.InferOutput<typeof RoyaleBattleLogSchema> | null> {
  try {
    // [THREAT:] External API calls are potential failure points.
    // [DECISION LOG] Standard fetch is used here; rotation and fan-out are handled
    // at the orchestrator level to maximize data freshness across proxy nodes.
    const apiResponse = await fetch(
      `${ROYALE_PROXY_BASE}/players/${encodedTag}/battlelog`,
      {
        headers: {
          Authorization: `Bearer ${keyToken.trim().replace(/^"|"$/g, "")}`,
          Accept: "application/json",
        },
      },
    );

    if (!apiResponse.ok) return null;

    const rawBattleLogPayload: unknown = await apiResponse.json();

    // [GUARD] VALIDATION BOUNDARY: External API ingress must be validated.
    // [THREAT:] Prevents runtime crashes from unexpected Royale API payload changes.
    const battleLogValidation = v.safeParse(RoyaleBattleLogSchema, rawBattleLogPayload);
    return battleLogValidation.success ? battleLogValidation.output : null;
  } catch (fetchError: unknown) {
    const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.warn(`[fetch-player-battlelog] Single-key fetch failed: ${errorMessage}`);
    return null;
  }
}

/**
 * Parses a Royale API battleTime string into a comparable timestamp number.
 * Format: "20260614T093152.000Z"
 *
 * [THREAT:] Malformed battleTime strings from external API can cause Temporal parsing to crash.
 * [DECISION LOG] Implemented defensive reformatting with regex and explicit error narrowing.
 *
 * @param battleTime - Raw battleTime string from the Royale API.
 * @returns The epoch milliseconds timestamp for the battle.
 * @throws Error if the battleTime format is invalid.
 */
function parseBattleTime(battleTime: string): number {
  const timeFormatRegex = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/;

  if (!timeFormatRegex.test(battleTime)) {
    throw new Error(`Invalid battleTime format received: ${battleTime}`);
  }

  // Reformat from "20260614T093152.000Z" to "2026-06-14T09:31:52.000Z"
  const reformatted = battleTime.replace(
    timeFormatRegex,
    "$1-$2-$3T$4:$5:$6",
  );

  try {
    return Temporal.Instant.from(reformatted).epochMilliseconds;
  } catch (parseError: unknown) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Temporal parsing failed for ${reformatted}: ${message}`);
  }
}

/**
 * MAIN HANDLER: fetch-player-battlelog
 *
 * @remarks
 * Satisfies ADR Section V: Edge Functions - Data Ingestion.
 * Uses the clinical protocol wrapper for authorization, validation,
 * and telemetry. Accepts a POST body with a `playerTag` field.
 *
 * Authentication accepts both the internal bearer token and the
 * Supabase anon key to support direct browser-side testing calls.
 *
 * @returns A Response object with the freshest available battle log for the player.
 */
Deno.serve(async (battlelogRequest) => {
  await syncVault();

  return await clinicalServe({
    req: battlelogRequest,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "PLAYER_BATTLELOG_FETCH",
    componentId: "FETCH_PLAYER_BATTLELOG",
    schema: PayloadSchema,
    // [SECURITY] This function accepts the publicly known Supabase anon key as a valid
    // bearer credential (browser PWA path), so the anon key is not the access-control
    // boundary here -- rate limiting is. It also fans one request out across the whole
    // key pool in parallel (capped by MAX_BATTLELOG_FANOUT_KEYS below), so it is the
    // most expensive of the three anon-reachable functions per request.
    rateLimit: {
      maxRequests: RATE_LIMIT_IP_MAX_REQUESTS,
      windowMs: RATE_LIMIT_IP_WINDOW_MS,
      targetKey: (payload) => payload.playerTag,
      targetMaxRequests: RATE_LIMIT_IP_TARGET_MAX_REQUESTS,
      targetWindowMs: RATE_LIMIT_IP_TARGET_WINDOW_MS,
    },
    handler: async (battlelogPayload, logAudit) => {
      // [DECISION LOG] Tags are normalized to ensure consistency across proxy nodes.
      const { playerTag } = battlelogPayload;

      // Normalize tag: ensure it starts with '#' regardless of client encoding.
      const normalizedTag = normalizeTag(playerTag);

      const encodedTag = encodeURIComponent(normalizedTag);
      // [GUARD] Hard ceiling on parallel upstream fan-out (see selectFanoutKeys doc).
      const keyPool = selectFanoutKeys(resolveKeyPool(), MAX_BATTLELOG_FANOUT_KEYS);

      logAudit("BATTLELOG_FAN_OUT", "called", {
        playerTag: normalizedTag,
        keyCount: keyPool.length,
      });

      if (keyPool.length === INITIAL_INDEX) {
        throw new Error("No Royale API keys available in the key pool.");
      }

      // [THREAT:] Silent failures in the fan-out pool could lead to stale or missing data.
      // [DECISION LOG] We fan out across ALL keys in parallel and pick the freshest result
      // to ensure we surface the most recent data available across the full key pool.
      const battleLogPool = await Promise.all(
        keyPool.map((keyToken) => fetchBattlelogWithKey(encodedTag, keyToken)),
      );

      const validBattleLogs = battleLogPool.filter(
        (battleLogCandidate): battleLogCandidate is v.InferOutput<typeof RoyaleBattleLogSchema> =>
          battleLogCandidate !== null && battleLogCandidate.length > INITIAL_INDEX,
      );

      logAudit("BATTLELOG_FAN_OUT", "completed", {
        playerTag: normalizedTag,
        responded: validBattleLogs.length,
        failed: keyPool.length - validBattleLogs.length,
      });

      if (validBattleLogs.length === INITIAL_INDEX) {
        throw new Error(
          `All ${keyPool.length} keys failed to return a valid battle log for ${normalizedTag}.`,
        );
      }

      // [THREAT:] CROSS-NODE DATA DRIFT: Royale API proxy nodes have independent cache states.
      // Selecting a single node can result in stale battle logs if that node's cache is behind.
      // [DECISION LOG] To guarantee sub-second freshness, we reduce the parallel fan-out pool
      // by comparing the most recent battleTime of each valid response. This ensures the
      // client always receives the absolute freshest data available across the full key pool.
      const freshestBattleLog = validBattleLogs.reduce((bestBattleLog, candidateBattleLog) => {
        const bestTime = parseBattleTime(bestBattleLog[INITIAL_INDEX].battleTime);
        const candidateTime = parseBattleTime(candidateBattleLog[INITIAL_INDEX].battleTime);
        return candidateTime > bestTime ? candidateBattleLog : bestBattleLog;
      });

      logAudit("BATTLELOG_FETCH", "completed", {
        playerTag: normalizedTag,
        battleCount: freshestBattleLog.length,
        mostRecentBattle: freshestBattleLog[INITIAL_INDEX].battleTime,
      });

      return {
        playerTag: normalizedTag,
        battleCount: freshestBattleLog.length,
        battles: freshestBattleLog,
      };
    },
  });
});
