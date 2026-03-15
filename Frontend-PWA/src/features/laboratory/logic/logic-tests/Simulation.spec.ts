import { describe, it, expect } from 'vitest';
import { calculateProgressionPath } from '../Simulation';
import { asGold, asGems, asXP } from '@core/utils/economy';
import type { SimulationState, OptimizationSettings, Card } from '../Types';

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

  it('should yield progressive states until it cannot upgrade further (Infinite Mode)', () => {
    const generator = calculateProgressionPath(initialState, { ...settings, infiniteResources: true });
    
    // First step: Level 14 -> 15
    const step1 = generator.next();
    expect(step1.done).toBe(false);
    expect(step1.value.roster[0].level).toBe(15);
    expect(Number(step1.value.totalGoldSpent)).toBe(90000);

    // Second step: Level 15 -> 16
    const step2 = generator.next();
    expect(step2.done).toBe(false);
    expect(step2.value.roster[0].level).toBe(16);
    expect(Number(step2.value.totalGoldSpent)).toBe(210000); // 90k + 120k

    // Done
    const final = generator.next();
    expect(final.done).toBe(true);
  });

  it('should respect target level in Projection strategy', () => {
    // Note: To test this properly we need enough cards to hit a king level milestone.
    // For now we just verify it stops.
    const limitedSettings: OptimizationSettings = {
      ...settings,
      targetLevel: 2 // Very low target
    };
    
    // Since cumulative XP for level 2 is 20, 
    // and level 15 upgrade gives 50,000 XP, it should stop after 1 step.
    const generator = calculateProgressionPath(initialState, limitedSettings);
    const step1 = generator.next();
    expect(step1.done).toBe(false);
    
    const finish = generator.next();
    expect(finish.done).toBe(true);
  });
});
