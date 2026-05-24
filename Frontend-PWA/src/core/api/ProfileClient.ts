// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getSupabaseUrl, getSupabaseKey } from "./SupabaseClient";
import { ProfileInputSchema } from "./DataSchemas";
import * as v from "valibot";

/**
 * PROFILE CLIENT (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative transport layer for player profile synchronization.
 * Features: Validation Boundaries, Edge Function Proxies.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

/**
 * Synchronizes and retrieves a specific player profile via the User Proxy.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Triggers the `sync-player-cards` Edge Function to perform normalization
 * and persistence on the backend before returning a validated profile.
 *
 * @param tag - The unique player tag.
 * @returns A Promise resolving to a validated ProfileInput dataset.
 * @throws Error if the Edge Function call fails.
 */
export async function getPlayerProfile(
  tag: string,
): Promise<v.InferOutput<typeof ProfileInputSchema>> {
  // Call the sync-player-cards Edge Function, which:
  //  1. Fetches the player profile from the Clash Royale API via the key-rotation proxy.
  //  2. Normalizes rarity-relative card levels to the unified 1-16 absolute scale.
  //  3. Upserts the snapshot into features.player_card_snapshots.
  //  4. Returns the profile in ProfileInputSchema format.
  const functionUrl = `${getSupabaseUrl()}/functions/v1/sync-player-cards`;
  const profileResponse = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Use the publishable key so the Edge Function's JWT verification passes.
      "Authorization": `Bearer ${getSupabaseKey()}`,
    },
    body: JSON.stringify({ tag }),
  });

  if (!profileResponse.ok) {
    const errorBody = await profileResponse.json().catch(() => ({ error: `HTTP ${profileResponse.status}` }));
    throw new Error(errorBody.error ?? `sync-player-cards failed with status ${profileResponse.status}`);
  }

  const rawProfileData = await profileResponse.json();

  // Merge cards and towerTroops into a single array for the simulation engine.
  // isTowerTroop is already set correctly by the Edge Function.
  const normalizedCards = [
    ...(rawProfileData.cards ?? []),
    ...(rawProfileData.towerTroops ?? []),
  ];

  // [GUARD] VALIDATION BOUNDARY: Enforce schema on Edge Function response before domain use.
  return v.parse(ProfileInputSchema, {
    profile: {
      name: rawProfileData.profile?.name ?? "Unknown",
      tag: rawProfileData.profile?.tag ?? tag,
      kingLevel: rawProfileData.profile?.kingLevel ?? 1,
      xpIntoLevel: rawProfileData.profile?.xpIntoLevel ?? 0,
    },
    cards: normalizedCards,
    inventory: rawProfileData.inventory ?? {
      gold: 0,
      gems: 0,
      wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
    },
  });
}
