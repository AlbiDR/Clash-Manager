/**
 * ============================================================================
 * DOMAIN: ECONOMY
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Branded types and pure functions for Clash Royale currencies.
 *    Enforces type safety to prevent accidental currency mixing.
 * ============================================================================
 */

export type Gold = number & { readonly __brand: 'Gold' };
export type Gems = number & { readonly __brand: 'Gems' };
export type XP = number & { readonly __brand: 'XP' };

/**
 * Type Casts (Explicit Branding)
 */
export const asGold = (v: number): Gold => v as Gold;
export const asGems = (v: number): Gems => v as Gems;
export const asXP = (v: number): XP => v as XP;

/**
 * Pure Gold Arithmetic
 */
export const addGold = (a: Gold, b: Gold): Gold => (a + b) as Gold;
export const subGold = (a: Gold, b: Gold): Gold => Math.max(0, a - b) as Gold;
export const canAffordGold = (balance: Gold, cost: Gold): boolean => balance >= cost;

/**
 * Pure Gem Arithmetic
 */
export const addGems = (a: Gems, b: Gems): Gems => (a + b) as Gems;
export const subGems = (a: Gems, b: Gems): Gems => Math.max(0, a - b) as Gems;
export const canAffordGems = (balance: Gems, cost: Gems): boolean => balance >= cost;

/**
 * Currency Conversion Logic
 */
export const GEM_TO_GOLD_FACTOR = 20; // 1 Gem = 20 Gold (Legacy baseline)

export function convertGemsToGold(gems: Gems): Gold {
  return Math.floor(gems * GEM_TO_GOLD_FACTOR) as Gold;
}

export function calculateGemCostForGold(goldDeficit: Gold): Gems {
  if (goldDeficit <= 0) return 0 as Gems;
  return Math.ceil(goldDeficit / GEM_TO_GOLD_FACTOR) as Gems;
}

/**
 * XP Logic
 */
export const addXP = (a: XP, b: XP): XP => (a + b) as XP;
