import type { 
  Card, 
  Inventory, 
  PlayerData, 
  PlayerProfile, 
  SimulationState, 
  Rarity,
  CardName
} from './Types';
import { asGold, asGems, asXP } from './Economy';
import { CARD_LEVEL_CAP, CARD_RARITY_START_LEVELS } from './Registry';

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
   */
  hydrate(raw: any): PlayerData {
    const isInternal = !!(raw.profile && raw.cards);
    
    let profile: PlayerProfile;
    let cardsData: any[] = [];
    let inventoryData: any;

    if (isInternal) {
      profile = {
        name: raw.profile.name || "Unknown",
        tag: raw.profile.tag || "0",
        kingLevel: raw.profile.kingLevel || 1,
        xpIntoLevel: asXP(raw.profile.xpIntoLevel || 0)
      };
      cardsData = raw.cards || [];
      inventoryData = raw.inventory || {};
    } else {
      profile = {
        name: raw.name || "Unknown",
        tag: raw.tag || "0",
        kingLevel: raw.expLevel || 1,
        xpIntoLevel: asXP(raw.expPoints || 0)
      };
      cardsData = [...(raw.cards || []), ...(raw.towerTroops || [])];
      inventoryData = {}; // Flat RoyaleAPI doesn't have inventory
    }

    const cards: Card[] = cardsData.map((c: any) => {
      const rarity = normalizeRarity(c.rarity || "Common");
      const level = isInternal ? c.level : normalizeLevel(c.level, rarity);
      
      return {
        name: c.name as CardName,
        rarity: rarity,
        level: Math.max(1, Math.min(level, CARD_LEVEL_CAP)),
        count: c.count || 0,
        isTowerTroop: !!c.isTowerTroop || (raw.towerTroops?.some((tt: any) => tt.name === c.name))
      };
    });

    const inventory: Inventory = {
      gold: asGold(inventoryData.gold || 0),
      gems: asGems(inventoryData.gems || 0),
      wildCards: inventoryData.wildCards || { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
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
