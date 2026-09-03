// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateXpIntoLevel,
  calculateTotalXp,
  getKingLevelRow,
  calculateKingLevel,
  normalizeLevel,
  normalizeRarity,
  getUpgradeData,
  calculateDefaultTarget,
  getKingLevelBaseXp,
  calculateGemCostForCards
} from '../game';
import { asXP, asGems } from '../economy';

describe('Game Utilities - XP Math', () => {
  it('should correctly calculate XP into level from total XP', () => {
    // Level 1: 0, Level 2: 20
    expect(calculateXpIntoLevel(0)).toBe(0);
    expect(calculateXpIntoLevel(10)).toBe(10);
    expect(calculateXpIntoLevel(20)).toBe(0);
    expect(calculateXpIntoLevel(25)).toBe(5);
  });

  it('should correctly calculate total XP from level and relative progress', () => {
    // Level 2 starts at 20
    expect(calculateTotalXp(1, 10)).toBe(asXP(10));
    expect(calculateTotalXp(2, 0)).toBe(asXP(20));
    expect(calculateTotalXp(2, 5)).toBe(asXP(25));
  });

  it('should round-trip XP calculations correctly', () => {
    const totalXp = 1234;
    const level = calculateKingLevel(totalXp);
    const xpIntoLevel = calculateXpIntoLevel(totalXp);

    const recalculatedTotal = calculateTotalXp(level, xpIntoLevel);
    expect(recalculatedTotal).toBe(asXP(totalXp));
  });

  it('should handle edge cases and boundaries', () => {
    // Max Level (90): 27,438,770
    const maxLevelRow = getKingLevelRow(90);
    expect(maxLevelRow.level).toBe(90);

    const totalXpAtMax = Number(maxLevelRow.cumulative);
    expect(calculateKingLevel(totalXpAtMax)).toBe(90);
    expect(calculateXpIntoLevel(totalXpAtMax)).toBe(0);

    const totalXpBeyondMax = totalXpAtMax + 1000000;
    expect(calculateKingLevel(totalXpBeyondMax)).toBe(90);
    expect(calculateXpIntoLevel(totalXpBeyondMax)).toBe(1000000);
  });
});

describe('Game Utilities - Domain Logic', () => {
  describe('normalizeLevel', () => {
    it('should normalize Common levels (starts at 1)', () => {
      expect(normalizeLevel(1, 'Common')).toBe(1);
      expect(normalizeLevel(14, 'Common')).toBe(14);
    });

    it('should normalize Rare levels (starts at 3)', () => {
      // Relative 1 + (3-1) = 3
      expect(normalizeLevel(1, 'Rare')).toBe(3);
      // Relative 14 + 2 = 16
      expect(normalizeLevel(14, 'Rare')).toBe(16);
    });

    it('should normalize Champion levels (starts at 11)', () => {
      // Relative 1 + (11-1) = 11
      expect(normalizeLevel(1, 'Champion')).toBe(11);
      // Relative 6 + 10 = 16
      expect(normalizeLevel(6, 'Champion')).toBe(16);
    });

    it('should clamp to CARD_LEVEL_CAP (16)', () => {
      expect(normalizeLevel(20, 'Common')).toBe(16);
      expect(normalizeLevel(10, 'Champion')).toBe(16);
    });

    it('should clamp to minimum level 1', () => {
      expect(normalizeLevel(-5, 'Common')).toBe(1);
    });
  });

  describe('normalizeRarity', () => {
    it('should handle case insensitivity', () => {
      expect(normalizeRarity('common')).toBe('Common');
      expect(normalizeRarity('RARE')).toBe('Rare');
      expect(normalizeRarity('ePiC')).toBe('Epic');
    });

    it('should trim whitespace', () => {
      expect(normalizeRarity('  legendary  ')).toBe('Legendary');
    });

    it('should fallback to Common for unknown rarities', () => {
      expect(normalizeRarity('mythic')).toBe('Common');
      expect(normalizeRarity('')).toBe('Common');
    });
  });

  describe('getUpgradeData', () => {
    it('should return valid data for known upgrades', () => {
      const data = getUpgradeData('Common', 14);
      expect(data).not.toBeNull();
      expect(data?.goldCost).toBe(60000);
      expect(data?.cardsRequired).toBe(3500);
      expect(data?.xpGain).toBe(asXP(2000));
    });

    it('should return null for out-of-bounds levels', () => {
      expect(getUpgradeData('Common', 1)).toBeNull(); // No upgrade to level 1
      expect(getUpgradeData('Common', 17)).toBeNull();
    });

    it('should return null for invalid rarity first-level boundaries', () => {
      // Epic starts at absolute L6, so first upgrade is to L7
      expect(getUpgradeData('Epic', 6)).toBeNull();
      expect(getUpgradeData('Epic', 7)).not.toBeNull();
    });
  });

  describe('calculateDefaultTarget', () => {
    it('should find the next milestone level', () => {
      // Milestones: 2, 3, 5, 7, 10, 14, ...
      expect(calculateDefaultTarget(1)).toBe(2);
      expect(calculateDefaultTarget(2)).toBe(3);
      expect(calculateDefaultTarget(3)).toBe(5);
      expect(calculateDefaultTarget(12)).toBe(14);
    });

    it('should fallback to level + 1 if beyond known milestones', () => {
      // KING_LEVEL_MAX is 90
      expect(calculateDefaultTarget(90)).toBe(91);
    });
  });

  describe('getKingLevelBaseXp', () => {
    it('should return cumulative XP for valid level', () => {
      // Level 2 starts at 20
      expect(getKingLevelBaseXp(2)).toBe(asXP(20));
    });

    it('should return 0 for level 1', () => {
      expect(getKingLevelBaseXp(1)).toBe(asXP(0));
    });

    it('should return 0 for invalid levels', () => {
      expect(getKingLevelBaseXp(0)).toBe(asXP(0));
      expect(getKingLevelBaseXp(999)).toBe(asXP(0));
    });
  });

  describe('calculateGemCostForCards', () => {
    it('should calculate cost correctly for positive deficit', () => {
      // Common rate: 0.36
      // 100 * 0.36 = 36
      expect(calculateGemCostForCards('Common', 100)).toBe(asGems(36));

      // Rare rate: 2.14
      // 10 * 2.14 = 21.4 -> ceil -> 22
      expect(calculateGemCostForCards('Rare', 10)).toBe(asGems(22));
    });

    it('should return 0 for zero or negative deficit', () => {
      expect(calculateGemCostForCards('Common', 0)).toBe(asGems(0));
      expect(calculateGemCostForCards('Common', -50)).toBe(asGems(0));
    });

    it('should handle high-cost rarities', () => {
      // Champion rate: 400
      expect(calculateGemCostForCards('Champion', 1)).toBe(asGems(400));
    });
  });
});
