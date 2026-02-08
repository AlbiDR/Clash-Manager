
export type Rarity = "Common" | "Rare" | "Epic" | "Legendary" | "Champion";

export type CardName = string;

// Utility to make properties mutable for the internal simulation
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface Card {
  readonly name: CardName;
  readonly rarity: Rarity;
  readonly level: number;
  readonly count: number;
}

export interface Inventory {
  readonly gold: number;
  readonly gems: number;
  readonly wildCards: Readonly<Record<Rarity, number>>;
}

export interface PlayerProfile {
  readonly name: string;
  readonly tag: string;
  readonly kingLevel: number;
  readonly xpIntoLevel: number;
}

export interface PlayerData {
  readonly profile: PlayerProfile;
  readonly inventory: Inventory;
  readonly cards: ReadonlyArray<Card>;
}

export interface OptimizationSettings {
  readonly strategy: "Target" | "Maximize";
  readonly allowGemSpending: boolean;
  readonly infiniteResources: boolean;
  readonly targetLevel?: number;
}

export interface UpgradeAction {
  readonly cardName: string;
  readonly rarity: Rarity;
  readonly currentLevel: number; // Renamed for UI clarity
  readonly targetLevel: number; // Renamed for UI clarity
  readonly goldCost: number;
  readonly cardCost: number;
  readonly wildCardsUsed: number;
  readonly gemsUsed: number;
  readonly xpGained: number;
  readonly efficiencyRatio: number; // Cost per 1 XP
  readonly materialEfficiency: number; // XP per Card
  readonly upgradeType: "Direct" | "Wild" | "Gem"; // Added for UI
}

export interface OptimizationResult {
  readonly actions: ReadonlyArray<UpgradeAction>;
  readonly totalXpGained: number;
  readonly projectedKingLevel: number; // Added for UI convenience
  readonly finalProfile: PlayerProfile;
  readonly finalGold: number;
  readonly finalGems: number;
  readonly totalGoldSpent: number;
  readonly totalGemsSpent: number;
  readonly totalWildCardsUsed: Readonly<Record<Rarity, number>>;
}

export interface UpgradeCandidate {
  readonly index: number;
  readonly card: Card;
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly goldCost: number;
  readonly cardsRequired: number;
  readonly cardsUsed: number;
  readonly wildCardsUsed: number;
  readonly gemsUsed: number;
  readonly xpGained: number;
  readonly efficiencyRatio: number;
  readonly materialEfficiency: number;
}
