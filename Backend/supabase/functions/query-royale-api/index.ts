// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { RoyaleClanSchema } from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import {
  GLOBAL_LOCATION,
  LOCATION_ID_INTERNATIONAL
} from "../_shared/config.ts";
import {
  harvestClanlessPlayers,
  harvestInternationalPlayers
} from "./harvester.ts";

/**
 * Edge Function: query-royale-api
 * L5 Control Layer: Secure proxy for client-side Clash Royale API queries.
 *
 * Implements robust clanless player harvesting via Path of Legends rankings.
 * Delegates discovery logic to the specialized Harvester module.
 */

/**
 * Validation schema for the inbound Royale API query payload.
 */
const PayloadSchema = v.object({
  endpoint: v.picklist(["local", "global"]),
});

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

      const targetLocationId = location.id;
      const targetLocationName = location.name;

      // Handle International location rotation
      const isInternational = targetLocationId === LOCATION_ID_INTERNATIONAL ||
                              targetLocationName === "International" ||
                              !location.isCountry;

      if (isInternational) {
        return await harvestInternationalPlayers(logAudit);
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
