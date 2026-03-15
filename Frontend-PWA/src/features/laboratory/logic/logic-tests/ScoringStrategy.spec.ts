import { describe, it, expect } from 'vitest';
import { ProjectionStrategy, InventoryStrategy, LookaheadStrategy } from '../ScoringStrategy';
import { GEM_TO_GOLD_FACTOR, asGold, asGems, asXP } from '@core/utils/economy';
import type { UpgradeCandidate, OptimizationSettings } from '../Types';

describe('ScoringStrategy', () => {
  const mockCandidate = (overrides: Partial<UpgradeCandidate> = {}): UpgradeCandidate => ({
    index: 0,
    card: {} as any,
    fromLevel: 13,
    toLevel: 14,
    goldCost: asGold(1000),
    cardsRequired: 100,
    cardsUsed: 100,
    wildCardsUsed: 0,
    gemsUsed: asGems(0),
    xpGained: asXP(100),
    efficiencyIndex: 0,
    ...overrides
  });

  const mockSettings: OptimizationSettings = {
    strategy: 'Level Projection',
    allowGemSpending: true,
    infiniteResources: false
  };

  describe('ProjectionStrategy', () => {
    const strategy = new ProjectionStrategy();

    it('should calculate basic score correctly', () => {
      const candidate = mockCandidate({ goldCost: asGold(1000), xpGained: asXP(100), toLevel: 14 });
      const score = strategy.calculateScore(candidate, mockSettings);
      // score = 1000 / 100 = 10
      expect(score).toBe(10);
    });

    it('should handle zero XP gain gracefully', () => {
      const candidate = mockCandidate({ goldCost: asGold(1000), xpGained: asXP(0), toLevel: 14 });
      const score = strategy.calculateScore(candidate, mockSettings);
      // score = 1000 / 1 = 1000
      expect(score).toBe(1000);
    });

    it('should apply small gem penalty and cheap effective cost', () => {
      const candidate = mockCandidate({
        goldCost: asGold(1000),
        gemsUsed: asGems(10),
        xpGained: asXP(100),
        toLevel: 14
      });
      const score = strategy.calculateScore(candidate, mockSettings);

      // effectiveCost = 1000 + (10 * 20 * 0.1) = 1000 + 20 = 1020
      // baseScore = 1020 / 100 = 10.2
      // penalty = 10.2 * 1.1 = 11.22
      expect(score).toBeCloseTo(11.22);
    });

    it('should apply aggressive incentive for Level 15', () => {
      const candidate = mockCandidate({ toLevel: 15, goldCost: asGold(1000), xpGained: asXP(100) });
      const score = strategy.calculateScore(candidate, mockSettings);

      // baseScore = 1000 / 100 = 10
      // incentive = 1 + (max(0, 15 - 13) ^ 2.5) = 1 + (2 ^ 2.5) = 1 + 5.6568... = 6.6568...
      // score = 10 / 6.6568... = 1.5022...
      const expectedIncentive = 1 + Math.pow(2, 2.5);
      expect(score).toBeCloseTo(10 / expectedIncentive);
    });

    it('should apply even more aggressive incentive for Level 16', () => {
      const candidate = mockCandidate({ toLevel: 16, goldCost: asGold(1000), xpGained: asXP(100) });
      const score = strategy.calculateScore(candidate, mockSettings);

      // baseScore = 1000 / 100 = 10
      // incentive = 1 + (max(0, 16 - 13) ^ 2.5) = 1 + (3 ^ 2.5) = 1 + 15.588... = 16.588...
      // score = 10 / 16.588... = 0.6028...
      const expectedIncentive = 1 + Math.pow(3, 2.5);
      expect(score).toBeCloseTo(10 / expectedIncentive);
    });
  });

  describe('InventoryStrategy', () => {
    const strategy = new InventoryStrategy();

    it('should calculate basic ROI correctly', () => {
      const candidate = mockCandidate({ goldCost: asGold(1000), xpGained: asXP(100), toLevel: 14 });
      const score = strategy.calculateScore(candidate, mockSettings);
      // score = 1000 / 100 = 10
      expect(score).toBe(10);
    });

    it('should heavily penalize gem spending', () => {
      const candidate = mockCandidate({
        goldCost: asGold(1000),
        gemsUsed: asGems(10),
        xpGained: asXP(100),
        toLevel: 14
      });
      const score = strategy.calculateScore(candidate, mockSettings);

      // effectiveCost = 1000 + (10 * 20 * 50) = 1000 + 10000 = 11000
      // score = 11000 / 100 = 110
      expect(score).toBe(110);
    });

    it('should NOT have level-based incentives', () => {
      const candidate14 = mockCandidate({ toLevel: 14, goldCost: asGold(1000), xpGained: asXP(100) });
      const candidate15 = mockCandidate({ toLevel: 15, goldCost: asGold(1000), xpGained: asXP(100) });

      const score14 = strategy.calculateScore(candidate14, mockSettings);
      const score15 = strategy.calculateScore(candidate15, mockSettings);

      expect(score14).toBe(score15);
      expect(score14).toBe(10);
    });
  });

  describe('LookaheadStrategy', () => {
    it('should behave exactly like ProjectionStrategy (inheritance check)', () => {
      const projection = new ProjectionStrategy();
      const lookahead = new LookaheadStrategy();

      const candidate = mockCandidate({ toLevel: 15, goldCost: asGold(1000), xpGained: asXP(100) });

      expect(lookahead.calculateScore(candidate, mockSettings))
        .toBe(projection.calculateScore(candidate, mockSettings));
    });
  });
});
