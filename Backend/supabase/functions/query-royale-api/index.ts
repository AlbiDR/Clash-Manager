// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation, processBatch } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import {
  RoyaleClanSchema,
  RoyaleLocationListSchema,
  RoyaleRankingListSchema,
  HarvestedPlayerSchema
} from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { AuditEntry } from "../_shared/types.ts";

/**
 * Edge Function: query-royale-api
 * L5 Control Layer: Secure proxy for client-side Clash Royale API queries.
 *
 * Implements robust clanless player harvesting via Path of Legends rankings.
 */

/**
 * Validation schema for the inbound Royale API query payload.
 * @remarks
 * Restricts queries to either 'local' (based on configured clan region)
 * or 'global' (international rankings).
 */
const PayloadSchema = v.object({
  endpoint: v.picklist(["local", "global"]),
});

// The Royale API accepts the literal "global" as a location for the
// worldwide Path of Legends leaderboard; countries use their numeric ID.
const GLOBAL_LOCATION = "global";
const LOCATION_ID_INTERNATIONAL = 57000101;
const DEFAULT_FALLBACK_COUNTRY = "United States";
const DEFAULT_FALLBACK_ID = 57000120;

const PLAYER_LEADERBOARD_LIMIT = 1000;
const INITIAL_ARRAY_INDEX = 0;

// [DECISION LOG] Maximum number of country searches attempted concurrently during
// Local harvest when the clan is registered as International.
// Reduced to 15: We query 15 random countries concurrently in a single batch to
// guarantee fast responses under 3 seconds while maximizing geographic variety.
const MAX_HARVEST_EPOCHS = 15;

// Major country IDs for global harvest fallback during early-season PoL unpopulation
const TOP_COUNTRY_IDS = [
  "57000120", // United States
  "57000095", // Spain
  "57000038", // Brazil
  "57000117", // Japan
  "57000085", // France
  "57000091", // Germany
];

// Target target floors to satisfy SSOT and prevent magic numbers
const TARGET_HARVEST_FLOOR = 80;
const MIN_LOCAL_POL_FLOOR = 10;

