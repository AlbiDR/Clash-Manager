/**
 * ============================================================================
 * MODULE: ECONOMY (Layer 1)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Branded types and pure arithmetic functions for Clash Royale
 * currencies (Gold, Gems, XP).
 *
 * ARCHITECTURE:
 *    - Type Branding: Uses intersection types to prevent accidental currency
 *      mixing (e.g., adding Gold to Gems).
 *    - Functional Purity: All arithmetic operations are pure and do not
 *      mutate inputs.
 *
 * ROLE: Core utility for managing economic transactions and progression
 * across all business features (Laboratory, Headhunter).
 * ============================================================================
 */

/** Branded type for Gold currency. */
export type Gold = number & { readonly __brand: "Gold" };
/** Branded type for Gems currency. */
export type Gems = number & { readonly __brand: "Gems" };
/** Branded type for Experience Points (XP). */
export type XP = number & { readonly __brand: "XP" };

/**
 * Casts a raw number to the Gold branded type.
 *
 * @param v - The numeric value to cast.
 * @returns The value as Gold.
 */
export const asGold = (v: number): Gold => v as Gold;

/**
 * Casts a raw number to the Gems branded type.
 *
 * @param v - The numeric value to cast.
 * @returns The value as Gems.
 */
export const asGems = (v: number): Gems => v as Gems;

/**
 * Casts a raw number to the XP branded type.
 *
 * @param v - The numeric value to cast.
 * @returns The value as XP.
 */
export const asXP = (v: number): XP => v as XP;

/**
 * Adds two Gold values.
 *
 * @param a - First Gold value.
 * @param b - Second Gold value.
 * @returns The sum as Gold.
 */
export const addGold = (a: Gold, b: Gold): Gold => (a + b) as Gold;

/**
 * Subtracts one Gold value from another, clamped to a minimum of 0.
 *
 * @param a - The base Gold value.
 * @param b - The Gold value to subtract.
 * @returns The difference as Gold.
 */
export const subGold = (a: Gold, b: Gold): Gold => Math.max(0, a - b) as Gold;

/**
 * Checks if a Gold balance is sufficient to cover a cost.
 *
 * @param balance - The available Gold.
 * @param cost - The required Gold.
 * @returns True if balance is greater than or equal to cost.
 */
export const canAffordGold = (balance: Gold, cost: Gold): boolean =>
  balance >= cost;

/**
 * Adds two Gems values.
 *
 * @param a - First Gems value.
 * @param b - Second Gems value.
 * @returns The sum as Gems.
 */
export const addGems = (a: Gems, b: Gems): Gems => (a + b) as Gems;

/**
 * Subtracts one Gems value from another, clamped to a minimum of 0.
 *
 * @param a - The base Gems value.
 * @param b - The Gems value to subtract.
 * @returns The difference as Gems.
 */
export const subGems = (a: Gems, b: Gems): Gems => Math.max(0, a - b) as Gems;

/**
 * Checks if a Gems balance is sufficient to cover a cost.
 *
 * @param balance - The available Gems.
 * @param cost - The required Gems.
 * @returns True if balance is greater than or equal to cost.
 */
export const canAffordGems = (balance: Gems, cost: Gems): boolean =>
  balance >= cost;

/**
 * The baseline conversion rate between Gems and Gold.
 * @remarks 1 Gem = 20 Gold.
 */
export const GEM_TO_GOLD_FACTOR = 20;

/**
 * Converts Gems to their Gold equivalent.
 *
 * @param gems - The Gems amount to convert.
 * @returns The resulting Gold value.
 */
export function convertGemsToGold(gems: Gems): Gold {
  return Math.floor(gems * GEM_TO_GOLD_FACTOR) as Gold;
}

/**
 * Calculates the Gem cost required to cover a specific Gold deficit.
 *
 * @param goldDeficit - The amount of missing Gold.
 * @returns The Gems required, rounded up (ceil).
 */
export function calculateGemCostForGold(goldDeficit: Gold): Gems {
  if (goldDeficit <= 0) return 0 as Gems;
  return Math.ceil(goldDeficit / GEM_TO_GOLD_FACTOR) as Gems;
}

/**
 * Adds two XP values.
 *
 * @param a - First XP value.
 * @param b - Second XP value.
 * @returns The sum as XP.
 */
export const addXP = (a: XP, b: XP): XP => (a + b) as XP;
