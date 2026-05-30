// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { fetchWithRotation } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { RoyaleFullPlayerSchema, PlayerSyncPayloadSchema, PlayerCardSnapshotSchema } from "../_shared/schemas.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";

/**
 * Edge Function: sync-player-cards
 * L5 Control Layer: User-facing proxy for player profile synchronization.
 *
 * Implements the Clinical Protocol for authorization, validation, and telemetry.
 *
 * Lifecycle:
 *  1. Checks features.player_card_snapshots for a fresh snapshot (<12h old).
 *     On a cache hit, returns immediately - no API call, no key rotation slot used.
 *  2. On a cache miss, fetches the player profile from the Clash Royale API via
 *     the key-rotation proxy (muscle.ts).
 *  3. Normalizes rarity-relative card levels to the unified 1-16 absolute scale.
 *  4. Upserts the full snapshot (cards + player metadata) into the table.
 */

const BASE_MAX_LEVEL = 16;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CardRow {
  card_name: string;
  rarity: string;
  absolute_level: number;
  count: number;
  is_tower_troop: boolean;
  fetched_at: string;
  player_name: string;
  king_level: number;
  xp_into_level: number;
}

interface NormalizedCard {
  card_id: number;
  card_name: string;
  rarity: string;
  is_tower_troop: boolean;
  absolute_level: number;
  api_level: number;
  api_max_level: number;
  count: number;
}

/**
 * Normalizes a player tag to a standard uppercase format with a hash prefix.
 * @param playerTag - The raw player tag from the request.
 */
function normalizeTag(playerTag: string): string {
  const clean = playerTag.trim().toUpperCase();
  return clean.startsWith("#") ? clean : `#${clean}`;
}

/**
 * Maps raw rarity strings from the Royale API to standardized title-case names.
 * @param raw - The raw rarity string (e.g., "common").
 */
function normalizeRarity(raw: string): string {
  const map: Record<string, string> = {
    common: "Common",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
    champion: "Champion",
  };
  return map[raw?.toLowerCase()?.trim()] ?? "Common";
}

/**
 * Constructs the final standardized profile response from database snapshots.
 *
 * @param cardSnapshots - List of card snapshots from the database or fresh API fetch.
 * @param playerTag - The normalized player tag.
 * @param source - Indicates if the data originated from the "cache" (DB) or "api".
 */
function buildProfileResponse(
  cardSnapshots: CardRow[],
  playerTag: string,
  source: "cache" | "api"
) {
  // [THREAT:] Accessing the first element of an empty array triggers a runtime crash.
  // [DECISION LOG] Defensive guard ensures the system fails loudly but safely if data is missing.
  if (cardSnapshots.length === 0) {
    throw new Error(`Standardized profile builder failed: Zero card snapshots found for ${playerTag}`);
  }

  const firstSnapshot = cardSnapshots[0];
  return {
    profile: {
      name: firstSnapshot.player_name,
      tag: playerTag,
      kingLevel: firstSnapshot.king_level,
      xpIntoLevel: firstSnapshot.xp_into_level,
    },
    cards: cardSnapshots
      .filter((snapshot) => !snapshot.is_tower_troop)
      .map((snapshot) => ({
        name: snapshot.card_name,
        rarity: snapshot.rarity,
        level: snapshot.absolute_level,
        count: snapshot.count,
        isTowerTroop: false,
      })),
    towerTroops: cardSnapshots
      .filter((snapshot) => snapshot.is_tower_troop)
      .map((snapshot) => ({
        name: snapshot.card_name,
        rarity: snapshot.rarity,
        level: snapshot.absolute_level,
        count: snapshot.count,
        isTowerTroop: true,
      })),
    inventory: {
      gold: 0,
      gems: 0,
      wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
    },
    meta: {
      total_cards: cardSnapshots.length,
      fetched_at: firstSnapshot.fetched_at,
      source,
    },
  };
}