// EPHEMERAL: intentionally resets on cold start.
// Top-level cache to minimize locations list roundtrips.
let cachedCountries: { id: number; name: string }[] | null = null;

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
async function fetchRankings(
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
async function harvestClanlessPlayers(
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
      // [DECISION LOG] Excising 'any' from the aggregation map to ensure type safety.
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

/**
 * MAIN HANDLER: query-royale-api
 *
 * @remarks
 * Satisfies ADR Section II: Control Layer.
 * Orchestrates the secure proxying of Royale API discovery queries.
 */
Deno.serve(async (request) => {
  await syncVault();

  return await clinicalServe({
    req: request,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "ROYALE_API_QUERY",
    componentId: "ROYALE_API_PROXY",
    schema: PayloadSchema,
    handler: async (queryPayload, logAudit) => {
      const harvestMode = queryPayload.endpoint;
      logAudit("HARVEST_START", "called", { mode: harvestMode });

      if (harvestMode === "global") {
        logAudit("GLOBAL_HARVEST", "called", { location: GLOBAL_LOCATION });
        // [DECISION LOG] "global" is a first-class location on the Path of Legends
        // rankings endpoint, returning the live worldwide top 1000 in one request.
        const harvestResults = await harvestClanlessPlayers(GLOBAL_LOCATION, logAudit);
        return {
          items: harvestResults,
          region: "Global",
        };
      }


      // Local Harvest Resolution
      if (!CONFIG.CLAN_TAG) {
        throw new Error("Missing CLAN_TAG configuration on backend server.");
      }

      const encodedClan = encodeURIComponent(CONFIG.CLAN_TAG);
      const clanPath = `/clans/${encodedClan}`;
      logAudit("LOCAL_HARVEST_CLAN_FETCH", "called", { path: clanPath });
      const clanResponse = await fetchWithRotation(clanPath);
      if (!clanResponse.ok) {
        throw new Error(`Failed to retrieve clan details to identify region: ${clanResponse.status}`);
      }

      const clanProfileRaw: unknown = await clanResponse.json();
      const clanProfileValidation = v.safeParse(RoyaleClanSchema, clanProfileRaw);

      if (!clanProfileValidation.success) {
        throw new Error("Clan profile payload failed structural validation.");
      }

      const targetClanProfile = clanProfileValidation.output;
      const location = targetClanProfile.location;
      if (!location) {
        throw new Error("Clan profile does not contain a registered location.");
      }

      let targetLocationId = location.id;
      let targetLocationName = location.name;

      // Handle International location rotation
      const isInternational = targetLocationId === LOCATION_ID_INTERNATIONAL ||
                              targetLocationName === "International" ||
                              !location.isCountry;

      if (isInternational) {
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

        if (!cachedCountries || cachedCountries.length === INITIAL_ARRAY_INDEX) {
          // Catastrophic fallback: locations catalog is empty or unavailable.
          logAudit("COUNTRIES_CATALOG_EMPTY_FALLBACK", "run");
          const harvestResults = await harvestClanlessPlayers(String(DEFAULT_FALLBACK_ID), logAudit);
          return { items: harvestResults, region: DEFAULT_FALLBACK_COUNTRY };
        }

        // [DECISION LOG] CONCURRENT BATCH HARVEST
        // Rationale: Sequential looping causes massive delays when hitting multiple empty countries.
        // Instead, we shuffle the catalog, pick the top 15 random countries, and query them in parallel
        // using processBatch. This keeps the execution time bounded to a single round-trip (~1-3 seconds).
        const shuffledCandidates = [...cachedCountries];
        for (let shuffleIndex = shuffledCandidates.length - 1; shuffleIndex > 0; shuffleIndex--) {
          const swapIndex = Math.floor(Math.random() * (shuffleIndex + 1));
          [shuffledCandidates[shuffleIndex], shuffledCandidates[swapIndex]] =
            [shuffledCandidates[swapIndex], shuffledCandidates[shuffleIndex]];
        }

        const targetCountriesCount = Math.min(MAX_HARVEST_EPOCHS, shuffledCandidates.length);
        const countriesToQuery = shuffledCandidates.slice(INITIAL_ARRAY_INDEX, targetCountriesCount);

        logAudit("CONCURRENT_BATCH_START", "run", { countries: countriesToQuery.map(countryCandidate => countryCandidate.name) });

        const batchTasks = countriesToQuery.map((countryCandidate) => {
          return async () => {
            try {
              const harvestResults = await harvestClanlessPlayers(String(countryCandidate.id), logAudit);
              return { country: countryCandidate.name, players: harvestResults };
            } catch (harvestError) {
              console.warn(`[HARVEST] Failed concurrent query for ${countryCandidate.name}:`, harvestError);
              return { country: countryCandidate.name, players: [] };
            }
          };
        });

        const batchResults = await processBatch(batchTasks);

        // [DECISION LOG] Excising 'any' from the merged players map to satisfy CleanStack architecture.
        const mergedPlayersMap = new Map<string, v.InferOutput<typeof HarvestedPlayerSchema>>();
        const queriedRegions: string[] = [];

        for (const batchResult of batchResults) {
          if (batchResult.players.length > INITIAL_ARRAY_INDEX) {
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

        // Return the merged list. Region string displays populated countries found.
        const regionLabel = queriedRegions.length > INITIAL_ARRAY_INDEX 
          ? `International (${queriedRegions.join(", ")})` 
          : "International";

        return { items: mergedPlayers, region: regionLabel };
      }

      logAudit("LOCAL_HARVEST_CLANLESS_DISCOVERY", "called", { country: targetLocationName });
      const harvestResults = await harvestClanlessPlayers(String(targetLocationId), logAudit);

      return {
        items: harvestResults,
        region: targetLocationName
      };
    },
  });
});
