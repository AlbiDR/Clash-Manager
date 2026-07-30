// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation, processBatch } from "../_shared/muscle.ts";
import {
  RoyaleLocationListSchema,
  RoyaleRankingListSchema,
  HarvestedPlayerSchema
} from "../_shared/schemas.ts";
import { AuditEntry } from "../_shared/types.ts";
import {
  PLAYER_LEADERBOARD_LIMIT,
  TARGET_HARVEST_FLOOR,
  MIN_LOCAL_POL_FLOOR,
  TOP_COUNTRY_IDS,
  MAX_HARVEST_EPOCHS,
  GLOBAL_LOCATION,
  DEFAULT_FALLBACK_ID,
  DEFAULT_FALLBACK_COUNTRY,
  INITIAL_INDEX
} from "../_shared/config.ts";

/**
 * L1 Core: Harvester Utility (@features)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Handles Royale API discovery queries and clanless player harvesting.
 * Encapsulates multi-tier discovery logic (Global, Local, and International).
 * ----------------------------------------------------------------------------
 */

// EPHEMERAL: intentionally resets on cold start.
// Top-level cache to minimize locations list roundtrips.
let cachedCountries: { id: number; name: string }[] | null = null;

/**
 * Executes a single rankings query against the Royale API proxy and filters for clanless players.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture (Layer 1 Core Engine) and Section V: Data Loader.
 * Reconciles structural API contracts with runtime types.
 *
 * Security Requirements:
 * - Accesses endpoint via fetchWithRotation.
 * - Handled under internal bearer tokens and anonymous key routing constraints to enforce Principle of Least Privilege.
 *
 * Failure Modes & Recovery:
 * - Downstream Proxy Failures: Throws if response is non-2xx.
 * - Structural Payload Drift: Throws if valibot validation against RoyaleRankingListSchema fails.
 *
 * @param endpointPath - The path parameter for the downstream proxy request.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns Filtered array of discovered clanless player records.
 * @throws {Error} If the HTTP request fails or the response fails schema verification.
 */
