// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { fetchWithRotation, processBatch } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import {
  RoyaleClanSchema,
  RoyaleLocationListSchema
} from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";

/**
 * Edge Function: query-royale-api
 * L5 Control Layer: Secure proxy for client-side Clash Royale API queries.
 *
 * Implements robust clanless player harvesting via active clan battle log scanning.
 */

const PayloadSchema = v.object({
  endpoint: v.picklist(["local", "global"]),
});

const LOCATION_ID_INTERNATIONAL = 57000101;
const DEFAULT_FALLBACK_COUNTRY = "United States";
const DEFAULT_FALLBACK_ID = 57000120;

const TOP_CLANS_LIMIT = 3;
const TOP_MEMBERS_PER_CLAN_LIMIT = 3;
const INITIAL_ARRAY_INDEX = 0;

// EPHEMERAL: intentionally resets on cold start.
// Top-level cache to minimize locations list roundtrips.
let cachedCountries: { id: number; name: string }[] | null = null;

/**
 * Discovers active, clanless players by fetching top clans in a location,
 * getting their active members, and extracting clanless opponents from their battle logs.
 */
async function harvestClanlessPlayers(locationId: string, logAudit: any): Promise<any[]> {
  const clansPath = `/locations/${locationId}/rankings/clans?limit=${TOP_CLANS_LIMIT}`;
  logAudit("HARVEST_CLANS_FETCH", "called", { path: clansPath });
  const clansRes = await fetchWithRotation(clansPath);
  if (!clansRes.ok) {
    throw new Error(`Failed to fetch top clans: ${clansRes.status}`);
  }
  
  const clansData = await clansRes.json();
  const clans = clansData.items || [];
  if (clans.length === INITIAL_ARRAY_INDEX) {
    return [];
  }
  
  // Fetch clan details to get members
  const memberFetchTasks = clans.map((clan: any) => {
    return async () => {
      const encodedTag = encodeURIComponent(clan.tag);
      const clanRes = await fetchWithRotation(`/clans/${encodedTag}`);
      if (!clanRes.ok) {
        console.warn(`Failed to fetch clan detail for ${clan.tag}: ${clanRes.status}`);
        return [];
      }
      const clanData = await clanRes.json();
      return clanData.memberList || [];
    };
  });
  
  // Process member fetches in parallel
  const clanMembersList = await processBatch(memberFetchTasks);
  
  // Collect target players (top members per clan)
  const targetPlayerTags: string[] = [];
  for (const members of clanMembersList) {
    const activeMembers = members.slice(INITIAL_ARRAY_INDEX, TOP_MEMBERS_PER_CLAN_LIMIT);
    for (const member of activeMembers) {
      if (member.tag) {
        targetPlayerTags.push(member.tag);
      }
    }
  }
  
  if (targetPlayerTags.length === INITIAL_ARRAY_INDEX) {
    return [];
  }
  
  // Fetch battle logs for target players
  const battlelogTasks = targetPlayerTags.map((playerTag) => {
    return async () => {
      const encodedPlayerTag = encodeURIComponent(playerTag);
      const logRes = await fetchWithRotation(`/players/${encodedPlayerTag}/battlelog`);
      if (!logRes.ok) {
        console.warn(`Failed to fetch battlelog for ${playerTag}: ${logRes.status}`);
        return [];
      }
      return await logRes.json();
    };
  });
  
  const battlelogs = await processBatch(battlelogTasks);
  
  // Extract clanless opponents
  const clanlessMap = new Map<string, any>();
  for (const log of battlelogs) {
    if (!Array.isArray(log)) continue;
    for (const battle of log) {
      const opponents = battle.opponent || [];
      for (const opponent of opponents) {
        if (opponent.tag && !opponent.clan) {
          clanlessMap.set(opponent.tag, {
            tag: opponent.tag,
            name: opponent.name,
            clan: null
          });
        }
      }
    }
  }
  
  return Array.from(clanlessMap.values());
}

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
        const items = await harvestClanlessPlayers("global", logAudit);
        return { 
          items, 
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
      const items = await harvestClanlessPlayers(String(targetLocationId), logAudit);

      return { 
        items, 
        region: targetLocationName
      };
    },
  });
});
