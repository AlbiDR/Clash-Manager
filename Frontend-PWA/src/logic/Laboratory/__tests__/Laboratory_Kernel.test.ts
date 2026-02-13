import { describe, it, expect } from 'vitest';
import LaboratoryKernel from '../Laboratory_Kernel';
import type { PlayerData, OptimizationSettings, Card } from '../Laboratory_Types';

describe('LaboratoryKernel', () => {
  const mockPlayerData: PlayerData = {
    profile: {
      name: 'Test Player',
      tag: '#TEST',
      kingLevel: 10,
      xpIntoLevel: 0
    },
    inventory: {
      gold: 100000,
      gems: 1000,
      wildCards: {
        Common: 500,
        Rare: 200,
        Epic: 50,
        Legendary: 10,
        Champion: 2
      }
    },
    cards: [
      { name: 'Knight', rarity: 'Common', level: 10, count: 1000, isTowerTroop: false },
      { name: 'Fireball', rarity: 'Rare', level: 10, count: 0, isTowerTroop: false },
      { name: 'P.E.K.K.A', rarity: 'Epic', level: 10, count: 0, isTowerTroop: false }
    ]
  };

  const defaultSettings: OptimizationSettings = {
    strategy: 'Efficiency',
    allowGemSpending: false,
    infiniteResources: false
  };

  describe('optimize', () => {
    it('should generate an optimization plan in Efficiency mode', () => {
      const result = LaboratoryKernel.optimize(mockPlayerData, defaultSettings);

      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.totalXpGained).toBeGreaterThan(0);
      expect(result.projectedKingLevel).toBeGreaterThanOrEqual(10);

      expect(result.totalGoldSpent).toBeGreaterThan(0);
      expect(result.finalGold).toBe(mockPlayerData.inventory.gold - result.totalGoldSpent);
    });

    it('should respect target level in Projection strategy', () => {
      const settings: OptimizationSettings = {
        ...defaultSettings,
        strategy: 'Projection',
        targetLevel: 11
      };

      const result = LaboratoryKernel.optimize(mockPlayerData, settings);
      expect(result.projectedKingLevel).toBeGreaterThanOrEqual(11);
    });

    it('should handle infinite resources mode', () => {
      const settings: OptimizationSettings = {
        ...defaultSettings,
        infiniteResources: true
      };

      const result = LaboratoryKernel.optimize(mockPlayerData, settings);
      expect(result.finalGold).toBe(mockPlayerData.inventory.gold);
      expect(result.finalGems).toBe(mockPlayerData.inventory.gems);
    });

    it('should prioritize upgrades using owned materials over gems', () => {
      const playerWithNoMaterials = {
        ...mockPlayerData,
        inventory: { ...mockPlayerData.inventory, gold: 1000000, gems: 100000 },
        cards: mockPlayerData.cards.map(c => ({ ...c, count: 0 }))
      };
      playerWithNoMaterials.cards[0].count = 5000;

      const settings: OptimizationSettings = {
        ...defaultSettings,
        allowGemSpending: true
      };

      const result = LaboratoryKernel.optimize(playerWithNoMaterials, settings);
      const firstAction = result.actions[0];
      expect(firstAction.cardName).toBe('Knight');
      expect(firstAction.upgradeType).toBe('Direct');
    });

    it('should NOT allow wildcard consumption for Tower Troops', () => {
      const playerWithTowerTroop = {
        ...mockPlayerData,
        inventory: { ...mockPlayerData.inventory, wildCards: { Common: 1000, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } },
        cards: [
          { name: 'Tower Princess', rarity: 'Common', level: 10, count: 0, isTowerTroop: true }
        ]
      };

      const result = LaboratoryKernel.optimize(playerWithTowerTroop, defaultSettings);

      // DESIRED & FIXED: should be 0 because Tower Troops cannot use wildcards.
      expect(result.actions).toHaveLength(0);
    });

    it('should preserve isTowerTroop flag throughout simulation', () => {
      const playerWithMixedCards = {
        ...mockPlayerData,
        cards: [
          { name: 'Knight', rarity: 'Common', level: 10, count: 1000, isTowerTroop: false },
          { name: 'Tower Princess', rarity: 'Common', level: 10, count: 1000, isTowerTroop: true }
        ]
      };

      const result = LaboratoryKernel.optimize(playerWithMixedCards, defaultSettings);

      const knightAction = result.actions.find(a => a.cardName === 'Knight');
      const tpAction = result.actions.find(a => a.cardName === 'Tower Princess');

      expect(knightAction?.isTowerTroop).toBe(false);
      expect(tpAction?.isTowerTroop).toBe(true);
    });

    it('should calculate Level 15 upgrade cost correctly (Standard Gold)', () => {
      const data: PlayerData = {
        profile: { name: "Test", tag: "#000", kingLevel: 14, xpIntoLevel: 0 },
        inventory: { gold: 1000000, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } },
        cards: [{ name: "Knight", rarity: "Common", level: 14, count: 50000, isTowerTroop: false }]
      };

      const settings: OptimizationSettings = {
        strategy: "Projection",
        targetLevel: 15,
        allowGemSpending: false,
        infiniteResources: false
      };

      const result = LaboratoryKernel.optimize(data, settings);
      const upgrade = result.actions?.find(a => a.targetLevel === 15);

      expect(upgrade).toBeDefined();
      expect(upgrade?.goldCost).toBe(90000);
    });
  });
});
