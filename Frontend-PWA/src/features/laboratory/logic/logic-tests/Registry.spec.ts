// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import {
  CARD_LEVEL_CAP,
  CARD_RARITY_START_LEVELS,
  GOLD_COST_TABLE,
  CARD_XP_TABLE,
  MATERIAL_REQUIREMENTS,
  GEM_CONVERSION_RATES,
  KING_XP_TABLE,
  IMPORTANT_KING_LEVELS,
  calculateKingLevel,
  calculateDefaultTarget,
  normalizeLevel,
  normalizeRarity,
  getKingLevelBaseXp,
  calculateGemCostForCards
} from '@core/utils/game';
import { getUpgradeData } from '../Registry';

describe('Laboratory Registry', () => {
  it('should have a consistent CARD_LEVEL_CAP', () => {
    expect(CARD_LEVEL_CAP).toBe(16);
  });

  describe('CARD_RARITY_START_LEVELS', () => {
    it('should define start levels for all rarities', () => {
      const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'];
      rarities.forEach(rarity => {
        expect(CARD_RARITY_START_LEVELS).toHaveProperty(rarity);
        expect(CARD_RARITY_START_LEVELS[rarity as keyof typeof CARD_RARITY_START_LEVELS]).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('GOLD_COST_TABLE', () => {
    const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'] as const;

    it('should define costs for all rarities', () => {
      rarities.forEach(rarity => {
        expect(GOLD_COST_TABLE).toHaveProperty(rarity);
        const levels = Object.keys(GOLD_COST_TABLE[rarity]).map(Number);
        expect(levels.length).toBeGreaterThan(0);
      });
    });

    it('should have non-negative gold costs for every defined level', () => {
      rarities.forEach(rarity => {
        Object.values(GOLD_COST_TABLE[rarity]).forEach(cost => {
          expect(Number(cost)).toBeGreaterThanOrEqual(0);
        });
      });
    });

    it('should have non-decreasing costs within each rarity', () => {
      rarities.forEach(rarity => {
        const levels = Object.keys(GOLD_COST_TABLE[rarity]).map(Number).sort((a, b) => a - b);
        for (let i = 1; i < levels.length; i++) {
          expect(Number(GOLD_COST_TABLE[rarity][levels[i]])).toBeGreaterThanOrEqual(
            Number(GOLD_COST_TABLE[rarity][levels[i - 1]])
          );
        }
      });
    });

    it('should use reference-verified values for rarity-specific first-upgrade discounts', () => {
      // Epic's first upgrade step (L6→L7) costs 400g, not 1000g.
      expect(Number(GOLD_COST_TABLE['Epic'][7])).toBe(400);
      // Legendary's first upgrade step (L9→L10) costs 5000g, not 8000g.
      expect(Number(GOLD_COST_TABLE['Legendary'][10])).toBe(5000);
      // All rarities share the same cost at the top levels.
      expect(Number(GOLD_COST_TABLE['Common'][16])).toBe(120000);
      expect(Number(GOLD_COST_TABLE['Champion'][16])).toBe(120000);
    });
  });

  describe('CARD_XP_TABLE', () => {
    it('should have XP values for levels 2 through 16', () => {
      for (let level = 2; level <= CARD_LEVEL_CAP; level++) {
        expect(CARD_XP_TABLE).toHaveProperty(level.toString());
        expect(Number(CARD_XP_TABLE[level])).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('MATERIAL_REQUIREMENTS', () => {
    it('should define requirements for all rarities', () => {
      const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'] as const;
      rarities.forEach(rarity => {
        expect(MATERIAL_REQUIREMENTS).toHaveProperty(rarity);
        const startLevel = CARD_RARITY_START_LEVELS[rarity];
        // Requirements usually start from (startLevel + 1) or specific to the rarity
        const levels = Object.keys(MATERIAL_REQUIREMENTS[rarity]).map(Number);
        expect(levels.length).toBeGreaterThan(0);
        levels.forEach(level => {
            expect(MATERIAL_REQUIREMENTS[rarity][level]).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('GEM_CONVERSION_RATES', () => {
    it('should define rates for all rarities', () => {
      const rarities = ['Common', 'Rare', 'Epic', 'Legendary', 'Champion'] as const;
      rarities.forEach(rarity => {
        expect(GEM_CONVERSION_RATES).toHaveProperty(rarity);
        expect(GEM_CONVERSION_RATES[rarity]).toBeGreaterThan(0);
      });
    });
  });

  describe('KING_XP_TABLE', () => {
    it('should have 90 levels', () => {
      expect(KING_XP_TABLE).toHaveLength(90);
    });

    it('should have monotonically increasing cumulative XP', () => {
      for (let i = 1; i < KING_XP_TABLE.length; i++) {
        expect(Number(KING_XP_TABLE[i].cumulative)).toBeGreaterThanOrEqual(Number(KING_XP_TABLE[i - 1].cumulative));
        expect(KING_XP_TABLE[i].level).toBe(KING_XP_TABLE[i - 1].level + 1);
      }
    });

    it('should start at level 1 with 0 cumulative XP', () => {
        expect(KING_XP_TABLE[0].level).toBe(1);
        expect(Number(KING_XP_TABLE[0].cumulative)).toBe(0);
    });
  });

  describe('IMPORTANT_KING_LEVELS', () => {
    it('should be an array of numbers', () => {
      expect(Array.isArray(IMPORTANT_KING_LEVELS)).toBe(true);
      expect(IMPORTANT_KING_LEVELS.length).toBeGreaterThan(0);
      IMPORTANT_KING_LEVELS.forEach(level => {
        expect(typeof level).toBe('number');
      });
    });
  });

  describe('calculateKingLevel()', () => {
    it('should return 1 for 0 XP', () => {
      expect(calculateKingLevel(0)).toBe(1);
    });

    it('should return level 2 for 20 XP', () => {
      expect(calculateKingLevel(20)).toBe(2);
    });

    it('should return level 2 for 69 XP', () => {
      expect(calculateKingLevel(69)).toBe(2);
    });

    it('should return level 10 for 770 XP', () => {
      expect(calculateKingLevel(770)).toBe(10);
    });

    it('should handle max level XP', () => {
      const maxLevelEntry = KING_XP_TABLE[KING_XP_TABLE.length - 1];
      expect(calculateKingLevel(Number(maxLevelEntry.cumulative))).toBe(maxLevelEntry.level);
    });

    it('should handle XP beyond max defined level', () => {
      const maxLevelEntry = KING_XP_TABLE[KING_XP_TABLE.length - 1];
      expect(calculateKingLevel(Number(maxLevelEntry.cumulative) + 1000000)).toBe(maxLevelEntry.level);
    });
  });

  describe('calculateDefaultTarget()', () => {
    it('should return the next milestone correctly', () => {
      expect(calculateDefaultTarget(1)).toBe(2);
      expect(calculateDefaultTarget(2)).toBe(3);
      expect(calculateDefaultTarget(3)).toBe(5);
      expect(calculateDefaultTarget(10)).toBe(14);
    });

    it('should return level + 1 if beyond last milestone', () => {
      const lastMilestone = IMPORTANT_KING_LEVELS[IMPORTANT_KING_LEVELS.length - 1];
      expect(calculateDefaultTarget(lastMilestone)).toBe(lastMilestone + 1);
    });
  });

  describe('normalizeLevel()', () => {
    it('should normalize relative levels to absolute levels', () => {
      expect(normalizeLevel(1, "Common")).toBe(1);
      expect(normalizeLevel(11, "Common")).toBe(11);
      expect(normalizeLevel(1, "Rare")).toBe(3);
      expect(normalizeLevel(14, "Rare")).toBe(16);
      expect(normalizeLevel(1, "Epic")).toBe(6);
      expect(normalizeLevel(1, "Legendary")).toBe(9);
      expect(normalizeLevel(1, "Champion")).toBe(11);
    });

    it('should respect CARD_LEVEL_CAP', () => {
      expect(normalizeLevel(20, "Common")).toBe(16);
      expect(normalizeLevel(10, "Champion")).toBe(16);
    });

    it('should respect minimum level 1', () => {
      expect(normalizeLevel(-10, "Common")).toBe(1);
    });
  });

  describe('normalizeRarity()', () => {
    it('should normalize valid rarity strings', () => {
      expect(normalizeRarity("Common")).toBe("Common");
      expect(normalizeRarity("rare")).toBe("Rare");
      expect(normalizeRarity("  EPIC  ")).toBe("Epic");
    });

    it('should fallback to Common for unknown strings', () => {
      expect(normalizeRarity("unknown")).toBe("Common");
      expect(normalizeRarity("")).toBe("Common");
    });
  });

  describe('getKingLevelBaseXp()', () => {
    it('should return correct base XP for levels', () => {
      expect(Number(getKingLevelBaseXp(1))).toBe(0);
      expect(Number(getKingLevelBaseXp(2))).toBe(20);
      expect(Number(getKingLevelBaseXp(50))).toBe(403770);
    });

    it('should return 0 for invalid levels', () => {
      expect(Number(getKingLevelBaseXp(0))).toBe(0);
      expect(Number(getKingLevelBaseXp(100))).toBe(0);
    });
  });

  describe('calculateGemCostForCards()', () => {
    it('should return 0 for non-positive deficit', () => {
      expect(Number(calculateGemCostForCards("Common", 0))).toBe(0);
      expect(Number(calculateGemCostForCards("Common", -10))).toBe(0);
    });

    it('should calculate gem cost and round up', () => {
      // Common rate is 0.36. 10 * 0.36 = 3.6 -> 4
      expect(Number(calculateGemCostForCards("Common", 10))).toBe(4);
      // Rare rate is 2.14. 10 * 2.14 = 21.4 -> 22
      expect(Number(calculateGemCostForCards("Rare", 10))).toBe(22);
      // Legendary rate is 210. 1 * 210 = 210
      expect(Number(calculateGemCostForCards("Legendary", 1))).toBe(210);
    });
  });

  describe('getUpgradeData()', () => {
    it('should return upgrade data for valid level and rarity', () => {
      const data = getUpgradeData("Common", 14);
      expect(data).not.toBeNull();
      expect(data?.cardsRequired).toBe(3500);
      expect(Number(data?.goldCost)).toBe(60000);
      expect(Number(data?.xpGain)).toBe(2000);
    });

    it('should return null for invalid target level', () => {
      expect(getUpgradeData("Common", 1)).toBeNull(); // Upgrades start at level 2
      expect(getUpgradeData("Common", 17)).toBeNull(); // Above cap
    });

    it('should return null for target level not applicable to rarity', () => {
      expect(getUpgradeData("Champion", 5)).toBeNull(); // Champions start at level 11, first upgrade is 12
    });
  });
});
