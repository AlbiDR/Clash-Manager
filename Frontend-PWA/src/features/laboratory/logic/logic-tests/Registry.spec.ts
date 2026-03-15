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
  IMPORTANT_KING_LEVELS
} from '../Registry';

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
    it('should have costs for levels 2 through 16', () => {
      for (let level = 2; level <= CARD_LEVEL_CAP; level++) {
        expect(GOLD_COST_TABLE).toHaveProperty(level.toString());
        expect(Number(GOLD_COST_TABLE[level])).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have increasing costs', () => {
        for (let level = 3; level <= CARD_LEVEL_CAP; level++) {
            expect(Number(GOLD_COST_TABLE[level])).toBeGreaterThanOrEqual(Number(GOLD_COST_TABLE[level - 1]));
        }
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
        // Let's just check that there are entries and they are positive
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
});