Deno.serve(async (req) => {
  await syncVault();

  // [DEAD LOGIC REMOVAL] clinicalServe manages CORS, authorization (INTERNAL_BEARER_TOKEN / SUPABASE_ANON_KEY),
  // request validation (PlayerSyncPayloadSchema), and telemetry reporting internally.
  return await clinicalServe({
    req,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "PLAYER_SYNC",
    componentId: "PLAYER_CARD_SYNC",
    schema: PlayerSyncPayloadSchema,
    handler: async (payload, logAudit, heartbeat) => {
      // [DECISION LOG] Tags are normalized to ensure cache hits regardless of user input casing/prefix.
      const normalizedPlayerTag = normalizeTag(payload.tag);

      // 1. [CACHE CHECK]
      // [DECISION LOG] The features.player_card_snapshots table acts as a Layer 2 cache.
      // We check for existing data to minimize Royale API quota consumption and improve response speed.
      const { data: unvalidatedStoredSnapshots, error: fetchError } = await supabase
        .schema("features")
        .from("player_card_snapshots")
        .select(
          "card_name, rarity, absolute_level, count, is_tower_troop, fetched_at, player_name, king_level, xp_into_level"
        )
        .eq("player_tag", normalizedPlayerTag);

      if (fetchError) {
        logAudit("CACHE_CHECK", "error", { message: fetchError.message });
      }

      // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
      // [THREAT:] Unvalidated data from the database can lead to downstream runtime crashes.
      const snapshotValidation = v.safeParse(v.array(PlayerCardSnapshotSchema), unvalidatedStoredSnapshots ?? []);
      if (!snapshotValidation.success) {
        logAudit("CACHE_CHECK", "error", { message: "Validation failed", issues: snapshotValidation.issues });
        // Fail-safe: treat validation failure as a cache miss to allow re-fetching fresh data.
      }

      const cardSnapshots = (snapshotValidation.success ? snapshotValidation.output : []) as v.InferOutput<typeof PlayerCardSnapshotSchema>[];
      const cutoff = Date.now() - CACHE_TTL_MS;
      // [DECISION LOG] Data is considered fresh if at least one card was fetched within the 12h TTL.
      const isFresh =
        cardSnapshots.length > 0 &&
        cardSnapshots.some((snapshot) => new Date(snapshot.fetched_at).getTime() > cutoff);

      if (isFresh) {
        logAudit("CACHE_CHECK", "terminated", { status: "HIT", count: cardSnapshots.length });
        return buildProfileResponse(cardSnapshots, normalizedPlayerTag, "cache");
      }

      logAudit("CACHE_CHECK", "run", { status: "MISS" });

      // 2. [API FETCH]
      logAudit("API_FETCH", "called", { tag: normalizedPlayerTag });
      const encodedTag = encodeURIComponent(normalizedPlayerTag);
      // [THREAT:] fetchWithRotation handles API key rotation to prevent IP/Token banning.
      const royaleApiResponse = await fetchWithRotation(`/players/${encodedTag}`);
      if (!royaleApiResponse.ok) {
        const errorBody = await royaleApiResponse.text().catch(() => "");
        logAudit("API_FETCH", "error", { status: royaleApiResponse.status, body: errorBody });
        throw new Error(`Clash Royale API error: ${royaleApiResponse.status}`);
      }

      const unvalidatedPlayerData = await royaleApiResponse.json();
      // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
      // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes.
      const playerValidation = v.safeParse(RoyaleFullPlayerSchema, unvalidatedPlayerData);

      if (!playerValidation.success) {
        logAudit("API_FETCH", "error", { message: "Validation failed", issues: playerValidation.issues });
        throw new Error("Invalid response from Clash Royale API");
      }

      const playerProfile = playerValidation.output;
      logAudit("API_FETCH", "run", { status: "SUCCESS" });

      // 3. [NORMALIZATION]
      logAudit("NORMALIZATION", "called");
      const playerBaseCards = playerProfile.cards;
      const playerTowerTroops = playerProfile.towerTroops ?? [];
      const allPlayerCards = [...playerBaseCards, ...playerTowerTroops];

      const baseMaxLevel =
        allPlayerCards.reduce((max, card) => Math.max(max, card.maxLevel), 0) ||
        BASE_MAX_LEVEL;

      const playerName = playerProfile.name;
      const kingLevel = playerProfile.expLevel;
      const xpIntoLevel = playerProfile.expPoints;
      const fetchedAt = new Date().toISOString();

      /**
       * Normalizes a single card's level from the relative Royale API scale to our absolute scale.
       * [DECISION LOG] The Royale API uses relative levels (e.g. Rare 11). We convert these to
       * an absolute 1-16 scale based on the distance from the card's maximum level.
       */
      function processCard(rawCardEntry: v.InferOutput<typeof RoyaleFullPlayerSchema>["cards"][0], isTowerTroop: boolean): NormalizedCard {
        const apiLevel = rawCardEntry.level;
        const apiMaxLevel = rawCardEntry.maxLevel;
        const absoluteLevel = baseMaxLevel - (apiMaxLevel - apiLevel);
        return {
          card_id: rawCardEntry.id,
          card_name: rawCardEntry.name,
          rarity: normalizeRarity(rawCardEntry.rarity),
          is_tower_troop: isTowerTroop,
          absolute_level: Math.max(1, Math.min(absoluteLevel, BASE_MAX_LEVEL)),
          api_level: apiLevel,
          api_max_level: apiMaxLevel,
          count: rawCardEntry.count ?? 0,
        };
      }

      const normalizedCards: NormalizedCard[] = [
        ...playerBaseCards.map((rawCardEntry) => processCard(rawCardEntry, false)),
        ...playerTowerTroops.map((rawCardEntry) => processCard(rawCardEntry, true)),
      ];
      logAudit("NORMALIZATION", "run", { cardCount: normalizedCards.length });

      // 4. [UPSERT]
      // [DECISION LOG] Upsert failures are logged but non-fatal to ensure service availability even if the cache layer is degraded.
      if (normalizedCards.length > 0) {
        logAudit("UPSERT", "called");
        const upsertRows = normalizedCards.map((processedCardEntry) => ({
          player_tag: normalizedPlayerTag,
          card_id: processedCardEntry.card_id,
          card_name: processedCardEntry.card_name,
          rarity: processedCardEntry.rarity,
          is_tower_troop: processedCardEntry.is_tower_troop,
          absolute_level: processedCardEntry.absolute_level,
          api_level: processedCardEntry.api_level,
          api_max_level: processedCardEntry.api_max_level,
          count: processedCardEntry.count,
          player_name: playerName,
          king_level: kingLevel,
          xp_into_level: xpIntoLevel,
          fetched_at: fetchedAt,
        }));

        const { error: upsertError } = await supabase
          .schema("features")
          .from("player_card_snapshots")
          .upsert(upsertRows, { onConflict: "player_tag,card_id" });

        if (upsertError) {
          console.error("UPSERT ERROR EXPOSED:", upsertError);
          logAudit("UPSERT", "error", { message: upsertError.message });
          // Non-fatal: still return the data even if persistence failed.
        } else {
          logAudit("UPSERT", "run", { status: "SUCCESS" });
        }
      }

      const freshRows: CardRow[] = normalizedCards.map((processedCardEntry) => ({
        card_name: processedCardEntry.card_name,
        rarity: processedCardEntry.rarity,
        absolute_level: processedCardEntry.absolute_level,
        count: processedCardEntry.count,
        is_tower_troop: processedCardEntry.is_tower_troop,
        fetched_at: fetchedAt,
        player_name: playerName,
        king_level: kingLevel,
        xp_into_level: xpIntoLevel,
      }));

      return buildProfileResponse(freshRows, normalizedPlayerTag, "api");
    },
  });
});
