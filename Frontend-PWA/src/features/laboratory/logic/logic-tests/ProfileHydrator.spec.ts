import { describe, it, expect } from 'vitest';
import ProfileHydrator from '../ProfileHydrator';
import { asGold, asGems, asXP } from '@core/utils/economy';

describe('ProfileHydrator', () => {
  describe('hydrate', () => {
    it('should hydrate internal format data (Cached)', () => {
      const raw = {
        profile: {
          name: "Jules",
          tag: "ABC123",
          kingLevel: 14,
          xpIntoLevel: 1000
        },
        cards: [
          { name: "Knight", rarity: "Common", level: 14, count: 5000 },
          { name: "Fireball", rarity: "Rare", level: 12, count: 500 }
        ],
        inventory: {
          gold: 50000,
          gems: 500,
          wildCards: { Common: 100, Rare: 50, Epic: 10, Legendary: 5, Champion: 1 }
        }
      };

      const result = ProfileHydrator.hydrate(raw);

      expect(result.profile.name).toBe("Jules");
      expect(result.profile.tag).toBe("ABC123");
      expect(result.profile.kingLevel).toBe(14);
      expect(result.profile.xpIntoLevel).toBe(asXP(1000));

      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]).toEqual({
        name: "Knight",
        rarity: "Common",
        level: 14,
        count: 5000,
        isTowerTroop: false
      });

      expect(result.inventory.gold).toBe(asGold(50000));
      expect(result.inventory.gems).toBe(asGems(500));
      expect(result.inventory.wildCards.Common).toBe(100);
    });

    it('should hydrate external format data (RoyaleAPI)', () => {
      const raw = {
        name: "External User",
        tag: "XYZ987",
        expLevel: 15,
        expPoints: 52000, // 50000 (base for lvl 15) + 2000 (into level)
        cards: [
          { name: "Log", rarity: "Legendary", level: 5, count: 10 } // Relative level 5 for Legendary (9+4=13)
        ],
        towerTroops: [
          { name: "Tower Princess", rarity: "Common", level: 14, count: 0 } // Relative level 14
        ]
      };

      const result = ProfileHydrator.hydrate(raw);

      expect(result.profile.name).toBe("External User");
      expect(result.profile.kingLevel).toBe(15);
      expect(result.profile.xpIntoLevel).toBe(asXP(2000));

      expect(result.cards).toHaveLength(2);

      const log = result.cards.find(c => c.name === "Log");
      expect(log?.rarity).toBe("Legendary");
      expect(log?.level).toBe(13); // 9 + (5 - 1) = 13

      const tp = result.cards.find(c => c.name === "Tower Princess");
      expect(tp?.isTowerTroop).toBe(true);
      expect(tp?.level).toBe(14);
    });

    it('should handle missing fields with robust fallbacks', () => {
      const raw = {};
      const result = ProfileHydrator.hydrate(raw);

      expect(result.profile.name).toBe("Unknown");
      expect(result.profile.tag).toBe("0");
      expect(result.profile.kingLevel).toBe(1);
      expect(result.inventory.gold).toBe(asGold(0));
      expect(result.inventory.wildCards.Common).toBe(0);
      expect(result.cards).toEqual([]);
    });

    it('should throw Error when validation fails (Target B [1])', () => {
      const malformed = {
        name: 123, // Should be string
        cards: "not an array" // Should be array
      };

      expect(() => ProfileHydrator.hydrate(malformed)).toThrow("Profile Extraction Failed");
    });

    it('should normalize rarity strings correctly', () => {
      const raw = {
        cards: [
          { name: "A", rarity: "rare ", level: 1 },
          { name: "B", rarity: "EPIC", level: 1 },
          { name: "C", rarity: "UnknownRarity", level: 1 }
        ]
      };

      const result = ProfileHydrator.hydrate(raw);
      expect(result.cards[0].rarity).toBe("Rare");
      expect(result.cards[1].rarity).toBe("Epic");
      expect(result.cards[2].rarity).toBe("Common"); // Default fallback
    });

    it('should normalize levels across all rarities for RoyaleAPI format', () => {
        const rarities = [
            { r: "Common", in: 1, out: 1 },
            { r: "Rare", in: 1, out: 3 },
            { r: "Epic", in: 1, out: 6 },
            { r: "Legendary", in: 1, out: 9 },
            { r: "Champion", in: 1, out: 11 }
        ];

        rarities.forEach(({ r, in: levelIn, out: levelOut }) => {
            const raw = { cards: [{ name: "Test", rarity: r, level: levelIn }] };
            const result = ProfileHydrator.hydrate(raw);
            expect(result.cards[0].level).toBe(levelOut);
        });
    });

    it('should clamp levels to CARD_LEVEL_CAP', () => {
        const raw = {
            cards: [{ name: "Overleveled", rarity: "Common", level: 99 }]
        };
        const result = ProfileHydrator.hydrate(raw);
        expect(result.cards[0].level).toBe(16); // Assuming CARD_LEVEL_CAP is 16
    });
  });

  describe('createInitialState', () => {
    it('should create a valid initial simulation state', () => {
      const playerData = {
        profile: { name: "Tester", tag: "T1", kingLevel: 10, xpIntoLevel: asXP(100) },
        inventory: {
            gold: asGold(1000),
            gems: asGems(10),
            wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
        },
        cards: []
      };

      const state = ProfileHydrator.createInitialState(playerData);

      expect(state.inventory.gold).toBe(asGold(1000));
      expect(state.totalGoldSpent).toBe(asGold(0));
      expect(state.history).toEqual([]);

      // King Level 10 cumulative XP is 770. Total = 770 + 100 = 870
      expect(state.totalXp).toBe(asXP(870));
    });

    it('should fallback to level 1 king if level is not in table', () => {
        const playerData = {
            profile: { name: "Low", tag: "L1", kingLevel: 0, xpIntoLevel: asXP(0) },
            inventory: { gold: asGold(0), gems: asGems(0), wildCards: {} as any },
            cards: []
        };
        const state = ProfileHydrator.createInitialState(playerData);
        expect(state.totalXp).toBe(asXP(0)); // Level 1 cumulative is 0
    });
  });
});
