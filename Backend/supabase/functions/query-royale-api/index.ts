// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation, processBatch } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import {
  RoyaleClanSchema,
  RoyaleLocationListSchema,
  HarvestedPlayerSchema
} from "../_shared/schemas.ts";
import { MAX_HARVEST_EPOCHS } from "../_shared/config.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { harvestClanlessPlayers } from "./harvester.ts";

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

const INITIAL_ARRAY_INDEX = 0;

// EPHEMERAL: intentionally resets on cold start.
// Top-level cache to minimize locations list roundtrips.
let cachedCountries: { id: number; name: string }[] | null = null;

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
