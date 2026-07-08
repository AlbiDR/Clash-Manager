// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import {
  RoyaleClanSchema,
  RoyaleLocationListSchema,
  RoyaleRankingListSchema
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

// [DECISION LOG] Maximum number of country epochs attempted during Local harvest
// when the clan is registered as International. Each epoch probes a unique country
// from the shuffled catalog before yielding an empty result.
// Raised from 15 to 30: the /rankings/players endpoint has better country coverage
// than the previous /pathoflegend/players endpoint, but many micro-territories
// still return 0 ranked players. A larger bound increases the probability of
// hitting a populated leaderboard within a single request.
const MAX_HARVEST_EPOCHS = 30;

// EPHEMERAL: intentionally resets on cold start.
// Top-level cache to minimize locations list roundtrips.
let cachedCountries: { id: number; name: string }[] | null = null;

/**
 * HARVESTER: Discovery Engine
 *
 * Scans the competitive ecosystem to identify active players currently
 * unaffiliated with any clan.
 *
 * @remarks
 * Satisfies ADR Section V: Edge Functions - Data Ingestion.
 *
 * Uses the live Path of Legends rankings endpoint:
 *   `/locations/{location}/pathoflegend/players`
 *
 * [DECISION LOG] This is the ONLY player leaderboard the official Clash Royale
 * API still serves. The legacy trophy ladder (`/rankings/players`) was retired
 * with the 2025 Trophy Road rework and now returns an empty list for every
 * location. The season-scoped form (`/pathoflegend/{season}/rankings/players`)
 * exists only for `global` and only for *completed* seasons, so it cannot
 * surface the live board. The season-less form used here returns the current,
 * in-progress standings (verified byte-for-byte against RoyaleAPI's public
 * leaderboard) for both `global` and individual country IDs — up to 1000 ranked
 * entries with the clan embedded as an object.
 *
 * @param location - "global" or a numeric Royale API location ID as a string.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns An array of discovered clanless player objects.
 */
async function harvestClanlessPlayers(
  location: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<unknown[]> {
  const playersPath = `/locations/${location}/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
  logAudit("HARVEST_PLAYERS_FETCH", "called", { path: playersPath });
  const playerRankingsResponse = await fetchWithRotation(playersPath);
  if (!playerRankingsResponse.ok) {
    throw new Error(`Failed to fetch Path of Legends rankings: ${playerRankingsResponse.status}`);
  }
  
  const rankingApiRaw: unknown = await playerRankingsResponse.json();

  // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
  // [THREAT:] Prevents runtime crashes from unexpected Royale API structure changes in rankings.
  // [DECISION LOG] Transitioned to RoyaleRankingListSchema for strict structural enforcement.
  const rankingIntegrity = v.safeParse(RoyaleRankingListSchema, rankingApiRaw);

  logAudit("HARVEST_PLAYERS_INTEGRITY", "integrity_checked", {
    passed: rankingIntegrity.success,
    details: rankingIntegrity.success ? "Player rankings validated" : "Malformed player rankings payload"
  });

  if (!rankingIntegrity.success) {
    throw new Error("Player rankings payload failed structural validation.");
  }

  const observedRankingItems = rankingIntegrity.output.items;

  // [DIAGNOSTIC] Surfaces the raw API item count in edge function logs to allow
  // distinguishing between an empty API response and a fully-filtered result set.
  console.log(`[HARVEST] Raw players received from API: ${observedRankingItems.length}`);

  if (observedRankingItems.length === INITIAL_ARRAY_INDEX) {
    return [];
  }

  // Temporarily bypass filter for diagnostic inspection of Royale API payload
  return observedRankingItems.slice(0, 15).map((rankingItem) => ({
    tag: rankingItem.tag,
    name: rankingItem.name,
    clan: rankingItem.clan || null
  }));
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

        // [DECISION LOG] SHUFFLED EPOCH LOOP
        // Rationale: A single random pick almost always lands on a micro-territory
        // (e.g. Antarctica, Anguilla) with zero Path of Legends participation.
        // We perform a Fisher-Yates shuffle of the full catalog so that every
        // country has an equal probability of being probed, then iterate up to
        // MAX_HARVEST_EPOCHS unique countries, returning on the first non-empty result.
        // This guarantees fair distribution across all locations while bounding
        // the maximum number of API round-trips per request.
        const shuffledCandidates = [...cachedCountries];
        for (let shuffleIndex = shuffledCandidates.length - 1; shuffleIndex > 0; shuffleIndex--) {
          const swapIndex = Math.floor(Math.random() * (shuffleIndex + 1));
          [shuffledCandidates[shuffleIndex], shuffledCandidates[swapIndex]] =
            [shuffledCandidates[swapIndex], shuffledCandidates[shuffleIndex]];
        }

        const epochLimit = Math.min(MAX_HARVEST_EPOCHS, shuffledCandidates.length);

        for (let epoch = INITIAL_ARRAY_INDEX; epoch < epochLimit; epoch++) {
          const epochCountry = shuffledCandidates[epoch];
          logAudit("EPOCH_SELECT", "run", { epoch, country: epochCountry.name });

          const epochResults = await harvestClanlessPlayers(String(epochCountry.id), logAudit);

          if (epochResults.length > INITIAL_ARRAY_INDEX) {
            logAudit("EPOCH_SUCCESS", "run", { epoch, country: epochCountry.name, count: epochResults.length });
            return { items: epochResults, region: epochCountry.name };
          }

          logAudit("EPOCH_EMPTY", "run", { epoch, country: epochCountry.name });
        }

        // All epochs exhausted with no clanless players found.
        logAudit("EPOCH_EXHAUSTED", "run", { epochs_tried: epochLimit });
        return { items: [], region: "International" };
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
