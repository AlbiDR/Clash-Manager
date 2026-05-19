// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect } from 'vitest';
import { ProjectionStrategy } from '../ScoringStrategy';
import type { UpgradeCandidate, OptimizationSettings } from '../Types';
import { asGems, asGold, asXP } from '@core/utils/economy';

describe('Laboratory Engine Components', () => {
  describe('FormulaicStrategy', () => {
    const strategy = new ProjectionStrategy();
    const mockSettings: OptimizationSettings = {
      allowGemSpending: false,
      infiniteResources: false,
      strategy: 'Resource Efficiency'
    };

    it('should produce lower scores (higher priority) for higher levels', () => {
      const lowLevelCandidate: UpgradeCandidate = {
        index: 0,
        card: { name: 'Test', rarity: 'Common', level: 13, count: 0, isTowerTroop: false },
        fromLevel: 13,
        toLevel: 14,
        goldCost: asGold(100),
        cardsRequired: 100,
        cardsUsed: 0,
        wildCardsUsed: 0,
        gemsUsed: asGems(0),
        xpGained: asXP(100),
        efficiencyIndex: 0
      };

      const highLevelCandidate: UpgradeCandidate = {
        ...lowLevelCandidate,
        fromLevel: 15,
        toLevel: 16
      };

      const score14 = strategy.calculateScore(lowLevelCandidate, mockSettings);
      const score16 = strategy.calculateScore(highLevelCandidate, mockSettings);

      // Score 16 should be significantly lower because of the growth incentive
      expect(score16).toBeLessThan(score14);
    });

    it('should never return NaN or Infinity', () => {
      const edgeCase: UpgradeCandidate = {
        index: 0,
        card: { name: 'Test', rarity: 'Common', level: 1, count: 0, isTowerTroop: false },
        fromLevel: 1,
        toLevel: 2,
        goldCost: asGold(0),
        cardsRequired: 0,
        cardsUsed: 0,
        wildCardsUsed: 0,
        gemsUsed: asGems(0),
        xpGained: asXP(0), // Division by zero risk
        efficiencyIndex: 0
      };

      const score = strategy.calculateScore(edgeCase, mockSettings);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).not.toBeNaN();
    });
  });
});
