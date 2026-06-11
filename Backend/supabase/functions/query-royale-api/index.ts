// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { fetchWithRotation } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";

/**
 * Edge Function: query-royale-api
 * L5 Control Layer: Secure proxy for client-side Clash Royale API queries.
 *
 * Implements strict whitelisting and dynamic fallback routing for International clans.
 */

const PayloadSchema = v.object({
  endpoint: v.picklist(["local", "global"]),
});

const LOCATION_ID_INTERNATIONAL = 57000101;
const DEFAULT_FALLBACK_COUNTRY = "United States";
const DEFAULT_FALLBACK_ID = 57000120;

// Ephemeral top-level cache to minimize locations list roundtrips
let cachedCountries: { id: number; name: string }[] | null = null;

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
        const globalPath = "/locations/global/rankings/players";
        logAudit("GLOBAL_HARVEST", "called", { path: globalPath });
        const response = await fetchWithRotation(globalPath);
        if (!response.ok) {
          throw new Error(`Royale API Global rankings failed: ${response.status}`);
        }
        const results = await response.json();
        return { items: results.items || [], region: "Global" };
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

      const clanDetails = await clanResponse.json();
      const location = clanDetails.location;
      if (!location) {
        throw new Error("Clan profile does not contain a registered location.");
      }

      let targetLocationId = location.id;
      let targetLocationName = location.name;

      // Handle International location rotation
      const isInternational = targetLocationId === LOCATION_ID_INTERNATIONAL || targetLocationName === "International" || !location.isCountry;
      if (isInternational) {
        logAudit("INTERNATIONAL_DETECTED", "run");

        if (!cachedCountries) {
          logAudit("COUNTRIES_DIRECTORY_FETCH", "called");
          const locationsResponse = await fetchWithRotation("/locations");
          if (!locationsResponse.ok) {
            throw new Error(`Failed to retrieve locations catalog: ${locationsResponse.status}`);
          }
          const locationsData = await locationsResponse.json();
          const list = locationsData.items || [];
          
          cachedCountries = list
            .filter((item: any) => item.isCountry === true)
            .map((item: any) => ({ id: item.id, name: item.name }));
        }

        if (cachedCountries && cachedCountries.length > 0) {
          const randomIndex = Math.floor(Math.random() * cachedCountries.length);
          const selectedCountry = cachedCountries[randomIndex];
          targetLocationId = selectedCountry.id;
          targetLocationName = selectedCountry.name;
          logAudit("ROTATION_SELECT", "run", { selected: targetLocationName });
        } else {
          // Fallback to safety country if catalog is completely empty
          targetLocationId = DEFAULT_FALLBACK_ID;
          targetLocationName = DEFAULT_FALLBACK_COUNTRY;
        }
      }

      const localRankingsPath = `/locations/${targetLocationId}/rankings/players`;
      logAudit("LOCAL_HARVEST_RANKINGS_FETCH", "called", { path: localRankingsPath, country: targetLocationName });
      const localResponse = await fetchWithRotation(localRankingsPath);
      if (!localResponse.ok) {
        throw new Error(`Royale API Local rankings failed for region ${targetLocationName}: ${localResponse.status}`);
      }

      const localResults = await localResponse.json();
      return { items: localResults.items || [], region: targetLocationName };
    },
  });
});
