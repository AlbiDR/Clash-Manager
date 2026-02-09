import { describe, it, expect } from 'vitest';
import LaboratoryKernel from '../src/logic/Laboratory/Laboratory_Kernel';
import type { PlayerData, OptimizationSettings, Card } from '../src/logic/Laboratory/Laboratory_Types';

describe('Laboratory Kernel', () => {

  const mockProfile = { name: "Test", tag: "#000", kingLevel: 14, xpIntoLevel: 0 };
  const mockInventory = { gold: 1000000, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } };

  const createCard = (name: string, rarity: any, level: number, count: number): Card => ({
    name, rarity, level, count
  });

  it('should calculate Level 15 upgrade cost correctly (Standard Gold)', () => {
    const data: PlayerData = {
      profile: mockProfile,
      inventory: mockInventory,
      cards: [createCard("Knight", "Common", 14, 50000)] // Has enough cards
    };
    
    const settings: OptimizationSettings = { 
      strategy: "Target", 
      targetLevel: 50,
      allowGemSpending: false,
      infiniteResources: false // Will be overridden internally for Target
    };

    const result = LaboratoryKernel.optimize(data, settings);
    const upgrade = result.actions?.find(a => a.targetLevel === 15);
    
    expect(upgrade).toBeDefined();
    expect(upgrade?.goldCost).toBe(90000); 
  });

  it('should respect budget in Maximize strategy', () => {
    const limitedGold = 50000;
    const data: PlayerData = {
      profile: mockProfile,
      inventory: { ...mockInventory, gold: limitedGold },
      cards: [createCard("Knight", "Common", 13, 50000)] // L14 cost is 60000
    };

    const settings: OptimizationSettings = {
      strategy: "Maximize",
      infiniteResources: false 
    };

    const result = LaboratoryKernel.optimize(data, settings);
    // Should NOT upgrade because cost (60k) > gold (50k)
    expect(result.actions?.length || 0).toBe(0);
  });

  it('should allow infiniteResources when strategy is Maximize', () => {
    // We now allow infiniteResources for Maximize strategy (Theoretical completion cost)
    const limitedGold = 50000;
    const data: PlayerData = {
      profile: mockProfile,
      inventory: { ...mockInventory, gold: limitedGold },
      cards: [createCard("Knight", "Common", 13, 50000)] // L14 cost is 60000
    };

    const settings: OptimizationSettings = {
      strategy: "Maximize",
      infiniteResources: true,
      allowGemSpending: true // Required for infinite mode to work with zero inventory
    };

    const result = LaboratoryKernel.optimize(data, settings);
    // Should now perform upgrades ignoring the 50k gold limit
    expect(result.actions?.length || 0).toBeGreaterThan(0);
  });

  it('should reach target level with infinite resources despite zero inventory', () => {
    const data: PlayerData = {
      profile: { ...mockProfile, kingLevel: 14, xpIntoLevel: 0 },
      inventory: { gold: 0, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } },
      cards: [createCard("Knight", "Common", 14, 0)] // No cards
    };

    const settings: OptimizationSettings = {
      strategy: "Target",
      targetLevel: 15, // Very small step for test speed
      allowGemSpending: true, // Required for infinite mode to work with zero inventory
      infiniteResources: false // Will be overridden internally for Target
    };

    const result = LaboratoryKernel.optimize(data, settings);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.projectedKingLevel).toBeGreaterThanOrEqual(15);
  });
});
