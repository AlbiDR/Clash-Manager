// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { fetchWithRotation } from "../_shared/muscle.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { normalizeTag, normalizeRarity } from "../_shared/utils.ts";
import { RoyaleFullPlayerSchema, PlayerSyncPayloadSchema, PlayerCardSnapshotSchema } from "../_shared/schemas.ts";
import {
  RATE_LIMIT_IP_MAX_REQUESTS,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_IP_TARGET_MAX_REQUESTS,
  RATE_LIMIT_IP_TARGET_WINDOW_MS,
} from "../_shared/config.ts";
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

/**
 * Authoritative type for a single card snapshot row.
 * [DECISION LOG] Inferred from PlayerCardSnapshotSchema to ensure SSOT with Layer 1.
 */
type CardRow = v.InferOutput<typeof PlayerCardSnapshotSchema>;

/**
 * Interface for normalized card data before database persistence.
 * Includes API-specific metadata required for upsert logic.
 */
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
 * Constructs the final standardized profile response from database snapshots.
 *
 * @remarks
 * Consolidates card and player metadata into a unified DTO for the frontend.
 * Enforces a strict separation between standard cards and tower troops.
 *
 * @param cardSnapshots - List of card snapshots from the database or fresh API fetch.
 * @param playerTag - The normalized player tag.
 * @param source - Indicates if the data originated from the "cache" (DB) or "api".
 * @returns Standardized profile response object.
 *
 * @throws Error if the provided cardSnapshots array is empty.
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
      .filter((cardSnapshot) => !cardSnapshot.is_tower_troop)
      .map((cardSnapshot) => ({
        name: cardSnapshot.card_name,
        rarity: cardSnapshot.rarity,
        level: cardSnapshot.absolute_level,
        count: cardSnapshot.count,
        isTowerTroop: false,
      })),
    towerTroops: cardSnapshots
      .filter((cardSnapshot) => cardSnapshot.is_tower_troop)
      .map((cardSnapshot) => ({
        name: cardSnapshot.card_name,
        rarity: cardSnapshot.rarity,
        level: cardSnapshot.absolute_level,
        count: cardSnapshot.count,
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

/**
 * Safely parses a fetched_at timestamp string into epoch milliseconds.
 *
 * [THREAT:] Malformed fetched_at strings from database can cause Temporal parsing to crash.
 * [DECISION LOG] Wraps Temporal.Instant.from in a defensive try-catch block and falls back to 0 on failure,
 * treating any malformed timestamp as an expired cache entry rather than causing a runtime crash.
 *
 * @param fetchedAt - The timestamp string to parse.
 * @returns The epoch milliseconds timestamp, or 0 on parsing failure.
 */
function parseFetchedAt(fetchedAt: string): number {
  try {
    return Temporal.Instant.from(fetchedAt).epochMilliseconds;
  } catch (parseError: unknown) {
    const message = parseError instanceof Error ? parseError.message : String(parseError);
    console.warn(`[sync-player-cards] Temporal parsing failed for fetched_at '${fetchedAt}': ${message}`);
    return 0;
  }
}

Deno.serve(async (syncRequest) => {
  await syncVault();

  // [DEAD LOGIC REMOVAL] clinicalServe manages CORS, authorization (INTERNAL_BEARER_TOKEN / SUPABASE_ANON_KEY),
  // request validation (PlayerSyncPayloadSchema), and telemetry reporting internally.
  return await clinicalServe({
    req: syncRequest,
    supabase,
    bearerToken: [CONFIG.INTERNAL_BEARER_TOKEN, CONFIG.SUPABASE_ANON_KEY],
    eventType: "PLAYER_SYNC",
    componentId: "PLAYER_CARD_SYNC",
    schema: PlayerSyncPayloadSchema,
    // [SECURITY] This function accepts the publicly known Supabase anon key as a valid
    // bearer credential (browser PWA path), so the anon key is not the access-control
    // boundary here -- rate limiting is. Scoped per caller IP, and per (caller IP + player
    // tag) so one IP cannot flood a single popular tag without affecting every other
    // caller of that same tag.
    rateLimit: {
      maxRequests: RATE_LIMIT_IP_MAX_REQUESTS,
      windowMs: RATE_LIMIT_IP_WINDOW_MS,
      targetKey: (payload) => payload.tag,
      targetMaxRequests: RATE_LIMIT_IP_TARGET_MAX_REQUESTS,
      targetWindowMs: RATE_LIMIT_IP_TARGET_WINDOW_MS,
    },
    handler: async (syncPayload, logAudit, heartbeat) => {
      // [DECISION LOG] Tags are normalized to ensure cache hits regardless of user input casing/prefix.
      const normalizedPlayerTag = normalizeTag(syncPayload.tag);

      // 1. [CACHE CHECK]
      // [DECISION LOG] The features.player_card_snapshots table acts as a Layer 2 cache.
      // We check for existing data to minimize Royale API quota consumption and improve response speed.
      const { data: storedSnapshotsRaw, error: dbFetchError } = await supabase
        .schema("features")
        .from("player_card_snapshots")
        .select(
          "card_name, rarity, absolute_level, count, is_tower_troop, fetched_at, player_name, king_level, xp_into_level"
        )
        .eq("player_tag", normalizedPlayerTag);

      if (dbFetchError) {
        logAudit("CACHE_CHECK", "error", { message: dbFetchError.message });
      }

      // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
      // [THREAT:] Unvalidated data from the database can lead to downstream runtime crashes.
      const snapshotValidationResult = v.safeParse(v.array(PlayerCardSnapshotSchema), storedSnapshotsRaw ?? []);
      if (!snapshotValidationResult.success) {
        logAudit("CACHE_CHECK", "error", { message: "Validation failed", issues: snapshotValidationResult.issues });
        // Fail-safe: treat validation failure as a cache miss to allow re-fetching fresh data.
      }

      const cardSnapshots: CardRow[] = snapshotValidationResult.success ? snapshotValidationResult.output : [];
      const cacheExpirationCutoff = Temporal.Now.instant().subtract({ milliseconds: CACHE_TTL_MS });
      // [DECISION LOG] Data is considered fresh if at least one card was fetched within the 12h TTL.
      // [THREAT:] If the database contains malformed fetched_at values, parsing throws unhandled exceptions.
      // We safely delegate parsing to parseFetchedAt to prevent runtime crashes.
      const isCacheDataFresh =
        cardSnapshots.length > 0 &&
        cardSnapshots.some((snapshot) => parseFetchedAt(snapshot.fetched_at) > cacheExpirationCutoff.epochMilliseconds);

      if (isCacheDataFresh) {
        logAudit("CACHE_CHECK", "terminated", { status: "HIT", count: cardSnapshots.length });
        return buildProfileResponse(cardSnapshots, normalizedPlayerTag, "cache");
      }

      logAudit("CACHE_CHECK", "run", { status: "MISS" });

      // 2. [API FETCH]
      logAudit("API_FETCH", "called", { tag: normalizedPlayerTag });
      const encodedTag = encodeURIComponent(normalizedPlayerTag);
      // [THREAT:] fetchWithRotation handles API key rotation to prevent IP/Token banning.
      const playerApiResponse = await fetchWithRotation(`/players/${encodedTag}`);
      if (!playerApiResponse.ok) {
        const apiErrorBody = await playerApiResponse.text().catch(() => "");
        logAudit("API_FETCH", "error", { status: playerApiResponse.status, body: apiErrorBody });
        throw new Error(`Clash Royale API error: ${playerApiResponse.status}`);
      }

      // [THREAT:] External API data is un-trusted. Replacing implicit 'any' with 'unknown'
      // to enforce strict narrowing and prevent runtime crashes or logic corruption.
      const playerRoyalePayload: unknown = await playerApiResponse.json();

      // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
      // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes.
      const playerValidationResult = v.safeParse(RoyaleFullPlayerSchema, playerRoyalePayload);

      if (!playerValidationResult.success) {
        logAudit("API_FETCH", "error", { message: "Validation failed", issues: playerValidationResult.issues });
        throw new Error("Invalid response from Clash Royale API");
      }

      const playerProfileData = playerValidationResult.output;
      logAudit("API_FETCH", "run", { status: "SUCCESS" });

      // 3. [NORMALIZATION]
      logAudit("NORMALIZATION", "called");
      const baseCardCollection = playerProfileData.cards;
      const towerTroopCollection = playerProfileData.towerTroops ?? [];
      const completeCardCollection = [...baseCardCollection, ...towerTroopCollection];

      const baseMaxLevel =
        completeCardCollection.reduce((max, card) => Math.max(max, card.maxLevel), 0) ||
        BASE_MAX_LEVEL;

      const playerName = playerProfileData.name;
      const kingLevel = playerProfileData.expLevel;
      const xpIntoLevel = playerProfileData.expPoints;
      const fetchedAt = Temporal.Now.instant().toString();

      /**
       * Normalizes a single card's level from the relative Royale API scale to our absolute scale.
       *
       * @remarks
       * [DECISION LOG] ABSOLUTE SCALING FORMULA:
       * The Royale API uses relative levels (e.g. Rare 11). We convert these to
       * an absolute 1-16 scale based on the distance from the card's maximum level.
       * Formula: absoluteLevel = baseMaxLevel - (apiMaxLevel - apiLevel).
       * This ensures consistent level representation across all rarities for simulation math.
       *
       * @param royaleCardEntry - Raw card entry from the Royale API.
       * @param isTowerTroop - Whether the card is a tower troop.
       * @returns NormalizedCard object.
       */
      function processCard(royaleCardEntry: v.InferOutput<typeof RoyaleFullPlayerSchema>["cards"][0], isTowerTroop: boolean): NormalizedCard {
        const apiLevel = royaleCardEntry.level;
        const apiMaxLevel = royaleCardEntry.maxLevel;
        const absoluteLevel = baseMaxLevel - (apiMaxLevel - apiLevel);
        return {
          card_id: royaleCardEntry.id,
          card_name: royaleCardEntry.name,
          rarity: normalizeRarity(royaleCardEntry.rarity),
          is_tower_troop: isTowerTroop,
          absolute_level: Math.max(1, Math.min(absoluteLevel, BASE_MAX_LEVEL)),
          api_level: apiLevel,
          api_max_level: apiMaxLevel,
          count: royaleCardEntry.count ?? 0,
        };
      }

      const normalizedCards: NormalizedCard[] = [
        ...baseCardCollection.map((royaleCardEntry) => processCard(royaleCardEntry, false)),
        ...towerTroopCollection.map((royaleCardEntry) => processCard(royaleCardEntry, true)),
      ];
      logAudit("NORMALIZATION", "run", { cardCount: normalizedCards.length });

      // 4. [UPSERT]
      // [DECISION LOG] Upsert failures are logged but non-fatal to ensure service availability even if the cache layer is degraded.
      if (normalizedCards.length > 0) {
        logAudit("UPSERT", "called");
        const upsertRows = normalizedCards.map((normalizedCardEntry) => ({
          player_tag: normalizedPlayerTag,
          card_id: normalizedCardEntry.card_id,
          card_name: normalizedCardEntry.card_name,
          rarity: normalizedCardEntry.rarity,
          is_tower_troop: normalizedCardEntry.is_tower_troop,
          absolute_level: normalizedCardEntry.absolute_level,
          api_level: normalizedCardEntry.api_level,
          api_max_level: normalizedCardEntry.api_max_level,
          count: normalizedCardEntry.count,
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

      const freshRows: CardRow[] = normalizedCards.map((normalizedCardEntry) => ({
        card_name: normalizedCardEntry.card_name,
        rarity: normalizedCardEntry.rarity,
        absolute_level: normalizedCardEntry.absolute_level,
        count: normalizedCardEntry.count,
        is_tower_troop: normalizedCardEntry.is_tower_troop,
        fetched_at: fetchedAt,
        player_name: playerName,
        king_level: kingLevel,
        xp_into_level: xpIntoLevel,
      }));

      return buildProfileResponse(freshRows, normalizedPlayerTag, "api");
    },
  });
});
