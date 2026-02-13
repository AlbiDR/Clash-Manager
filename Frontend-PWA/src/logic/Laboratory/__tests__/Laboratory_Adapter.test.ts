import { describe, it, expect, vi } from 'vitest';
import LaboratoryAdapter from '../Laboratory_Adapter';

describe('LaboratoryAdapter', () => {
  describe('hydrate', () => {
    it('should hydrate RoyaleAPI format correctly (Flat Snapshot)', () => {
      const rawSnapshot = {
        name: 'Player One',
        tag: '#TAG1',
        expLevel: 14,
        expPoints: 5000,
        cards: [
          { name: 'Knight', level: 13, count: 100, rarity: 'common' },
          { name: 'Fireball', level: 11, count: 50, rarity: 'rare' }
        ],
        towerTroops: [
          { name: 'Tower Princess', level: 14, count: 0, rarity: 'common' }
        ]
      };

      const result = LaboratoryAdapter.hydrate(rawSnapshot);

      expect(result.profile.name).toBe('Player One');
      expect(result.profile.kingLevel).toBe(14);
      expect(result.cards).toHaveLength(3);

      const knight = result.cards.find(c => c.name === 'Knight');
      expect(knight?.rarity).toBe('Common');
      expect(knight?.level).toBe(13);

      const fireball = result.cards.find(c => c.name === 'Fireball');
      expect(fireball?.rarity).toBe('Rare');
      expect(fireball?.level).toBe(13);

      const towerPrincess = result.cards.find(c => c.name === 'Tower Princess');
      expect(towerPrincess?.isTowerTroop).toBe(true);
    });

    it('should hydrate Internal format correctly (Nested Snapshot)', () => {
      const rawSnapshot = {
        profile: {
          name: 'Internal Player',
          tag: '#INT1',
          king_level: 14,
          xp_into_level: 100
        },
        cards: [
          { name: 'Log', level: 14, count: 5, rarity: 'Legendary' }
        ],
        inventory: {
          gold: 50000,
          gems: 500,
          wildCards: { Common: 100, Rare: 50, Epic: 10, Legendary: 5, Champion: 1 }
        }
      };

      const result = LaboratoryAdapter.hydrate(rawSnapshot);

      expect(result.profile.name).toBe('Internal Player');
      expect(result.inventory.gold).toBe(50000);
      expect(result.cards).toHaveLength(1);

      const log = result.cards[0];
      expect(log.name).toBe('Log');
      expect(log.level).toBe(14);
    });

    it('should apply rarity overrides (e.g. Dagger Duchess)', () => {
      const rawSnapshot = {
        name: 'Override Test',
        tag: '#OVR1',
        expLevel: 1,
        towerTroops: [
          { name: 'Dagger Duchess', level: 1, count: 0, rarity: 'common' }
        ]
      };

      const result = LaboratoryAdapter.hydrate(rawSnapshot);
      const duchess = result.cards.find(c => c.name === 'Dagger Duchess');
      expect(duchess?.rarity).toBe('Legendary');
    });

    it('should handle missing inventory gracefully', () => {
      const rawSnapshot = { name: 'No Inv', tag: '#NI1', expLevel: 1, cards: [] };
      const result = LaboratoryAdapter.hydrate(rawSnapshot);

      expect(result.inventory.gold).toBe(0);
      expect(result.inventory.wildCards.Common).toBe(0);
    });

    it('should normalize rarity strings safely', () => {
      const rawSnapshot = {
        name: 'Rarity Test',
        tag: '#RT1',
        expLevel: 1,
        cards: [
          { name: 'Unknown Card', level: 1, count: 0, rarity: '  legendary  ' }
        ]
      };

      const result = LaboratoryAdapter.hydrate(rawSnapshot);
      expect(result.cards[0].rarity).toBe('Legendary');
    });

    it('should fallback to Common for invalid rarity', () => {
       const rawSnapshot = {
        name: 'Invalid Rarity',
        tag: '#IR1',
        expLevel: 1,
        cards: [
          { name: 'Glitch', level: 1, count: 0, rarity: 'SuperRare' }
        ]
      };

      const result = LaboratoryAdapter.hydrate(rawSnapshot);
      expect(result.cards[0].rarity).toBe('Common');
    });
  });
});
