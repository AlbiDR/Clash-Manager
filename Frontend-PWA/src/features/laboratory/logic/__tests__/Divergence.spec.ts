import { describe, it, expect } from 'vitest';
import { calculateProgressionPath } from '../Simulation';
import { ProjectionStrategy, InventoryStrategy } from '../ScoringStrategy';
import { asGold, asGems, asXP } from '../Economy';
import type { SimulationState, OptimizationSettings, Card } from '../Types';

describe('Strategic Divergence', () => {
  const mockCard: Card = {
    name: 'Tesla',
    rarity: 'Common',
    level: 14,
    count: 0,
    isTowerTroop: false
  };

  const initialState: SimulationState = {
    roster: [mockCard],
    inventory: {
      gold: asGold(0),
      gems: asGems(0),
      wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
    },
    totalXp: asXP(1000000), // High enough to not matter
    totalGoldSpent: asGold(0),
    totalGemsSpent: asGems(0),
    totalWildCardsUsed: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
    history: []
  };

  it('InventoryStrategy should yield NO actions when resources are zero', () => {
    const settings: OptimizationSettings = {
      strategy: 'Resource Efficiency',
      allowGemSpending: false,
      infiniteResources: false
    };

    const gen = calculateProgressionPath(initialState, settings, new InventoryStrategy());
    const result = gen.next();
    expect(result.done).toBe(true);
    expect(result.value.history).toHaveLength(0);
  });

  it('ProjectionStrategy should yield actions even with zero resources', () => {
    const settings: OptimizationSettings = {
      strategy: 'Level Projection',
      allowGemSpending: true,
      infiniteResources: true,
      targetLevel: 90
    };

    const gen = calculateProgressionPath(initialState, settings, new ProjectionStrategy());
    const result = gen.next();
    expect(result.done).toBe(false);
    expect(result.value.history).toHaveLength(1);
    expect(result.value.history[0].cardName).toBe('Tesla');
  });

  it('Scoring should differ significantly between strategies', () => {
    const candidate = {
      index: 0,
      card: mockCard,
      fromLevel: 14,
      toLevel: 15,
      goldCost: asGold(100000),
      cardsRequired: 5000,
      cardsUsed: 0,
      wildCardsUsed: 5000,
      gemsUsed: asGems(0),
      xpGained: asXP(50000),
      efficiencyIndex: 0
    };

    const proj = new ProjectionStrategy();
    const inv = new InventoryStrategy();
    const settings: OptimizationSettings = { strategy: 'Level Projection', allowGemSpending: true, infiniteResources: true };

    const scoreProj = proj.calculateScore(candidate, settings);
    const scoreInv = inv.calculateScore(candidate, settings);

    // Projection should have a much lower (better) score for high level upgrades 
    // because of the growth curve incentive and cheaper effective cost.
    expect(scoreProj).toBeLessThan(scoreInv);
  });
});
