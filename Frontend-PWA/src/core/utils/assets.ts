// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ASSET RESOLUTION UTILITIES (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralized resolution for game-specific static assets.
 * Following ADR Section II, this ensures path consistency across the PWA shell
 * and its various features while correctly handling the application's base URL.
 * ----------------------------------------------------------------------------
 */

const BASE_URL = import.meta.env.BASE_URL;

/**
 * Canonical RoyaleAPI platform mark used wherever the destination is named.
 * Keeping the asset address here prevents the card action and Settings link
 * rows from quietly drifting into different visual identities.
 */
export const ROYALE_API_LOGO_URL = "https://cdn.royaleapi.com/static/img/branding/royaleapi-logo-128.png";

/**
 * Resolves the path for a game currency icon.
 *
 * @param currency - The currency name ('gold', 'gem', 'xp').
 * @returns The absolute URL path to the webp asset.
 */
export function getCurrencyAsset(currency: 'gold' | 'gem' | 'xp'): string {
  return `${BASE_URL}assets/game/currency-${currency}.webp`;
}

/**
 * Resolves the path for a wildcard icon based on rarity.
 *
 * @param rarity - The card rarity (e.g., 'common', 'rare', 'epic', 'legendary', 'champion').
 * @returns The absolute URL path to the webp asset.
 */
export function getWildcardAsset(rarity: string): string {
  return `${BASE_URL}assets/game/wildcard-${rarity.toLowerCase()}.webp`;
}

/**
 * Resolves the path for the tower level icon.
 *
 * @returns The absolute URL path to the webp asset.
 */
export function getTowerLevelAsset(): string {
  return `${BASE_URL}assets/game/tower-level.webp`;
}
