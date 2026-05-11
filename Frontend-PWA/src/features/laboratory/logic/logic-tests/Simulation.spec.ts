// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import {
  calculateProgressionPath,
  mapStateToResult
} from '../Simulation';
import { calculateKingLevel } from '../Registry';
import { asGold, asGems, asXP } from '@core/utils/economy';
import type { SimulationState, OptimizationSettings, Card, PlayerProfile } from '../Types';

describe('Laboratory Simulation Engine', () => {
  const mockCard: Card = {
    name: 'Tesla',
    rarity: 'Common',
    level: 14,
    count: 10000,
    isTowerTroop: false
  };

  const initialState: SimulationState = {
    roster: [mockCard],
    inventory: {
      gold: asGold(1000000),
      gems: asGems(1000),
      wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
    },
    totalXp: asXP(0),
    totalGoldSpent: asGold(0),
    totalGemsSpent: asGems(0),
    totalWildCardsUsed: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
    history: []
  };

  const settings: OptimizationSettings = {
    strategy: 'Level Projection',
    allowGemSpending: false,
    infiniteResources: false,
    targetLevel: 50
  };

  describe('calculateProgressionPath', () => {
    it('should yield progressive states until it cannot upgrade further (Infinite Mode)', () => {
      const generator = calculateProgressionPath(initialState, { ...settings, infiniteResources: true });

      // First step: Level 14 -> 15 (Costs 90k gold)
      const step1 = generator.next();
      expect(step1.done).toBe(false);
      expect(step1.value.roster[0].level).toBe(15);
      expect(Number(step1.value.totalGoldSpent)).toBe(90000);

      // Second step: Level 15 -> 16 (Costs 120k gold)
      const step2 = generator.next();
      expect(step2.done).toBe(false);
      expect(step2.value.roster[0].level).toBe(16);
      expect(Number(step2.value.totalGoldSpent)).toBe(210000); // 90k + 120k

      // Done (Level 16 is cap)
      const final = generator.next();
      expect(final.done).toBe(true);
    });

    it('should respect target level in Projection strategy', () => {
      const limitedSettings: OptimizationSettings = {
        ...settings,
        targetLevel: 2 // Level 2 requires 20 cumulative XP
      };

      // Common level 15 upgrade gives 50,000 XP
      const generator = calculateProgressionPath(initialState, limitedSettings);
      const step1 = generator.next();
      expect(step1.done).toBe(false);
      expect(calculateKingLevel(Number(step1.value.totalXp))).toBeGreaterThanOrEqual(2);

      const finish = generator.next();
      expect(finish.done).toBe(true);
    });

    it('should stop when resources are depleted in Real Resources mode', () => {
      const poorState: SimulationState = {
        ...initialState,
        inventory: {
          ...initialState.inventory,
          gold: asGold(5000) // Level 15 upgrade costs 90,000
        }
      };

      const generator = calculateProgressionPath(poorState, settings);
      const first = generator.next();
      expect(first.done).toBe(true);
    });

    it('should use Wild Cards when card count is low', () => {
      const lowCountCard: Card = { ...mockCard, count: 0 };
      const wildCardState: SimulationState = {
        ...initialState,
        roster: [lowCountCard],
        inventory: {
          ...initialState.inventory,
          wildCards: { ...initialState.inventory.wildCards, Common: 10000 }
        }
      };

      const generator = calculateProgressionPath(wildCardState, settings);
      const step1 = generator.next();
      expect(step1.done).toBe(false);
      expect(step1.value.history[0].wildCardsUsed).toBe(5500); // Common Lvl 15 req
      expect(step1.value.inventory.wildCards.Common).toBe(4500);
    });

    it('should convert Gems for material deficit when allowed', () => {
      const lowCountCard: Card = { ...mockCard, count: 0 };
      const gemState: SimulationState = {
        ...initialState,
        roster: [lowCountCard],
        inventory: {
          ...initialState.inventory,
          gems: asGems(100000),
          wildCards: { ...initialState.inventory.wildCards, Common: 0 }
        }
      };

      const gemSettings: OptimizationSettings = { ...settings, allowGemSpending: true };
      const generator = calculateProgressionPath(gemState, gemSettings);
      const step1 = generator.next();

      expect(step1.done).toBe(false);
      expect(Number(step1.value.history[0].gemsUsed)).toBeGreaterThan(0);
      expect(step1.value.history[0].upgradeType).toBe('Gem');
      expect(Number(step1.value.inventory.gems)).toBeLessThan(100000);
    });

    it('should convert Gems for gold deficit when allowed', () => {
      const gemState: SimulationState = {
        ...initialState,
        inventory: {
          ...initialState.inventory,
          gold: asGold(0),
          gems: asGems(100000)
        }
      };

      const gemSettings: OptimizationSettings = { ...settings, allowGemSpending: true };
      const generator = calculateProgressionPath(gemState, gemSettings);
      const step1 = generator.next();

      expect(step1.done).toBe(false);
      // Gold deficit for level 15 is 90,000. 90,000 / 20 = 4500 gems.
      expect(Number(step1.value.history[0].gemsUsed)).toBe(4500);
      expect(Number(step1.value.inventory.gems)).toBe(95500);
    });

    it('should reject upgrade if gems are insufficient', () => {
      const gemState: SimulationState = {
        ...initialState,
        inventory: {
          ...initialState.inventory,
          gold: asGold(0),
          gems: asGems(10) // Need 4500 gems
        }
      };

      const gemSettings: OptimizationSettings = { ...settings, allowGemSpending: true };
      const generator = calculateProgressionPath(gemState, gemSettings);
      const first = generator.next();
      expect(first.done).toBe(true);
    });
  });

  describe('calculateKingLevel', () => {
    it('should return correct level for XP thresholds', () => {
      expect(calculateKingLevel(0)).toBe(1);
      expect(calculateKingLevel(19)).toBe(1);
      expect(calculateKingLevel(20)).toBe(2);
      expect(calculateKingLevel(69)).toBe(2);
      expect(calculateKingLevel(70)).toBe(3);
      expect(calculateKingLevel(11000000)).toBe(80);
      expect(calculateKingLevel(27438770)).toBe(90);
      expect(calculateKingLevel(99999999)).toBe(90);
    });
  });

  describe('mapStateToResult', () => {
    it('should correctly transform SimulationState to OptimizationResult', () => {
      const mockProfile: PlayerProfile = {
        name: 'Player',
        tag: 'TAG',
        kingLevel: 1,
        xpIntoLevel: 0
      };

      const finalState: SimulationState = {
        ...initialState,
        totalXp: asXP(50000), // Level 15
        inventory: {
          ...initialState.inventory,
          gold: asGold(910000)
        },
        totalGoldSpent: asGold(90000),
        history: [{
          cardName: 'Tesla',
          rarity: 'Common',
          currentLevel: 14,
          targetLevel: 15,
          goldCost: asGold(90000),
          cardCost: 5500,
          wildCardsUsed: 0,
          gemsUsed: asGems(0),
          xpGained: asXP(50000),
          efficiencyIndex: 1,
          upgradeType: 'Direct',
          isTowerTroop: false
        }]
      };

      // Gain 50k XP starting from Level 10 (770 cumulative)
      // 770 + 50,000 = 50,770
      // Table says Level 31 starts at 45,770, Level 32 at 53,770
      const result = mapStateToResult(finalState, mockProfile, 0);

      expect(result.projectedKingLevel).toBe(31);
      expect(result.totalXpGained).toBe(50000);
      expect(result.finalGold).toBe(910000);
      expect(result.totalGoldSpent).toBe(90000);
      expect(result.actions).toHaveLength(1);
      expect(result.finalProfile.kingLevel).toBe(31);
      expect(result.finalProfile.xpIntoLevel).toBe(4230); // 50000 - 45770 (Level 31 start)
    });
  });
});
