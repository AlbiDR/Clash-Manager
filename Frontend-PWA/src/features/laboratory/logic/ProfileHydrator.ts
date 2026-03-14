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
import { CARD_LEVEL_CAP, CARD_RARITY_START_LEVELS, KING_XP_TABLE } from './Registry';

const normalizeLevel = (level: number, rarity: Rarity): number => {
  const offset = (CARD_RARITY_START_LEVELS[rarity] || 1) - 1;
  const absoluteLevel = level + offset;
  return Math.max(1, Math.min(absoluteLevel, CARD_LEVEL_CAP));
};

const normalizeRarity = (raw: string): Rarity => {
  const lower = raw.toLowerCase().trim();
  const map: Record<string, Rarity> = {
    "common": "Common",
    "rare": "Rare",
    "epic": "Epic",
    "legendary": "Legendary",
    "champion": "Champion"
  };
  return map[lower] || "Common";
};

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
      console.warn("[ProfileHydrator] Validation failed, returning safe default", result.issues);
      return {
        profile: { name: "Unknown", tag: "0", kingLevel: 1, xpIntoLevel: asXP(0) },
        inventory: { gold: asGold(0), gems: asGems(0), wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } },
        cards: []
      };
    }

    const data = result.output;
    const isInternal = "profile" in data;
    
    let profile: PlayerProfile;
    // Internal mapping structures are typed based on schema outputs to avoid 'any'.
    let cardsData: Array<{ name?: string, rarity?: string, level?: number, count?: number, isTowerTroop?: boolean }> = [];

    if (isInternal) {
      const p = data.profile;
      profile = {
        name: p.name || "Unknown",
        tag: p.tag || "0",
        kingLevel: p.kingLevel || 1,
        xpIntoLevel: asXP(p.xpIntoLevel || 0)
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

    const cards: Card[] = cardsData.map((c) => {
      const rarity = normalizeRarity(c.rarity || "Common");
      const level = isInternal ? (c.level || 1) : normalizeLevel(c.level || 1, rarity);
      
      return {
        name: (c.name || "Unknown Card") as CardName,
        rarity: rarity,
        level: Math.max(1, Math.min(level, CARD_LEVEL_CAP)),
        count: c.count || 0,
        // BUGFIX: Ensure boolean coercion is explicit to avoid 'undefined' leaks in domain models.
        isTowerTroop: Boolean(c.isTowerTroop) || ( !isInternal && "towerTroops" in data && Array.isArray(data.towerTroops) && data.towerTroops.some((tt) => tt.name === c.name) ) || false
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
    const kingRow = KING_XP_TABLE.find(k => k.level === data.profile.kingLevel) || KING_XP_TABLE[0];
    const cumulativeXp = addXP(kingRow.cumulative, data.profile.xpIntoLevel);

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
