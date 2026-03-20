
import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
  TagSchema,
  ScoringWeightsSchema,
  ProphetIntelSchema,
  AuditRequestSchema,
  PublicScanRequestSchema,
  ClanApiRequestSchema,
  FetchRequestSchema,
  SubscriptionRequestSchema,
  RoyaleClanMembersResponseSchema,
  RoyalePlayerSchema,
  RoyaleTournamentMemberSchema,
  RoyaleTournamentResponseSchema,
  RoyaleWarLogResponseSchema
} from '../schemas';

describe('Core Schemas', () => {
  describe('TagSchema', () => {
    it('should validate correct Clash Royale tags', () => {
      expect(v.safeParse(TagSchema, '#2P2GG2GU').success).toBe(true);
      expect(v.safeParse(TagSchema, '2P2GG2GU').success).toBe(true);
      expect(v.safeParse(TagSchema, '#L9PPGRCQ').success).toBe(true);
      expect(v.safeParse(TagSchema, '8L9PPGRCQ').success).toBe(true);
    });

    it('should trim whitespace from tags', () => {
      const result = v.safeParse(TagSchema, '  #2P2GG2GU  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe('#2P2GG2GU');
      }
    });

    it('should reject invalid tag formats', () => {
      expect(v.safeParse(TagSchema, '').success).toBe(false);
      expect(v.safeParse(TagSchema, 'AB').success).toBe(false); // Too short
      expect(v.safeParse(TagSchema, '1234567890123').success).toBe(false); // Too long
      expect(v.safeParse(TagSchema, '#INVALID-TAG').success).toBe(false); // Invalid chars
    });
  });

  describe('ScoringWeightsSchema', () => {
    it('should validate correct scoring weights', () => {
      const valid = { TROPHY: 1, DON: 0.5, WAR: 2 };
      expect(v.safeParse(ScoringWeightsSchema, valid).success).toBe(true);
    });

    it('should reject missing or invalid weight types', () => {
      expect(v.safeParse(ScoringWeightsSchema, { TROPHY: 1, DON: 0.5 }).success).toBe(false);
      expect(v.safeParse(ScoringWeightsSchema, { TROPHY: 1, DON: 'high', WAR: 2 }).success).toBe(false);
    });
  });

  describe('ProphetIntelSchema', () => {
    it('should validate and provide defaults for prophet intel', () => {
      const empty = {};
      const result = v.safeParse(ProphetIntelSchema, empty);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toEqual({
          wins: 0,
          active: true,
          lastFetch: 0
        });
      }
    });

    it('should preserve provided values', () => {
      const data = { wins: 10, active: false, lastFetch: 123456789 };
      const result = v.safeParse(ProphetIntelSchema, data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toEqual(data);
      }
    });
  });
});

