// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import { mapStateToResult } from '../SimulationMappers';
import { asGold, asGems, asXP } from '@core/utils/economy';
import type { SimulationState, PlayerProfile } from '../Types';

describe('SimulationMappers', () => {
  const mockProfile: PlayerProfile = {
    name: 'Player',
    tag: 'TAG',
    kingLevel: 1,
    xpIntoLevel: 0
  };

  const initialState: SimulationState = {
    roster: [],
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

  describe('mapStateToResult', () => {
    it('should correctly transform SimulationState to OptimizationResult', () => {
      const finalState: SimulationState = {
        ...initialState,
        totalXp: asXP(50000), // Level 31 (starts at 45770 cumulative)
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

      const result = mapStateToResult(finalState, mockProfile, 0);

      expect(result.projectedKingLevel).toBe(31);
      expect(result.totalXpGained).toBe(50000);
      expect(result.finalGold).toBe(910000);
      expect(result.totalGoldSpent).toBe(90000);
      expect(result.actions).toHaveLength(1);
      expect(result.finalProfile.kingLevel).toBe(31);
      expect(result.finalProfile.xpIntoLevel).toBe(4230); // 50000 - 45770
    });

    it('should handle zero XP gain', () => {
       const result = mapStateToResult(initialState, mockProfile, 0);
       expect(result.totalXpGained).toBe(0);
       expect(result.projectedKingLevel).toBe(1);
       expect(result.finalProfile.xpIntoLevel).toBe(0);
    });

    it('should calculate xpIntoLevel correctly for high levels', () => {
      const highXpState: SimulationState = {
        ...initialState,
        totalXp: asXP(10938770 + 500) // Level 80 starts at 10938770
      };
      const result = mapStateToResult(highXpState, mockProfile, 0);
      expect(result.projectedKingLevel).toBe(80);
      expect(result.finalProfile.xpIntoLevel).toBe(500);
    });
  });
});
