// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { 
  Card, 
  Inventory, 
  PlayerData, 
  PlayerProfile, 
  SimulationState, 
  Rarity,
  CardName
} from './Types';
import * as v from "valibot";
import { ProfileInputSchema } from "@core/api/DataSchemas";
import { asGold, asGems, asXP, addXP } from '@core/utils/economy';
import {
  CARD_LEVEL_CAP,
  calculateKingLevel,
  normalizeLevel,
  normalizeRarity,
  getKingLevelBaseXp
} from './Registry';

const ProfileHydrator = {
  /**
   * Transforms raw API data into strongly typed domain models.
   *
   * @remarks
   * 🛡️ VALIDATION BOUNDARY: Implements Target B [1] hardening.
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
      profile = {
        name: data.name || "Unknown",
        tag: data.tag || "0",
        kingLevel: data.expLevel || 1,
        xpIntoLevel: asXP(data.expPoints || 0)
      };
      cardsData = [...(data.cards || []), ...(data.towerTroops || [])];
    }

    const cards: Card[] = cardsData.map((cardSnapshot) => {
      // PATHOGEN: Anemic variable 'c' replaced with 'cardSnapshot'.
      const rarity = normalizeRarity(cardSnapshot.rarity || "Common");
      const level = isInternal ? (cardSnapshot.level || 1) : normalizeLevel(cardSnapshot.level || 1, rarity);
      
      return {
        name: (cardSnapshot.name || "Unknown Card") as CardName,
        rarity: rarity,
        level: Math.max(1, Math.min(level, CARD_LEVEL_CAP)),
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
    const cumulativeXp = addXP(getKingLevelBaseXp(data.profile.kingLevel), data.profile.xpIntoLevel);

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
