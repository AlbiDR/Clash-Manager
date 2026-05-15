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
} from '../game';

describe('Game Core Domain Logic', () => {
  describe('Constants', () => {
    it('should have a consistent CARD_LEVEL_CAP', () => {
      expect(CARD_LEVEL_CAP).toBe(16);
    });

    it('should define start levels for all rarities', () => {
      expect(CARD_RARITY_START_LEVELS.Common).toBe(1);
      expect(CARD_RARITY_START_LEVELS.Rare).toBe(3);
      expect(CARD_RARITY_START_LEVELS.Epic).toBe(6);
      expect(CARD_RARITY_START_LEVELS.Legendary).toBe(9);
      expect(CARD_RARITY_START_LEVELS.Champion).toBe(11);
    });
  });

  describe('normalizeRarity()', () => {
    it('should normalize valid rarity strings regardless of case', () => {
      expect(normalizeRarity('common')).toBe('Common');
      expect(normalizeRarity('RARE')).toBe('Rare');
      expect(normalizeRarity('ePiC')).toBe('Epic');
      expect(normalizeRarity('Legendary')).toBe('Legendary');
      expect(normalizeRarity('champion')).toBe('Champion');
    });

    it('should trim whitespace', () => {
      expect(normalizeRarity('  common  ')).toBe('Common');
    });

    it('should fallback to Common for unknown strings', () => {
      expect(normalizeRarity('unknown')).toBe('Common');
      expect(normalizeRarity('')).toBe('Common');
    });
  });

  describe('normalizeLevel()', () => {
    it('should correctly normalize Common levels (offset 0)', () => {
      expect(normalizeLevel(1, 'Common')).toBe(1);
      expect(normalizeLevel(14, 'Common')).toBe(14);
    });

    it('should correctly normalize Rare levels (offset 2)', () => {
      expect(normalizeLevel(1, 'Rare')).toBe(3);
      expect(normalizeLevel(11, 'Rare')).toBe(13);
    });

    it('should correctly normalize Epic levels (offset 5)', () => {
      expect(normalizeLevel(1, 'Epic')).toBe(6);
      expect(normalizeLevel(9, 'Epic')).toBe(14);
    });

    it('should correctly normalize Legendary levels (offset 8)', () => {
      expect(normalizeLevel(1, 'Legendary')).toBe(9);
      expect(normalizeLevel(5, 'Legendary')).toBe(13);
    });

    it('should correctly normalize Champion levels (offset 10)', () => {
      expect(normalizeLevel(1, 'Champion')).toBe(11);
      expect(normalizeLevel(4, 'Champion')).toBe(14);
    });

    it('should clamp to CARD_LEVEL_CAP', () => {
      expect(normalizeLevel(20, 'Common')).toBe(16);
      expect(normalizeLevel(15, 'Rare')).toBe(16);
      expect(normalizeLevel(10, 'Champion')).toBe(16);
    });

    it('should clamp to minimum level 1', () => {
      expect(normalizeLevel(0, 'Common')).toBe(1);
      expect(normalizeLevel(-5, 'Common')).toBe(1);
    });

    it('should handle invalid rarity by defaulting to offset 0', () => {
      // @ts-expect-error testing runtime fallback
      expect(normalizeLevel(5, 'Invalid')).toBe(5);
    });
  });

  describe('King Level Engine', () => {
    describe('calculateKingLevel()', () => {
      it('should return level 1 for 0 XP', () => {
        expect(calculateKingLevel(0)).toBe(1);
      });

      it('should return level 2 for exactly 20 XP', () => {
        expect(calculateKingLevel(20)).toBe(2);
      });

      it('should return level 1 for XP just below level 2 (19)', () => {
        expect(calculateKingLevel(19)).toBe(1);
      });

      it('should return level 10 for exactly 770 XP', () => {
        expect(calculateKingLevel(770)).toBe(10);
      });

      it('should return level 10 for XP between level 10 and 11 (800)', () => {
        expect(calculateKingLevel(800)).toBe(10);
      });

      it('should return level 90 for exactly 27,438,770 XP', () => {
        expect(calculateKingLevel(27438770)).toBe(90);
      });

      it('should handle extreme XP values (clamping to max level)', () => {
        expect(calculateKingLevel(1000000000)).toBe(90);
      });

      it('should handle negative XP as level 1', () => {
        expect(calculateKingLevel(-100)).toBe(1);
      });
    });

    describe('getKingLevelBaseXp()', () => {
      it('should return correct base XP for defined levels', () => {
        expect(Number(getKingLevelBaseXp(1))).toBe(0);
        expect(Number(getKingLevelBaseXp(2))).toBe(20);
        expect(Number(getKingLevelBaseXp(14))).toBe(1770);
        expect(Number(getKingLevelBaseXp(90))).toBe(27438770);
      });

      it('should return 0 for out-of-bounds levels', () => {
        expect(Number(getKingLevelBaseXp(0))).toBe(0);
        expect(Number(getKingLevelBaseXp(91))).toBe(0);
      });
    });

    describe('calculateDefaultTarget()', () => {
      it('should return the next milestone from IMPORTANT_KING_LEVELS', () => {
        expect(calculateDefaultTarget(1)).toBe(2);
        expect(calculateDefaultTarget(2)).toBe(3);
        expect(calculateDefaultTarget(3)).toBe(5);
        expect(calculateDefaultTarget(4)).toBe(5);
        expect(calculateDefaultTarget(10)).toBe(14);
        expect(calculateDefaultTarget(85)).toBe(90);
      });

      it('should return level + 1 if beyond the last milestone', () => {
        expect(calculateDefaultTarget(90)).toBe(91);
        expect(calculateDefaultTarget(95)).toBe(96);
      });
    });
  });

  describe('Economic Calculations', () => {
    describe('calculateGemCostForCards()', () => {
      it('should return 0 for non-positive deficit', () => {
        expect(Number(calculateGemCostForCards('Common', 0))).toBe(0);
        expect(Number(calculateGemCostForCards('Common', -5))).toBe(0);
      });

      it('should correctly calculate and round up gem costs', () => {
        // Common: 0.36 -> 10 * 0.36 = 3.6 -> 4
        expect(Number(calculateGemCostForCards('Common', 10))).toBe(4);
        // Rare: 2.14 -> 10 * 2.14 = 21.4 -> 22
        expect(Number(calculateGemCostForCards('Rare', 10))).toBe(22);
        // Epic: ~21.67 -> 1 * 21.67 = 21.67 -> 22
        expect(Number(calculateGemCostForCards('Epic', 1))).toBe(22);
        // Legendary: 210 -> 2 * 210 = 420
        expect(Number(calculateGemCostForCards('Legendary', 2))).toBe(420);
        // Champion: 400 -> 1 * 400 = 400
        expect(Number(calculateGemCostForCards('Champion', 1))).toBe(400);
      });
    });

    describe('Data Integrity (GOLD_COST_TABLE & MATERIAL_REQUIREMENTS)', () => {
      it('should have reference-verified upgrade discounts', () => {
        // Epic's first upgrade (L6->L7) is 400g
        expect(Number(GOLD_COST_TABLE.Epic[7])).toBe(400);
        // Legendary's first upgrade (L9->L10) is 5000g
        expect(Number(GOLD_COST_TABLE.Legendary[10])).toBe(5000);
      });

      it('should have consistent max level costs', () => {
        expect(Number(GOLD_COST_TABLE.Common[16])).toBe(120000);
        expect(Number(GOLD_COST_TABLE.Champion[16])).toBe(120000);
      });

      it('should define material requirements for all levels', () => {
        expect(MATERIAL_REQUIREMENTS.Common[16]).toBe(7500);
        expect(MATERIAL_REQUIREMENTS.Rare[16]).toBe(1400);
        expect(MATERIAL_REQUIREMENTS.Epic[16]).toBe(180);
        expect(MATERIAL_REQUIREMENTS.Legendary[16]).toBe(20);
        expect(MATERIAL_REQUIREMENTS.Champion[16]).toBe(15);
      });
    });

    describe('CARD_XP_TABLE', () => {
      it('should define XP gains for core levels', () => {
        expect(Number(CARD_XP_TABLE[2])).toBe(4);
        expect(Number(CARD_XP_TABLE[14])).toBe(2000);
        expect(Number(CARD_XP_TABLE[16])).toBe(200000);
      });
    });
  });
});
