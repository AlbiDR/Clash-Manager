// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { fetchWithRotation } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { RoyaleBattleLogSchema } from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";

/**
 * Edge Function: fetch-player-battlelog
 * L5 Control Layer: Secure proxy for fetching a single player's live battle log
 * directly from the Clash Royale API.
 *
 * @remarks
 * Intended for testing and diagnostic purposes. Accepts a player tag,
 * fetches the raw battle log from the Royale API, validates it against
 * the canonical RoyaleBattleLogSchema, and returns the structured result.
 */

/**
 * Validation schema for the inbound payload.
 * Requires a player tag in Clash Royale format (e.g. "#PP80QG99").
 */
const PayloadSchema = v.object({
  playerTag: v.pipe(
    v.string(),
    v.minLength(3, "Player tag must be at least 3 characters."),
  ),
});

/**
 * MAIN HANDLER: fetch-player-battlelog
 *
 * @remarks
 * Satisfies ADR Section V: Edge Functions - Data Ingestion.
 * Uses the clinical protocol wrapper for authorization, validation,
 * and telemetry. Accepts a POST body with a `playerTag` field.
 *
 * Authentication accepts both the internal bearer token and the
 * Supabase anon key to support direct browser-side testing calls.
 */
Deno.serve(async (req) => {
  await syncVault();

  return await clinicalServe({
    req,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "PLAYER_BATTLELOG_FETCH",
    componentId: "FETCH_PLAYER_BATTLELOG",
    schema: PayloadSchema,
    handler: async (payload, logAudit) => {
      const { playerTag } = payload;

      // Normalize tag: ensure it starts with '#' regardless of client encoding.
      const normalizedTag = playerTag.startsWith("#")
        ? playerTag
        : `#${playerTag}`;

      const encodedTag = encodeURIComponent(normalizedTag);
      const battlelogPath = `/players/${encodedTag}/battlelog`;

      logAudit("BATTLELOG_FETCH", "called", {
        playerTag: normalizedTag,
        path: battlelogPath,
      });

      const battlelogResponse = await fetchWithRotation(battlelogPath);

      if (!battlelogResponse.ok) {
        const status = battlelogResponse.status;
        logAudit("BATTLELOG_FETCH", "failed", { status, playerTag: normalizedTag });
        throw new Error(
          `Royale API returned ${status} for player tag ${normalizedTag}.`,
        );
      }

      const rawPayload: unknown = await battlelogResponse.json();

      // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
      // [THREAT:] Prevents runtime crashes from unexpected Royale API structural changes.
      const validation = v.safeParse(RoyaleBattleLogSchema, rawPayload);

      logAudit("BATTLELOG_INTEGRITY", "integrity_checked", {
        passed: validation.success,
        playerTag: normalizedTag,
        details: validation.success
          ? `Validated ${validation.output.length} battle entries.`
          : "Battle log payload failed structural validation.",
      });

      if (!validation.success) {
        throw new Error(
          `Battle log for ${normalizedTag} failed structural validation.`,
        );
      }

      logAudit("BATTLELOG_FETCH", "completed", {
        playerTag: normalizedTag,
        battleCount: validation.output.length,
      });

      return {
        playerTag: normalizedTag,
        battleCount: validation.output.length,
        battles: validation.output,
      };
    },
  });
});
