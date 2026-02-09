
import { CARD_LEVEL_CAP, CARD_RARITY_START_LEVELS, CARD_RARITY_OVERRIDE } from "./Laboratory_Tables";
import type { Inventory, PlayerData, PlayerProfile, Card, Rarity } from "./Laboratory_Types";

const normalizeLevel = (level: number, rarity: Rarity): number => {
  // Logic from Python adapter: Raw API levels are relative (1-based).
  // We must add the start level offset to get the absolute game level.
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
  const normalized = map[lower];
  if (!normalized) return "Common"; // Fallback safe
  return normalized;
}

const LaboratoryAdapter = {
  /**
   * Hydrates raw API data into a strongly typed PlayerData object.
   * Supports both RoyaleAPI flat format and Internal nested format.
   */
  hydrate(
    rawSnapshot: any,
    rawInventory?: any
  ): PlayerData {
    
    let profile: PlayerProfile;
    let cardsData: any[] = [];
    let isInternalFormat = false;

    // CASE A: Internal Format (e.g. from saved JSON files like sample_player.json)
    if (rawSnapshot.profile && rawSnapshot.cards) {
       isInternalFormat = true;
       profile = {
         name: rawSnapshot.profile.name || "Unknown",
         tag: rawSnapshot.profile.tag || "0",
         kingLevel: rawSnapshot.profile.king_level || rawSnapshot.profile.kingLevel,
         xpIntoLevel: rawSnapshot.profile.xp_into_level || rawSnapshot.profile.xpIntoLevel || 0
       };
       cardsData = rawSnapshot.cards;
       
       // If inventory is inside the snapshot (saved file), use it
       if (!rawInventory && rawSnapshot.inventory) {
         rawInventory = rawSnapshot.inventory;
       }
    } 
    // CASE B: RoyaleAPI Format (flat structure)
    else {
      profile = {
        name: rawSnapshot.name || "Unknown",
        tag: rawSnapshot.tag || "0",
        kingLevel: rawSnapshot.expLevel || 1,
        xpIntoLevel: rawSnapshot.expPoints || 0
      };
      cardsData = [...(rawSnapshot.cards || []), ...(rawSnapshot.towerTroops || [])];
    }

    // Default inventory if missing
    const inventoryData = rawInventory || {};

    const cards: Card[] = cardsData.map((c: any) => {
      // Robust Rarity Normalization (Handles internal files with bad casing)
      const rawRarity = c.rarity || "Common";
      let rarity = normalizeRarity(rawRarity);
      
      // ABSOLUTE SOURCE OF TRUTH OVERRIDE
      if (CARD_RARITY_OVERRIDE[c.name]) {
        rarity = CARD_RARITY_OVERRIDE[c.name];
      }

      const isTowerTroop = c.isTowerTroop || (rawSnapshot.towerTroops?.some((tt: any) => tt.name === c.name));
      
      let finalLevel = c.level;

      if (!isInternalFormat) {
         finalLevel = normalizeLevel(c.level, rarity);
      } else {
         // Even for internal, ensure cap
         finalLevel = Math.max(1, Math.min(c.level, CARD_LEVEL_CAP));
      }

      return {
        name: c.name,
        rarity: rarity,
        level: finalLevel,
        count: c.count || 0,
        isTowerTroop: !!isTowerTroop
      };
    });

    const inventory: Inventory = {
      gold: inventoryData.gold || 0,
      gems: inventoryData.gems || 0,
      wildCards: inventoryData.wildCards || { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
    };

    return {
      profile,
      inventory,
      cards
    };
  }
};

export default LaboratoryAdapter;
