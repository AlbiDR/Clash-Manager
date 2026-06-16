// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
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
 * Implements robust clanless player harvesting via direct player rankings.
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

const LOCATION_ID_INTERNATIONAL = 57000101;
const DEFAULT_FALLBACK_COUNTRY = "United States";
const DEFAULT_FALLBACK_ID = 57000120;

const PLAYER_LEADERBOARD_LIMIT = 1000;
const INITIAL_ARRAY_INDEX = 0;

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
 * Implements a direct player rankings harvesting pipeline:
 * 1. Rankings: Fetches top players in the target region.
 * 2. Filters: Filters out players who are currently in a clan.
 *
 * @param locationId - The Royale API location ID or 'global'.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns An array of discovered clanless player objects.
 */
async function harvestClanlessPlayers(
  locationId: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<unknown[]> {
  const playersPath = `/locations/${locationId}/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
  logAudit("HARVEST_PLAYERS_FETCH", "called", { path: playersPath });
  const playerRankingsResponse = await fetchWithRotation(playersPath);
  if (!playerRankingsResponse.ok) {
    throw new Error(`Failed to fetch player rankings: ${playerRankingsResponse.status}`);
  }
  
  const rawPlayerRankingPayload: unknown = await playerRankingsResponse.json();

  // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
  // [THREAT:] Prevents runtime crashes from unexpected Royale API structure changes in rankings.
  const rankingValidation = v.safeParse(RoyaleRankingListSchema, rawPlayerRankingPayload);

  logAudit("HARVEST_PLAYERS_INTEGRITY", "integrity_checked", {
    passed: rankingValidation.success,
    details: rankingValidation.success ? "Player rankings validated" : "Malformed player rankings payload"
  });

  if (!rankingValidation.success) {
    throw new Error("Player rankings payload failed structural validation.");
  }

  const rankingItems = rankingValidation.output.items;
  if (rankingItems.length === INITIAL_ARRAY_INDEX) {
    return [];
  }

  // [DECISION LOG] CLANLESS FILTERING
  // Rationale: Only players without a clan are viable recruitment targets.
  // We filter these out before they ever reach the selection store to
  // minimize noise in the Blitz recruitment loop.
  const clanlessPlayers = rankingItems.filter((player) => {
    return !player.clan;
  });

  return clanlessPlayers.map((player) => ({
    tag: typeof player.tag === "string" ? player.tag : String(player.tag ?? ""),
    name: typeof player.name === "string" ? player.name : String(player.name ?? ""),
    clan: null
  }));
}

/**
 * MAIN HANDLER: query-royale-api
 *
 * @remarks
 * Satisfies ADR Section II: Control Layer.
 * Orchestrates the secure proxying of Royale API discovery queries.
 */
Deno.serve(async (req) => {
  await syncVault();

  return await clinicalServe({
    req,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "ROYALE_API_QUERY",
    componentId: "ROYALE_API_PROXY",
    schema: PayloadSchema,
    handler: async (payload, logAudit) => {
      const mode = payload.endpoint;
      logAudit("HARVEST_START", "called", { mode });

      if (mode === "global") {
        logAudit("GLOBAL_HARVEST", "called");
        const harvestResults = await harvestClanlessPlayers("global", logAudit);
        return { 
          items: harvestResults,
          region: "Global"
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

      const rawClanProfile: unknown = await clanResponse.json();
      const clanProfileValidation = v.safeParse(RoyaleClanSchema, rawClanProfile);

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

          const rawLocationsPayload: unknown = await locationsResponse.json();
          const locationsValidation = v.safeParse(RoyaleLocationListSchema, rawLocationsPayload);

          if (!locationsValidation.success) {
            throw new Error("Locations catalog failed structural validation.");
          }

          const rawLocationsList = locationsValidation.output.items;
          
          cachedCountries = rawLocationsList
            .filter((locationCandidate) => locationCandidate.isCountry === true)
            .map((locationCandidate) => ({ id: locationCandidate.id, name: locationCandidate.name }));
        }

        if (cachedCountries && cachedCountries.length > INITIAL_ARRAY_INDEX) {
          const randomIndex = Math.floor(Math.random() * cachedCountries.length);
          const selectedCountry = cachedCountries[randomIndex];
          targetLocationId = selectedCountry.id;
          targetLocationName = selectedCountry.name;
          logAudit("ROTATION_SELECT", "run", { selected: targetLocationName });
        } else {
          targetLocationId = DEFAULT_FALLBACK_ID;
          targetLocationName = DEFAULT_FALLBACK_COUNTRY;
        }
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