async function fetchRankings(
  endpointPath: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<v.InferOutput<typeof HarvestedPlayerSchema>[]> {
  logAudit("HARVEST_PLAYERS_FETCH", "called", { path: endpointPath });

  const playerRankingsResponse = await fetchWithRotation(endpointPath);
  if (!playerRankingsResponse.ok) {
    throw new Error(`Failed to fetch player rankings: ${playerRankingsResponse.status}`);
  }

  const rankingApiRaw: unknown = await playerRankingsResponse.json();
  const rankingIntegrity = v.safeParse(RoyaleRankingListSchema, rankingApiRaw);

  if (!rankingIntegrity.success) {
    // [THREAT ANNOTATION] Threat Vector: Structural Payload Drift.
    // If the remote proxy shifts its response structure, failing fast here prevents downstream state pollution
    // or parsing crashes in the core app.
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
 * INTERNATIONAL HARVESTER: Concurrent Discovery
 *
 * Shuffles country catalog and picks a batch of random regions to query in parallel.
 *
 * @remarks
 * Satisfies ADR Section III: Command-Query Separation and Section V: Performance (Lazy Loading & Bundling).
 * Implements dynamic geographic rotation to avoid querying static cohorts and circumvent API rate limits.
 *
 * Security & Authorization:
 * - Downstream calls to /locations must run through authorized proxy rotating bearer credentials.
 * - Does not expose internal credentials to client-facing surfaces.
 *
 * Potential Failure States:
 * - Location Directory Missing/Obsolete: Fallback path queries default location ID if locations response is offline.
 * - Schema Mismatch: Aborts catalog loading if locations payload fails RoyaleLocationListSchema checks.
 * - Downstream Cascading Timeouts: Handled by individual try/catch boundaries within concurrency-limited execution batch.
 *
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns Object containing the consolidated list of players and the compiled populated regions label string.
 * @throws {Error} If the root locations fetch fails or fails schema validation, and fallback catalog is unresolvable.
 */
export async function harvestInternationalPlayers(
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<{ items: v.InferOutput<typeof HarvestedPlayerSchema>[], region: string }> {
  logAudit("INTERNATIONAL_DETECTED", "run");

  if (!cachedCountries) {
    logAudit("COUNTRIES_DIRECTORY_FETCH", "called");
    const locationsResponse = await fetchWithRotation("/locations");
    if (!locationsResponse.ok) {
      throw new Error(`Failed to retrieve locations catalog: ${locationsResponse.status}`);
    }

    const locationsCatalogRaw: unknown = await locationsResponse.json();
    const locationsValidation = v.safeParse(RoyaleLocationListSchema, locationsCatalogRaw);

    if (!locationsValidation.success) {
      throw new Error("Locations catalog failed structural validation.");
    }

    const observedLocationsList = locationsValidation.output.items;

    cachedCountries = observedLocationsList
      .filter((locationCandidate) => locationCandidate.isCountry === true)
      .map((locationCandidate) => ({ id: locationCandidate.id, name: locationCandidate.name }));
  }

  if (!cachedCountries || cachedCountries.length === INITIAL_INDEX) {
    // [THREAT ANNOTATION] Threat Vector: Downstream Location catalog corruption.
    // If locations data is manipulated or missing, fallback to the default locale ensures continuity of operation.
    logAudit("COUNTRIES_CATALOG_EMPTY_FALLBACK", "run");
    const harvestResults = await harvestClanlessPlayers(String(DEFAULT_FALLBACK_ID), logAudit);
    return { items: harvestResults, region: DEFAULT_FALLBACK_COUNTRY };
  }

  // [DECISION LOG] Shuffle country catalog randomly prior to concurrent query allocation.
  // Prevents bias towards alphabetical countries and distributes query volume evenly across downstream regional proxies,
  // reducing the risk of rate-limiting or localized proxy bans.
  const shuffledCandidates = [...cachedCountries];
  for (let shuffleIndex = shuffledCandidates.length - 1; shuffleIndex > 0; shuffleIndex--) {
    const swapIndex = Math.floor(Math.random() * (shuffleIndex + 1));
    [shuffledCandidates[shuffleIndex], shuffledCandidates[swapIndex]] =
      [shuffledCandidates[swapIndex], shuffledCandidates[shuffleIndex]];
  }

  const targetCountriesCount = Math.min(MAX_HARVEST_EPOCHS, shuffledCandidates.length);
  const countriesToQuery = shuffledCandidates.slice(INITIAL_INDEX, targetCountriesCount);

  logAudit("CONCURRENT_BATCH_START", "run", { countries: countriesToQuery.map(countryCandidate => countryCandidate.name) });

  const batchTasks = countriesToQuery.map((countryCandidate) => {
    return async () => {
      try {
        const harvestResults = await harvestClanlessPlayers(String(countryCandidate.id), logAudit);
        return { country: countryCandidate.name, players: harvestResults };
      } catch (harvestError: unknown) {
        // [THREAT ANNOTATION] Threat Vector: Cascading concurrent timeout spikes.
        // Wrapping the parallel worker task in individual try-catch blocks isolates regional proxy down-times
        // and prevents a single bad country API endpoint from failing the entire international discovery batch.
        console.warn(`[HARVEST] Failed concurrent query for ${countryCandidate.name}:`, harvestError instanceof Error ? harvestError.message : String(harvestError));
        return { country: countryCandidate.name, players: [] };
      }
    };
  });

  const batchResults = await processBatch(batchTasks);
  const mergedPlayersMap = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
  const queriedRegions: string[] = [];

  for (const batchResult of batchResults) {
    if (batchResult.players.length > INITIAL_INDEX) {
      queriedRegions.push(batchResult.country);
      for (const harvestedPlayer of batchResult.players) {
        mergedPlayersMap.set(harvestedPlayer.tag, harvestedPlayer);
      }
    }
  }

  const mergedPlayers = Array.from(mergedPlayersMap.values());
  logAudit("CONCURRENT_BATCH_SUCCESS", "run", {
    total_harvested: mergedPlayers.length,
    populated_regions: queriedRegions,
  });

  const regionLabel = queriedRegions.length > INITIAL_INDEX
    ? `International (${queriedRegions.join(", ")})`
    : "International";

  return { items: mergedPlayers, region: regionLabel };
}

/**
 * PRIMARY HARVESTER: Discovery Engine
 *
 * Queries worldwide Path of Legends endpoints or country-specific indices to locate unaffiliated players.
 *
 * @remarks
 * Satisfies ADR Section I: Foundation of "Clinical" Logic (Adaptive Formulas) and Section IV: Deep Delegation Strategy.
 * Ensures optimal player retrieval across both global and highly specific geographic pools.
 *
 * Security Controls:
 * - Inherits JWT verification and bearer authorization validated by public RPC gateway.
 *
 * Failure Modes & Recovery:
 * - Subsystem Downstream Failure: Cascading try/catch blocks guard regional queries and fall back gracefully to empty arrays.
 * - Global Timeout Spikes: If global Path of Legends query fails entirely, throws to allow higher-level control surfaces to recover.
 *
 * @param location - "global" or a numeric location identifier as a string.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns Consolidated array of discovered clanless player objects.
 * @throws {Error} If the global Path of Legends fetch or the local fallback query fails.
 */
export async function harvestClanlessPlayers(
  location: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<v.InferOutput<typeof HarvestedPlayerSchema>[]> {
  if (location === GLOBAL_LOCATION) {
    try {
      const polPath = `/locations/global/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const polResults = await fetchRankings(polPath, logAudit);

      if (polResults.length >= TARGET_HARVEST_FLOOR) {
        return polResults;
      }

      const aggregatedResults = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
      for (const harvestedItem of polResults) {
        aggregatedResults.set(harvestedItem.tag, harvestedItem);
      }

      // [DECISION LOG] Fall back to top country indices if global pool yields fewer than the target floor.
      // Resolves the sparsity of high-ranking clanless players globally by fetching from densely populated local regions.
      for (const countryId of TOP_COUNTRY_IDS) {
        if (aggregatedResults.size >= TARGET_HARVEST_FLOOR) break;
        try {
          const countryPolPath = `/locations/${countryId}/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
          const countryResults = await fetchRankings(countryPolPath, logAudit);
          for (const harvestedItem of countryResults) {
            aggregatedResults.set(harvestedItem.tag, harvestedItem);
          }
        } catch (countryError: unknown) {
          // [THREAT ANNOTATION] Threat Vector: Downstream Regional API denial of service.
          // Guarding individual country fetches ensures local API offline states do not abort the active discovery loop.
          console.warn(`[HARVEST] Failed country PoL ${countryId}:`, countryError instanceof Error ? countryError.message : String(countryError));
        }
      }

      return Array.from(aggregatedResults.values());
    } catch (globalPolError: unknown) {
      console.error("[HARVEST] Global Path of Legends query failed:", globalPolError instanceof Error ? globalPolError.message : String(globalPolError));
      throw globalPolError;
    }
  } else {
    try {
      const polPath = `/locations/${location}/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const polResults = await fetchRankings(polPath, logAudit);

      if (polResults.length >= MIN_LOCAL_POL_FLOOR) {
        return polResults;
      }

      const rankingsPath = `/locations/${location}/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
      const rankingsResults = await fetchRankings(rankingsPath, logAudit);

      const mergedResults = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
      for (const harvestedItem of polResults) mergedResults.set(harvestedItem.tag, harvestedItem);
      for (const harvestedItem of rankingsResults) mergedResults.set(harvestedItem.tag, harvestedItem);

      return Array.from(mergedResults.values());
    } catch (localError: unknown) {
      console.error(`[HARVEST] Local harvest failed for ${location}:`, localError instanceof Error ? localError.message : String(localError));
      throw localError;
    }
  }
}
