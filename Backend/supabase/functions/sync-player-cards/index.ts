// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRotation } from "../_shared/muscle.ts";

/**
 * Edge Function: sync-player-cards
 *
 * User-facing proxy that:
 *  1. Fetches a player's card roster from the Clash Royale API.
 *  2. Normalizes rarity-relative levels to the unified 1-16 absolute scale.
 *  3. Upserts the snapshot into features.player_card_snapshots for the Laboratory engine.
 *  4. Returns the normalized profile in ProfileInputSchema format.
 *
 * Level normalization formula (from official progression calculators):
 *   absolute_level = BASE_MAX_LEVEL - (api_max_level - api_level)
 *   where BASE_MAX_LEVEL = 16 (the Common card cap).
 *
 * Rarity maxLevel mapping (post-Level 16 update):
 *   Common=16, Rare=14, Epic=11, Legendary=8, Champion=6
 */

const BASE_MAX_LEVEL = 16;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function normalizeTag(tag: string): string {
  const clean = tag.trim().toUpperCase();
  return clean.startsWith("#") ? clean : `#${clean}`;
}

/**
 * Converts a rarity-relative API level to the unified 1-16 absolute scale.
 *
 * The Clash Royale API returns card levels relative to the rarity's own cap
 * (e.g., a Rare at level 14 is actually at absolute level 16).
 * This formula anchors all rarities to the Common card's 1-16 range.
 */
function toAbsoluteLevel(apiLevel: number, apiMaxLevel: number): number {
  const absolute = BASE_MAX_LEVEL - (apiMaxLevel - apiLevel);
  return Math.max(1, Math.min(absolute, BASE_MAX_LEVEL));
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  // --- Parse payload ---
  let tag: string;
  try {
    const body = await req.json();
    if (!body?.tag || typeof body.tag !== "string") {
      return jsonResponse({ error: "Missing required field: tag" }, 400);
    }
    tag = normalizeTag(body.tag);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  // --- Call Clash Royale API via proxy ---
  const encodedTag = encodeURIComponent(tag);
  let royaleData: any;
  try {
    const res = await fetchWithRotation(`/players/${encodedTag}`);
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[sync-player-cards] API error ${res.status} for tag ${tag}: ${errBody}`);
      return jsonResponse({ error: `Clash Royale API error: ${res.status}` }, res.status === 404 ? 404 : 502);
    }
    royaleData = await res.json();
  } catch (err: any) {
    console.error(`[sync-player-cards] Fetch failure: ${err.message}`);
    return jsonResponse({ error: "Failed to reach Clash Royale API" }, 503);
  }

  // --- Normalize card data ---
  const rawCards: any[] = royaleData.cards ?? [];
  const rawTowerTroops: any[] = royaleData.towerTroops ?? [];

  // Determine the highest maxLevel seen across all cards (should be 16 for Common).
  const allCards = [...rawCards, ...rawTowerTroops];
  const baseMaxLevel = allCards.reduce(
    (max, c) => Math.max(max, c.maxLevel ?? 0),
    0
  ) || BASE_MAX_LEVEL;

  type NormalizedCard = {
    card_id: number;
    card_name: string;
    rarity: string;
    is_tower_troop: boolean;
    absolute_level: number;
    api_level: number;
    api_max_level: number;
    count: number;
  };

  function processCard(card: any, isTowerTroop: boolean): NormalizedCard {
    const apiLevel = card.level ?? 1;
    const apiMaxLevel = card.maxLevel ?? BASE_MAX_LEVEL;
    // Anchor to baseMaxLevel in case the collection's highest cap differs.
    const absoluteLevel = baseMaxLevel - (apiMaxLevel - apiLevel);
    return {
      card_id: card.id,
      card_name: card.name ?? "Unknown",
      rarity: normalizeRarity(card.rarity ?? "common"),
      is_tower_troop: isTowerTroop,
      absolute_level: Math.max(1, Math.min(absoluteLevel, BASE_MAX_LEVEL)),
      api_level: apiLevel,
      api_max_level: apiMaxLevel,
      count: card.count ?? 0,
    };
  }

  const normalizedCards = [
    ...rawCards.map((c) => processCard(c, false)),
    ...rawTowerTroops.map((c) => processCard(c, true)),
  ];

  // --- Upsert snapshot into Supabase ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "features" } }
  );

  const rows = normalizedCards.map((card) => ({
    player_tag: tag,
    card_id: card.card_id,
    card_name: card.card_name,
    rarity: card.rarity,
    is_tower_troop: card.is_tower_troop,
    absolute_level: card.absolute_level,
    api_level: card.api_level,
    api_max_level: card.api_max_level,
    count: card.count,
    fetched_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("player_card_snapshots")
      .upsert(rows, { onConflict: "player_tag,card_id" });

    if (upsertError) {
      console.error(`[sync-player-cards] Upsert error: ${upsertError.message}`);
      // Non-fatal: still return the data to the PWA even if persistence failed.
    }
  }

  // --- Build ProfileInputSchema-compatible response ---
  const profile = {
    name: royaleData.name ?? "Unknown",
    tag: royaleData.tag ?? tag,
    kingLevel: royaleData.expLevel ?? 1,
    xpIntoLevel: royaleData.expPoints ?? 0,
  };

  const cards = normalizedCards
    .filter((c) => !c.is_tower_troop)
    .map((c) => ({
      name: c.card_name,
      rarity: c.rarity,
      level: c.absolute_level,
      count: c.count,
      isTowerTroop: false,
    }));

  const towerTroops = normalizedCards
    .filter((c) => c.is_tower_troop)
    .map((c) => ({
      name: c.card_name,
      rarity: c.rarity,
      level: c.absolute_level,
      count: c.count,
      isTowerTroop: true,
    }));

  return jsonResponse({
    profile,
    cards,
    towerTroops,
    inventory: {
      gold: 0,
      gems: 0,
      wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
    },
    meta: {
      total_cards: normalizedCards.length,
      fetched_at: new Date().toISOString(),
    },
  });
});
