// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { 
  Card, 
  Inventory, 
  PlayerData, 
  PlayerProfile, 
  SimulationState, 
  CardName
} from './Types';
import {
  type Rarity,
  CARD_LEVEL_CAP,
  KING_XP_TABLE,
  normalizeRarity
} from '@core/utils/game';
import * as v from "valibot";
import { ProfileInputSchema } from "@core/api/DataSchemas";
import { asGold, asGems, asXP, addXP } from '@core/utils/economy';

const ProfileHydrator = {
  /**
   * Transforms raw API data into strongly typed domain models.
   *
   * @remarks
   * [GUARD] VALIDATION BOUNDARY: Implements Target B [1] hardening.
   * This function enforces strict schema validation for all incoming data
   * from both internal cache and external API. Downstream logic is
   * guaranteed to operate on validated structural input.
   *
   * @param raw - The raw input to be hydrated. Typed as `unknown` to enforce parsing.
   * Target B [4]: The 'any Plague' is eliminated.
   */
  hydrate(raw: unknown): PlayerData {
    const result = v.safeParse(ProfileInputSchema, raw);

    if (!result.success) {
      // THREAT: Corrupted or malicious data crashing the simulation engine.
      // Target B [1]: Fail loudly at the boundary to prevent silent state corruption.
      // Rationale: By throwing instead of returning a default, we ensure that
      // downstream simulation logic never executes on unvalidated or partial state.
      const firstIssue = result.issues[0]?.message || "Invalid Profile Structure";
      throw new Error(`Profile Extraction Failed: ${firstIssue}`);
    }

    const data = result.output;
    const isInternal = "profile" in data;
    
    let profile: PlayerProfile;
    // Internal mapping structures are typed based on schema outputs to avoid 'any'.
    let cardsData: Array<{ name?: string, rarity?: string, level?: number, count?: number, isTowerTroop?: boolean }> = [];

    if (isInternal) {
      // PATHOGEN: Anemic variable 'p' replaced with domain-descriptive 'rawProfile'.
      const rawProfile = data.profile;
      profile = {
        name: rawProfile.name || "Unknown",
        tag: rawProfile.tag || "0",
        kingLevel: rawProfile.kingLevel || 1,
        xpIntoLevel: asXP(rawProfile.xpIntoLevel || 0)
      };
      cardsData = data.cards || [];
    } else {
      const currentLevel = data.expLevel || 1;
      const totalExp = data.expPoints || 0;
      
      // Target B [1]: Robust extraction of relative XP from cumulative API points.
      // Rationale: The Clash Royale API provides total cumulative XP in 'expPoints'.
      // To maintain internal consistency with our state-based engine, we must
      // subtract the base XP for the current level.
      const kingLevelRow = KING_XP_TABLE.find(row => row.level === currentLevel) || KING_XP_TABLE[0];
      const xpIntoLevel = Math.max(0, totalExp - Number(kingLevelRow.cumulative));

      profile = {
        name: data.name || "Unknown",
        tag: data.tag || "0",
        kingLevel: currentLevel,
        xpIntoLevel: asXP(xpIntoLevel)
      };
      cardsData = [...(data.cards || []), ...(data.towerTroops || [])];
    }

    const cards: Card[] = cardsData.map((cardSnapshot) => {
      // PATHOGEN: Anemic variable 'c' replaced with 'cardSnapshot'.
      const rarity = normalizeRarity(cardSnapshot.rarity || "Common");

      // Rationale: Modern Clash Royale API returns absolute levels (1-15/16).
      // We must only clamp to the level cap, without applying relative offsets
      // which would cause level inflation.
      const rawLevel = cardSnapshot.level || 1;
      const level = Math.max(1, Math.min(rawLevel, CARD_LEVEL_CAP));
      
      return {
        name: (cardSnapshot.name || "Unknown Card") as CardName,
        rarity: rarity,
        level: level,
        count: cardSnapshot.count || 0,
        // BUGFIX: Ensure boolean coercion is explicit to avoid 'undefined' leaks in domain models.
        isTowerTroop: Boolean(cardSnapshot.isTowerTroop) || ( !isInternal && "towerTroops" in data && Array.isArray(data.towerTroops) && data.towerTroops.some((towerTroopSnapshot) => towerTroopSnapshot.name === cardSnapshot.name) ) || false
      };
    });

    const inventory: Inventory = {
      gold: asGold(("inventory" in data ? data.inventory?.gold : 0) || 0),
      gems: asGems(("inventory" in data ? data.inventory?.gems : 0) || 0),
      wildCards: {
        Common: ("inventory" in data ? data.inventory?.wildCards?.Common : 0) || 0,
        Rare: ("inventory" in data ? data.inventory?.wildCards?.Rare : 0) || 0,
        Epic: ("inventory" in data ? data.inventory?.wildCards?.Epic : 0) || 0,
        Legendary: ("inventory" in data ? data.inventory?.wildCards?.Legendary : 0) || 0,
        Champion: ("inventory" in data ? data.inventory?.wildCards?.Champion : 0) || 0,
      } as Record<Rarity, number>
    };

    return { profile, inventory, cards };
  },

  /**
   * Initial seed for the simulation loop.
   */
  createInitialState(data: PlayerData): SimulationState {
    // PATHOGEN: Anemic variable 'k' replaced with 'kingLevelRow'.
    const kingLevelRow = KING_XP_TABLE.find(kingLevelEntry => kingLevelEntry.level === data.profile.kingLevel) || KING_XP_TABLE[0];
    const cumulativeXp = addXP(kingLevelRow.cumulative, data.profile.xpIntoLevel);

    return {
      roster: data.cards,
      inventory: data.inventory,
      totalXp: cumulativeXp,
      totalGoldSpent: asGold(0),
      totalGemsSpent: asGems(0),
      totalWildCardsUsed: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
      history: []
    };
  }
};

export default ProfileHydrator;
