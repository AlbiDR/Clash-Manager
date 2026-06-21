// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.1";
import { clinicalServe } from "../_shared/protocol.ts";
import { RoyaleBattleLogSchema } from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";

/**
 * Edge Function: fetch-player-battlelog
 * L5 Control Layer: Secure proxy for fetching a single player's live battle log
 * directly from the Clash Royale API.
 *
 * @remarks
 * Intended for testing and diagnostic purposes. Accepts a player tag,
 * fans out the battlelog request across ALL available API keys in parallel
 * (each key routes to a different proxy node with its own cache state),
 * then returns the response with the most recent battleTime. This maximises
 * the chance of surfacing the freshest available data across the full key pool.
 */

const ROYALE_PROXY_BASE = "https://proxy.royaleapi.dev/v1";
const INITIAL_INDEX = 0;

/**
 * Validation schema for the inbound payload.
 * Requires a player tag in Clash Royale format (e.g. "#PP80QG99").
 */
const PayloadSchema = v.object({
  playerTag: v.pipe(
    v.string(),
    v.minLength(3, "Player tag must be at least 3 characters."),
  ),
});

/**
 * Resolves the full key pool from the environment secret.
 *
 * @remarks
 * Mirrors the logic in muscle.ts getKeys() but operates post-syncVault,
 * so it always reflects the freshest set of keys available in CONFIG.
 */
function resolveKeyPool(): string[] {
  const rawKeyData = CONFIG.ROYALE_API_KEYS;
  if (!rawKeyData) return [];

  // [DECISION LOG] Keys are resolved lazily from the CONFIG (which is synced from Vault).
  // We handle both JSON array format and comma-separated string format for maximum flexibility.
  try {
    const parsedKeys: unknown = JSON.parse(rawKeyData);
    return Array.isArray(parsedKeys)
      ? parsedKeys.map((keyToken: string) => String(keyToken).trim()).filter(Boolean)
      : [String(parsedKeys).trim()];
  } catch {
    return rawKeyData.split(",").map((keyToken) => keyToken.trim()).filter(Boolean);
  }
}

/**
 * Fetches the battle log for a player using a single API key.
 * Returns null on any non-200 response or network error.
 *
 * @param encodedTag - URL-encoded player tag.
 * @param keyToken - The Royale API bearer token to use.
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
 * @param battleTime - Raw battleTime string from the Royale API.
 */
function parseBattleTime(battleTime: string): number {
  // Reformat from "20260614T093152.000Z" to "2026-06-14T09:31:52.000Z"
  const reformatted = battleTime.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    "$1-$2-$3T$4:$5:$6",
  );
  return new Date(reformatted).getTime();
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
 */
Deno.serve(async (req) => {
  await syncVault();

  return await clinicalServe({
    req,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "PLAYER_BATTLELOG_FETCH",
    componentId: "FETCH_PLAYER_BATTLELOG",
    schema: PayloadSchema,
    handler: async (payload, logAudit) => {
      const { playerTag } = payload;

      // Normalize tag: ensure it starts with '#' regardless of client encoding.
      const normalizedTag = playerTag.startsWith("#")
        ? playerTag
        : `#${playerTag}`;

      const encodedTag = encodeURIComponent(normalizedTag);
      const keyPool = resolveKeyPool();

      logAudit("BATTLELOG_FAN_OUT", "called", {
        playerTag: normalizedTag,
        keyCount: keyPool.length,
      });

      if (keyPool.length === INITIAL_INDEX) {
        throw new Error("No Royale API keys available in the key pool.");
      }

      // Fan out across ALL keys in parallel. Each key routes to a potentially
      // different proxy node with its own cache state. We collect every valid
      // response and then pick the one whose first battle is the most recent.
      const results = await Promise.all(
        keyPool.map((key) => fetchBattlelogWithKey(encodedTag, key)),
      );

      // [THREAT:] Silent failures in the fan-out pool could lead to stale or missing data.
      // [DECISION LOG] We filter for valid, non-empty battle logs and then pick the freshest
      // to ensure we surface the most recent data available across the full key pool.
      const validResults = results.filter(
        (result): result is v.InferOutput<typeof RoyaleBattleLogSchema> =>
          result !== null && result.length > INITIAL_INDEX,
      );

      logAudit("BATTLELOG_FAN_OUT", "completed", {
        playerTag: normalizedTag,
        responded: validResults.length,
        failed: keyPool.length - validResults.length,
      });

      if (validResults.length === INITIAL_INDEX) {
        throw new Error(
          `All ${keyPool.length} keys failed to return a valid battle log for ${normalizedTag}.`,
        );
      }

      // Select the result whose most recent battle is the freshest across all nodes.
      const freshestBattleLog = validResults.reduce((bestBattleLog, candidateBattleLog) => {
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
