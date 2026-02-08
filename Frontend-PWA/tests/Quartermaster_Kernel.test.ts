import { describe, it, expect } from 'vitest';
import QuartermasterKernel from '../src/logic/Quartermaster/Quartermaster_Kernel';
import type { PlayerData, OptimizationSettings, Card } from '../src/logic/Quartermaster/Quartermaster_Types';

describe('Quartermaster Kernel', () => {

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
      infiniteResources: true, 
      targetLevel: 50 
    };

    const result = QuartermasterKernel.optimize(data, settings);
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

    const result = QuartermasterKernel.optimize(data, settings);
    // Should NOT upgrade because cost (60k) > gold (50k)
    expect(result.actions?.length || 0).toBe(0);
  });

  it('should enforce infiniteResources=false when strategy is Maximize', () => {
    // Even if we pass infiniteResources: true, Maximize should ignore it
    const limitedGold = 50000;
    const data: PlayerData = {
      profile: mockProfile,
      inventory: { ...mockInventory, gold: limitedGold },
      cards: [createCard("Knight", "Common", 13, 50000)] // L14 cost is 60000
    };

    const settings: OptimizationSettings = {
      strategy: "Maximize",
      infiniteResources: true // User tried to toggle it ON
    };

    const result = QuartermasterKernel.optimize(data, settings);
    // Should STILL fail to upgrade because Maximize overrides infinite
    expect(result.actions?.length || 0).toBe(0);
  });
});
