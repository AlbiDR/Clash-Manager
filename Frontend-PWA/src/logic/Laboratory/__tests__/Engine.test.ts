import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../PriorityQueue';
import { ProjectionStrategy } from '../ScoringStrategy';
import type { UpgradeCandidate, OptimizationSettings } from '../Types';
import { asGems, asGold, asXP } from '../Economy';

describe('Laboratory Engine Components', () => {
  describe('PriorityQueue', () => {
    it('should maintain min-heap property (lowest score at top)', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      const inputs = [10, 5, 20, 1, 15];
      inputs.forEach(n => pq.push(n));

      const outputs: number[] = [];
      while (pq.size() > 0) {
        outputs.push(pq.pop()!);
      }

      expect(outputs).toEqual([1, 5, 10, 15, 20]);
    });

    it('should handle large amounts of churn correctly', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      for (let i = 0; i < 100; i++) {
        pq.push(Math.random());
      }
      
      let last = -1;
      while (pq.size() > 0) {
        const current = pq.pop()!;
        expect(current).toBeGreaterThanOrEqual(last);
        last = current;
      }
    });

    it('should handle empty pops safely', () => {
      const pq = new PriorityQueue<number>((a, b) => a - b);
      expect(pq.pop()).toBeUndefined();
      expect(pq.peek()).toBeUndefined();
    });
  });

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
        efficiencyRatio: 0
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
        efficiencyRatio: 0
      };

      const score = strategy.calculateScore(edgeCase, mockSettings);
      expect(Number.isFinite(score)).toBe(true);
      expect(score).not.toBeNaN();
    });
  });
});
