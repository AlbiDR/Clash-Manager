// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from 'vitest';
import { getUpgradeCandidate, applyUpgrade } from '../SimulationCore';
import { asGold, asGems, asXP } from '@core/utils/economy';
import type { SimulationState, OptimizationSettings, Card } from '../Types';

describe('SimulationCore', () => {
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
      gems: asGems(100000), // Increased to 100k
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

  describe('getUpgradeCandidate', () => {
    it('should return null if next level exceeds cap', () => {
      const cappedCard = { ...mockCard, level: 16 };
      const candidate = getUpgradeCandidate(cappedCard, 0, initialState, settings);
      expect(candidate).toBeNull();
    });

    it('should return Direct upgrade if resources are sufficient', () => {
      const candidate = getUpgradeCandidate(mockCard, 0, initialState, settings);
      expect(candidate).not.toBeNull();
      expect(candidate?.upgradeType).toBe('Direct');
      expect(candidate?.goldCost).toBe(90000);
      expect(candidate?.cardsRequired).toBe(5500);
      expect(candidate?.wildCardsUsed).toBe(0);
    });

    it('should return Wild upgrade if cards are insufficient but wild cards cover it', () => {
      const lowCountCard = { ...mockCard, count: 1000 };
      const stateWithWilds = {
        ...initialState,
        inventory: {
          ...initialState.inventory,
          wildCards: { ...initialState.inventory.wildCards, Common: 5000 }
        }
      };
      const candidate = getUpgradeCandidate(lowCountCard, 0, stateWithWilds, settings);
      expect(candidate?.upgradeType).toBe('Wild');
      expect(candidate?.wildCardsUsed).toBe(4500);
    });

    it('should return Gem upgrade if cards/wilds are insufficient and gem spending allowed', () => {
      const lowCountCard = { ...mockCard, count: 0 };
      const gemSettings = { ...settings, allowGemSpending: true };
      const candidate = getUpgradeCandidate(lowCountCard, 0, initialState, gemSettings);
      expect(candidate?.upgradeType).toBe('Gem');
      expect(Number(candidate?.gemsUsed)).toBeGreaterThan(0);
    });

    it('should return null if cards are insufficient and gem spending NOT allowed', () => {
      const lowCountCard = { ...mockCard, count: 0 };
      const candidate = getUpgradeCandidate(lowCountCard, 0, initialState, settings);
      expect(candidate).toBeNull();
    });

    it('should return Gem upgrade if gold is insufficient and gem spending allowed', () => {
      const poorState = {
        ...initialState,
        inventory: { ...initialState.inventory, gold: asGold(0) }
      };
      const gemSettings = { ...settings, allowGemSpending: true };
      const candidate = getUpgradeCandidate(mockCard, 0, poorState, gemSettings);
      expect(candidate?.upgradeType).toBe('Gem');
      // 90000 gold / 20 = 4500 gems
      expect(Number(candidate?.gemsUsed)).toBe(4500);
    });

    it('should return null if gold is insufficient and gem spending NOT allowed', () => {
      const poorState = {
        ...initialState,
        inventory: { ...initialState.inventory, gold: asGold(0) }
      };
      const candidate = getUpgradeCandidate(mockCard, 0, poorState, settings);
      expect(candidate).toBeNull();
    });

    it('should handle infinite resources', () => {
      const infiniteSettings = { ...settings, infiniteResources: true };
      const poorState = {
        ...initialState,
        inventory: { gold: asGold(0), gems: asGems(0), wildCards: { ...initialState.inventory.wildCards } }
      };
      const candidate = getUpgradeCandidate(mockCard, 0, poorState, infiniteSettings);
      expect(candidate).not.toBeNull();
      expect(candidate?.upgradeType).toBe('Direct');
    });

    it('should return null if total gems exceed inventory when both gold and cards need gems', () => {
       const lowResourceState = {
        ...initialState,
        inventory: {
          gold: asGold(0),
          gems: asGems(10), // Very few gems
          wildCards: { ...initialState.inventory.wildCards }
        }
      };
      const lowCountCard = { ...mockCard, count: 0 };
      const gemSettings = { ...settings, allowGemSpending: true };
      const candidate = getUpgradeCandidate(lowCountCard, 0, lowResourceState, gemSettings);
      expect(candidate).toBeNull();
    });
  });

  describe('applyUpgrade', () => {
    const candidate = {
      index: 0,
      card: mockCard,
      fromLevel: 14,
      toLevel: 15,
      goldCost: asGold(90000),
      cardsRequired: 5500,
      cardsUsed: 5500,
      wildCardsUsed: 0,
      gemsUsed: asGems(0),
      xpGained: asXP(50000),
      efficiencyIndex: 1,
      upgradeType: 'Direct' as const
    };

    it('should return a new state object (immutability)', () => {
      const newState = applyUpgrade(initialState, { ...candidate, upgradeType: 'Direct' });
      expect(newState).not.toBe(initialState);
      expect(newState.roster).not.toBe(initialState.roster);
      expect(newState.inventory).not.toBe(initialState.inventory);
    });

    it('should correctly update roster and inventory for Direct upgrade', () => {
      const newState = applyUpgrade(initialState, { ...candidate, upgradeType: 'Direct' });
      expect(newState.roster[0].level).toBe(15);
      expect(newState.roster[0].count).toBe(4500); // 10000 - 5500
      expect(Number(newState.inventory.gold)).toBe(910000); // 1000000 - 90000
      expect(Number(newState.totalXp)).toBe(50000);
      expect(Number(newState.totalGoldSpent)).toBe(90000);
      expect(newState.history).toHaveLength(1);
    });

    it('should correctly update wild cards and gems', () => {
      const wildCandidate = {
        ...candidate,
        cardsUsed: 0,
        wildCardsUsed: 5500,
        gemsUsed: asGems(100),
        upgradeType: 'Gem' as const
      };
      const stateWithWilds = {
        ...initialState,
        inventory: {
          ...initialState.inventory,
          wildCards: { ...initialState.inventory.wildCards, Common: 6000 }
        }
      };

      const newState = applyUpgrade(stateWithWilds, wildCandidate);
      expect(newState.inventory.wildCards.Common).toBe(500);
      expect(Number(newState.inventory.gems)).toBe(99900); // 100000 - 100
      expect(Number(newState.totalGemsSpent)).toBe(100);
      expect(newState.totalWildCardsUsed.Common).toBe(5500);
    });
  });
});
