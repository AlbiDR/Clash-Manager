import type { Gold, Gems, XP } from '@core/utils/economy';
import type { Rarity } from '@core/utils/game';

export type { Rarity };

export type CardName = string & { readonly __brand: "CardName" };

export interface Card {
  readonly name: CardName;
  readonly rarity: Rarity;
  readonly level: number;
  readonly count: number;
  readonly isTowerTroop: boolean;
}

export interface Inventory {
  readonly gold: Gold;
  readonly gems: Gems;
  readonly wildCards: Readonly<Record<Rarity, number>>;
}

export interface PlayerProfile {
  readonly name: string;
  readonly tag: string;
  readonly kingLevel: number;
  readonly xpIntoLevel: XP;
}

export interface PlayerData {
  readonly profile: PlayerProfile;
  readonly inventory: Inventory;
  readonly cards: ReadonlyArray<Card>;
}

export interface OptimizationSettings {
  readonly strategy: "Level Projection" | "Resource Efficiency"; // Updated names
  readonly allowGemSpending: boolean;
  readonly infiniteResources: boolean;
  readonly targetLevel?: number;
}

export interface UpgradeAction {
  readonly cardName: string;
  readonly rarity: Rarity;
  readonly currentLevel: number;
  readonly targetLevel: number;
  readonly goldCost: Gold;
  readonly cardCost: number;
  readonly wildCardsUsed: number;
  readonly gemsUsed: Gems;
  readonly xpGained: XP;
  readonly efficiencyIndex: number;
  readonly upgradeType: "Direct" | "Wild" | "Gem";
  readonly isTowerTroop: boolean;
}

/**
 * The full state of a simulation at any given point.
 * This is immutable and can be used for undo/redo or previews.
 */
export interface SimulationState {
  readonly roster: ReadonlyArray<Card>;
  readonly inventory: Inventory;
  readonly totalXp: XP;
  readonly totalGoldSpent: Gold;
  readonly totalGemsSpent: Gems;
  readonly totalWildCardsUsed: Readonly<Record<Rarity, number>>;
  readonly history: ReadonlyArray<UpgradeAction>;
}

export interface UpgradeCandidate {
  readonly index: number;
  readonly card: Card;
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly goldCost: Gold;
  readonly cardsRequired: number;
  readonly cardsUsed: number;
  readonly wildCardsUsed: number;
  readonly gemsUsed: Gems;
  readonly xpGained: XP;
  readonly efficiencyIndex: number;
}

// Legacy compatibility type for the UI
export interface OptimizationResult {
  readonly actions: ReadonlyArray<UpgradeAction>;
  readonly totalXpGained: number;
  readonly projectedKingLevel: number;
  readonly finalProfile: PlayerProfile;
  readonly finalGold: number;
  readonly finalGems: number;
  readonly totalGoldSpent: number;
  readonly totalGemsSpent: number;
  readonly totalWildCardsUsed: Readonly<Record<Rarity, number>>;
}
