// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { fetchWithRotation, processBatch } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import {
  RoyaleClanSchema,
  RoyaleLocationListSchema,
  RoyaleClanRankingListSchema,
  RoyaleClanDetailSchema,
  RoyaleBattleLogSchema
} from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { AuditEntry } from "../_shared/types.ts";

/**
 * Edge Function: query-royale-api
 * L5 Control Layer: Secure proxy for client-side Clash Royale API queries.
 *
 * Implements robust clanless player harvesting via active clan battle log scanning.
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

const TOP_CLANS_LIMIT = 3;
const TOP_MEMBERS_PER_CLAN_LIMIT = 3;
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
 * Implements a three-tier discovery pipeline:
 * 1. Rankings: Fetches top clans in the target region.
 * 2. Membership: Inspects top members of those clans.
 * 3. Battle Logs: Scans the combat history of those members to find "Shadow Leads"
 *    (clanless opponents).
 *
 * @param locationId - The Royale API location ID or 'global'.
 * @param logAudit - Telemetry callback for clinical auditing.
 * @returns An array of discovered clanless player objects.
 */
async function harvestClanlessPlayers(
  locationId: string,
  logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<unknown[]> {
  const clansPath = `/locations/${locationId}/rankings/clans?limit=${TOP_CLANS_LIMIT}`;
  logAudit("HARVEST_CLANS_FETCH", "called", { path: clansPath });
  const clanRankingsResponse = await fetchWithRotation(clansPath);
  if (!clanRankingsResponse.ok) {
    throw new Error(`Failed to fetch top clans: ${clanRankingsResponse.status}`);
  }
  
  const rawClanRankingPayload: unknown = await clanRankingsResponse.json();

  // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
  // [THREAT:] Prevents runtime crashes from unexpected Royale API structure changes in rankings.
  const rankingValidation = v.safeParse(RoyaleClanRankingListSchema, rawClanRankingPayload);

  logAudit("HARVEST_CLANS_INTEGRITY", "integrity_checked", {
    passed: rankingValidation.success,
    details: rankingValidation.success ? "Clan rankings validated" : "Malformed rankings payload"
  });

  if (!rankingValidation.success) {
    throw new Error("Clan rankings payload failed structural validation.");
  }

  const clanRankingItems = rankingValidation.output.items;
  if (clanRankingItems.length === INITIAL_ARRAY_INDEX) {
    return [];
  }
  
  // Fetch clan details to get members
  // [DECISION LOG] We scan top clans to find highly active members as "discovery anchors".
  const memberFetchTasks = clanRankingItems.map((clanItem) => {
    return async () => {
      const encodedTag = encodeURIComponent(clanItem.tag);
      const clanDetailResponse = await fetchWithRotation(`/clans/${encodedTag}`);
      if (!clanDetailResponse.ok) {
        console.warn(`Failed to fetch clan detail for ${clanItem.tag}: ${clanDetailResponse.status}`);
        return [];
      }
      const rawClanDetailPayload: unknown = await clanDetailResponse.json();

      const detailValidation = v.safeParse(RoyaleClanDetailSchema, rawClanDetailPayload);
      if (!detailValidation.success) {
          console.warn(`Validation failed for clan ${clanItem.tag}`);
          return [];
      }

      return detailValidation.output.memberList;
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
  // [DECISION LOG] Battle logs of top players are a rich source of clanless "Shadow Leads".
  const battlelogTasks = targetPlayerTags.map((playerTag) => {
    return async () => {
      const encodedPlayerTag = encodeURIComponent(playerTag);
      const battleLogResponse = await fetchWithRotation(`/players/${encodedPlayerTag}/battlelog`);
      if (!battleLogResponse.ok) {
        console.warn(`Failed to fetch battlelog for ${playerTag}: ${battleLogResponse.status}`);
        return [];
      }
      const rawBattleLogPayload: unknown = await battleLogResponse.json();

      const battleLogValidation = v.safeParse(RoyaleBattleLogSchema, rawBattleLogPayload);
      if (!battleLogValidation.success) {
          console.warn(`Battle log validation failed for player ${playerTag}`);
          return [];
      }

      return battleLogValidation.output;
    };
  });
  
  const battlelogs = await processBatch(battlelogTasks);
  
  // Extract clanless opponents
  const clanlessMap = new Map<string, { tag: string, name: string, clan: null }>();
  for (const battleLog of battlelogs) {
    if (!Array.isArray(battleLog)) continue;
    for (const battle of battleLog) {
      const opponents = battle.opponent || [];
      for (const opponent of opponents) {
        if (opponent.tag && !opponent.clan?.tag) {
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