describe('Request Schemas', () => {
  describe('AuditRequestSchema', () => {
    it('should validate audit requests', () => {
      expect(v.safeParse(AuditRequestSchema, { apiKeys: ['key1'] }).success).toBe(true);
      expect(v.safeParse(AuditRequestSchema, { }).success).toBe(false);
    });
  });

  describe('PublicScanRequestSchema', () => {
    it('should validate full scan requests', () => {
      const data = {
        tags: ['#TAG1'],
        apiKeys: ['key1'],
        blacklist: ['#TAG2'],
        minTrophies: 5000,
        scoring: { TROPHY: 1, DON: 1, WAR: 1 },
        prophetCache: { '#TAG1': { wins: 5 } }
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(true);
    });

    it('should validate minimal scan requests', () => {
      expect(v.safeParse(PublicScanRequestSchema, { tags: ['#TAG1'] }).success).toBe(true);
    });

    it('should reject invalid fields', () => {
      expect(v.safeParse(PublicScanRequestSchema, { tags: 'not-an-array' }).success).toBe(false);
      expect(v.safeParse(PublicScanRequestSchema, { tags: ['#T'], minTrophies: 'high' }).success).toBe(false);
    });
  });

  describe('FetchRequestSchema', () => {
    it('should validate fetch requests', () => {
      expect(v.safeParse(FetchRequestSchema, { urls: ['http://api.com'] }).success).toBe(true);
      expect(v.safeParse(FetchRequestSchema, { urls: [], scoring: null }).success).toBe(true);
      expect(v.safeParse(FetchRequestSchema, { }).success).toBe(false);
    });
  });

  describe('ClanApiRequestSchema', () => {
    it('should validate clan api requests', () => {
      expect(v.safeParse(ClanApiRequestSchema, { tag: '#TAG1', type: 'members' }).success).toBe(true);
      expect(v.safeParse(ClanApiRequestSchema, { tag: '#TAG1', type: 'warlog' }).success).toBe(true);
      expect(v.safeParse(ClanApiRequestSchema, { tag: '#TAG1', type: 'invalid' }).success).toBe(false);
    });
  });

  describe('SubscriptionRequestSchema', () => {
    it('should validate subscription requests', () => {
      expect(v.safeParse(SubscriptionRequestSchema, { endpoint: 'https://push.com' }).success).toBe(true);
      expect(v.safeParse(SubscriptionRequestSchema, {
        endpoint: 'https://push.com',
        keys: { p256dh: 'd', auth: 'a' }
      }).success).toBe(true);
      expect(v.safeParse(SubscriptionRequestSchema, { endpoint: 'https://push.com', keys: {} }).success).toBe(false);
    });
  });
});

describe('Royale API Response Schemas', () => {
  describe('RoyaleClanMembersResponseSchema', () => {
    it('should validate clan members response', () => {
      const data = {
        items: [{
          tag: '#TAG1',
          name: 'Player 1',
          role: 'member',
          expLevel: 14,
          donations: 100,
          donationsReceived: 50
        }]
      };
      expect(v.safeParse(RoyaleClanMembersResponseSchema, data).success).toBe(true);
    });
  });

  describe('RoyalePlayerSchema', () => {
    it('should validate player data', () => {
      const data = {
        tag: '#TAG1',
        name: 'Player 1',
        trophies: 6000,
        totalDonations: 10000,
        warDayWins: 50,
        challengeCardsWon: 1000,
        clan: { tag: '#CLAN1', name: 'My Clan' }
      };
      expect(v.safeParse(RoyalePlayerSchema, data).success).toBe(true);
    });

    it('should handle optional expLevel and clan', () => {
      const data = {
        tag: '#TAG1',
        name: 'Player 1',
        trophies: 6000,
        totalDonations: 10000,
        warDayWins: 50,
        challengeCardsWon: 1000
      };
      expect(v.safeParse(RoyalePlayerSchema, data).success).toBe(true);
    });
  });

  describe('RoyaleTournamentMemberSchema', () => {
    it('should handle score vs trophies and fallback name', () => {
      const data = { tag: '#TAG1', score: 10 };
      const result = v.safeParse(RoyaleTournamentMemberSchema, data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.name).toBe('Unknown');
        expect(result.output.score).toBe(10);
      }
    });

    it('should handle nullish clan', () => {
      expect(v.safeParse(RoyaleTournamentMemberSchema, { tag: '#TAG1', clan: null }).success).toBe(true);
      expect(v.safeParse(RoyaleTournamentMemberSchema, { tag: '#TAG1', clan: undefined }).success).toBe(true);
    });
  });

  describe('RoyaleTournamentResponseSchema', () => {
    it('should handle missing membersList', () => {
      const data = { tag: '#TOURN1' };
      const result = v.safeParse(RoyaleTournamentResponseSchema, data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.membersList).toEqual([]);
      }
    });
  });

  describe('RoyaleWarLogResponseSchema', () => {
    it('should validate complex war log structure', () => {
      const data = {
        items: [{
          createdDate: '2024-01-01',
          seasonId: 1,
          standings: [{
            rank: 1,
            clan: {
              tag: '#CLAN1',
              name: 'Clan 1',
              fame: 1000,
              participants: [{
                tag: '#P123',
                name: 'Player 1',
                fame: 500,
                repairPoints: 0,
                boatAttacks: 0,
                decksUsed: 4,
                decksUsedToday: 4
              }]
            }
          }]
        }]
      };
      expect(v.safeParse(RoyaleWarLogResponseSchema, data).success).toBe(true);
    });
  });
});
