// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation } from "../_shared/muscle.ts";
import {
  RoyaleRankingListSchema,
  HarvestedPlayerSchema
} from "../_shared/schemas.ts";
import { AuditEntry } from "../_shared/types.ts";
import {
  TOP_COUNTRY_IDS,
  TARGET_HARVEST_FLOOR,
  MIN_LOCAL_POL_FLOOR
} from "../_shared/config.ts";

/**
 * L1 Core: Harvester Utility (@shared/harvester)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Executes competitive ecosystem scanning to identify clanless
 * players. Logic decoupled from the proxy orchestrator to satisfy SRP.
 * ============================================================================
 */

const PLAYER_LEADERBOARD_LIMIT = 1000;

/**
 * Executes a single rankings query against the Royale API proxy and filters for clanless players.
 *
 * @remarks
 * [DECISION LOG] Ensuring strict validation of harvested player data to maintain structural integrity.
 *
 * @param endpointPath - The Royale API endpoint to query (e.g., /locations/global/pathoflegend/players).
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns A filtered list of clanless players matching the internal HarvestedPlayerSchema.
 *
 * @throws Error if the API response is not OK or fails structural validation.
 */
export async function fetchRankings(
  endpointPath: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<v.InferOutput<typeof HarvestedPlayerSchema>[]> {
  logAudit("HARVEST_PLAYERS_FETCH", "called", { path: endpointPath });

  // [THREAT:] QUOTA EXHAUSTION / RATE LIMITING: Excessive calls to the Royale API
  // can result in temporary IP bans or token exhaustion.
  // [DECISION LOG] Utilizing fetchWithRotation (muscle.ts) to distribute requests
  // across the available key pool, ensuring high availability and quota resilience.
  const playerRankingsResponse = await fetchWithRotation(endpointPath);
  if (!playerRankingsResponse.ok) {
    throw new Error(`Failed to fetch player rankings: ${playerRankingsResponse.status}`);
  }

  const rankingApiRaw: unknown = await playerRankingsResponse.json();

  // [GUARD] VALIDATION BOUNDARY: External API data must be validated.
  // [THREAT:] Prevents runtime crashes from unexpected Royale API payload changes.
  const rankingIntegrity = v.safeParse(RoyaleRankingListSchema, rankingApiRaw);

  if (!rankingIntegrity.success) {
    throw new Error("Player rankings payload failed structural validation.");
  }

  const observedRankingItems = rankingIntegrity.output.items;

  // Filter for clanless players
  const clanlessPlayers = observedRankingItems.filter((rankingItem) => {
    const rankingClan = rankingItem.clan;
    return !rankingClan || !rankingClan.tag;
  });

  return clanlessPlayers.map((rankingItem) => ({
    tag: rankingItem.tag,
    name: rankingItem.name,
    clan: null
  }));
}

/**
 * HARVESTER: Discovery Engine
 *
 * Scans the competitive ecosystem to identify active players currently
 * unaffiliated with any clan.
 *
 * @remarks
 * Satisfies ADR Section V: Edge Functions - Data Ingestion.
 *
 * [DECISION LOG] MULTI-TIER HARVESTING STRATEGY:
 * Implements a resilient multi-tier harvesting strategy to handle season resets:
 * 1. Global: Queries the worldwide Path of Legends leaderboard first. If unpopulated
 *    (e.g. at the start of a season), falls back to querying and merging Trophy Road
 *    rankings across major countries until the floor of 80 players is met.
 * 2. Local: Queries the local Path of Legends leaderboard first. If empty or sparse,
 *    falls back to the local Trophy Road rankings to guarantee results year-round.
 *
 * @param location - "global" or a numeric Royale API location ID as a string.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns An array of discovered clanless player objects.
 *
 * @throws Re-throws errors from `fetchRankings` if both primary and fallback tiers fail.
 */
export async function harvestClanlessPlayers(
  location: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<v.InferOutput<typeof HarvestedPlayerSchema>[]> {
  if (location === "global") {
    try {
      // Tier 1: Global Path of Legends
      const polPath = `/locations/global/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const polResults = await fetchRankings(polPath, logAudit);

      if (polResults.length >= TARGET_HARVEST_FLOOR) {
        return polResults;
      }

      // Tier 2: Fall back to country-specific Path of Legends leaderboards.
      // NOTE: /rankings/players is retired and returns empty for all locations.
      // Country PoL leaderboards are active and include clan data, so the
      // clanless filter works correctly here.
      const aggregatedResults = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
      for (const harvestedItem of polResults) {
        aggregatedResults.set(harvestedItem.tag, harvestedItem);
      }

      for (const countryId of TOP_COUNTRY_IDS) {
        if (aggregatedResults.size >= TARGET_HARVEST_FLOOR) break;
        try {
          const countryPolPath = `/locations/${countryId}/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
          const countryResults = await fetchRankings(countryPolPath, logAudit);
          for (const harvestedItem of countryResults) {
            aggregatedResults.set(harvestedItem.tag, harvestedItem);
          }
        } catch (countryError) {
          console.warn(`[HARVEST] Failed country PoL ${countryId}:`, countryError instanceof Error ? countryError.message : String(countryError));
        }
      }

      return Array.from(aggregatedResults.values());
    } catch (globalPolError) {
      console.error("[HARVEST] Global Path of Legends query failed:", globalPolError);
      throw globalPolError;
    }
  } else {
    // Local / Country Harvest
    try {
      // Tier 1: Local Path of Legends
      const polPath = `/locations/${location}/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const polResults = await fetchRankings(polPath, logAudit);

      if (polResults.length >= MIN_LOCAL_POL_FLOOR) {
        return polResults;
      }

      // Tier 2: Local Trophy Road rankings fallback
      const rankingsPath = `/locations/${location}/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const rankingsResults = await fetchRankings(rankingsPath, logAudit);

      const mergedResults = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
      for (const harvestedItem of polResults) mergedResults.set(harvestedItem.tag, harvestedItem);
      for (const harvestedItem of rankingsResults) mergedResults.set(harvestedItem.tag, harvestedItem);

      return Array.from(mergedResults.values());
    } catch (localError) {
      console.error(`[HARVEST] Local harvest failed for ${location}:`, localError);
      throw localError;
    }
  }
}
