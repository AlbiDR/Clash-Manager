// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
  TagSchema,
  ScoringWeightsSchema,
  ProphetIntelSchema,
  AuditRequestSchema,
  PublicScanRequestSchema,
  ScanRequestSchema,
  ClanFullRequestSchema,
  ClanApiRequestSchema,
  FetchRequestSchema,
  SubscriptionRequestSchema,
  RoyaleClanMembersResponseSchema,
  RoyalePlayerSchema,
  RoyaleTournamentMemberSchema,
  RoyaleTournamentResponseSchema,
  RoyaleWarLogResponseSchema,
  RoyaleWarLogItemSchema,
  RoyaleWarLogStandingSchema,
  RoyaleRiverRaceParticipantSchema,
  RoyaleRiverRaceClanSchema,
  RoyaleRiverRaceStandingSchema,
  RoyaleCurrentRiverRaceSchema,
  RoyaleBattleLogItemSchema,
  RoyaleBattleLogResponseSchema,
  GasRawFeedSchema,
  HubErrorSchema,
  FsErrorSchema,
  HubStateSchema
} from '../schemas';

describe('Core Schemas', () => {
  describe('TagSchema', () => {
    it('should validate correct Clash Royale tags', () => {
      expect(v.safeParse(TagSchema, '#2P2GG2GU').success).toBe(true);
      expect(v.safeParse(TagSchema, '2P2GG2GU').success).toBe(true);
      expect(v.safeParse(TagSchema, '#L9PPGRCQ').success).toBe(true);
      expect(v.safeParse(TagSchema, '8L9PPGRCQ').success).toBe(true);
    });

    it('should validate boundary length tags (15 chars)', () => {
      // 15 chars without # (will be transformed to 16 with #)
      const longTag = 'ABCDE12345FGHIJ';
      const result1 = v.safeParse(TagSchema, longTag);
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.output).toBe(`#${longTag}`);
        expect(result1.output.length).toBe(16);
      }

      // 15 chars with # (already includes prefix)
      const longTagWithHash = '#ABCDE12345FGHIJ';
      const result2 = v.safeParse(TagSchema, longTagWithHash);
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.output).toBe(longTagWithHash);
        expect(result2.output.length).toBe(16);
      }
    });

    it('should enforce uppercase and mandatory # prefix', () => {
      const result1 = v.safeParse(TagSchema, '2p2gg2gu');
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.output).toBe('#2P2GG2GU');
      }

      const result2 = v.safeParse(TagSchema, '#l9ppgrcq');
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.output).toBe('#L9PPGRCQ');
      }
    });

    it('should trim whitespace from tags', () => {
      const result = v.safeParse(TagSchema, '  #2p2gg2gu  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output).toBe('#2P2GG2GU');
      }
    });

    it('should reject invalid tag formats', () => {
      expect(v.safeParse(TagSchema, '').success).toBe(false);
      expect(v.safeParse(TagSchema, 'AB').success).toBe(false); // Too short
      expect(v.safeParse(TagSchema, '1234567890123456').success).toBe(false); // Too long (16 chars)
      expect(v.safeParse(TagSchema, '#INVALID-TAG-WITH-SYMBOLS!').success).toBe(false); // Invalid chars
    });
  });

  describe('ScoringWeightsSchema', () => {
    it('should validate correct scoring weights', () => {
      const valid = { TROPHY: 1, DON: 0.5, WAR: 2 };
      const result = v.safeParse(ScoringWeightsSchema, valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.WAR_BASELINE_BONUS).toBe(500);
      }
    });

    it('should allow overriding WAR_BASELINE_BONUS', () => {
      const custom = { TROPHY: 1, DON: 0.5, WAR: 2, WAR_BASELINE_BONUS: 1000 };
      const result = v.safeParse(ScoringWeightsSchema, custom);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.WAR_BASELINE_BONUS).toBe(1000);
      }
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

    it('should reject apiKeys array exceeding 100 entries', () => {
      const apiKeys = Array(101).fill('key');
      expect(v.safeParse(AuditRequestSchema, { apiKeys }).success).toBe(false);
    });

    it('should reject individual apiKeys exceeding 2000 characters', () => {
      const longKey = 'a'.repeat(2001);
      expect(v.safeParse(AuditRequestSchema, { apiKeys: [longKey] }).success).toBe(false);
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
      expect(v.safeParse(PublicScanRequestSchema, { tags: ['#TAG1'], apiKeys: ['key1'] }).success).toBe(true);
    });

    it('should reject requests with missing apiKeys', () => {
      expect(v.safeParse(PublicScanRequestSchema, { tags: ['#TAG1'] }).success).toBe(false);
    });

    it('should reject invalid fields', () => {
      expect(v.safeParse(PublicScanRequestSchema, { tags: 'not-an-array', apiKeys: ['key1'] }).success).toBe(false);
      expect(v.safeParse(PublicScanRequestSchema, { tags: ['#T'], apiKeys: ['key1'], minTrophies: 'high' }).success).toBe(false);
    });

    it('should validate tags array at exactly maxLength of 25', () => {
      const tags = Array(25).fill('#TAG1');
      const data = {
        tags,
        apiKeys: ['key1'],
        minTrophies: 5000,
        scoring: { TROPHY: 1, DON: 1, WAR: 1 }
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(true);
    });

    it('should reject tags array exceeding maxLength of 25', () => {
      const tags = Array(26).fill('#TAG1');
      const data = {
        tags,
        apiKeys: ['key1'],
        minTrophies: 5000,
        scoring: { TROPHY: 1, DON: 1, WAR: 1 }
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(false);
    });

    it('should reject blacklist array exceeding maxLength of 25', () => {
      const tags = ['#TAG1'];
      const blacklist = Array(26).fill('#TAG2');
      const data = {
        tags,
        blacklist,
        apiKeys: ['key1'],
        minTrophies: 5000
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(false);
    });

    it('should reject apiKeys array exceeding 100 entries', () => {
      const data = {
        tags: ['#TAG1'],
        apiKeys: Array(101).fill('key')
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(false);
    });

    it('should reject individual apiKeys exceeding 2000 characters', () => {
      const data = {
        tags: ['#TAG1'],
        apiKeys: ['a'.repeat(2001)]
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(false);
    });

    it('should reject prophetCache exceeding 1000 entries', () => {
      const prophetCache: Record<string, any> = {};
      for (let i = 0; i < 1001; i++) {
        prophetCache[`#TAG${i.toString(36)}`] = { wins: 5 };
      }
      const data = {
        tags: ['#TAG1'],
        apiKeys: ['key1'],
        prophetCache
      };
      expect(v.safeParse(PublicScanRequestSchema, data).success).toBe(false);
    });
  });

  describe('ScanRequestSchema', () => {
    it('should validate internal scan requests', () => {
      const data = {
        tags: ['#TAG1'],
        apiKeys: ['key1'],
        blacklist: ['#TAG2'],
        minTrophies: 5000,
        scoring: { TROPHY: 1, DON: 1, WAR: 1 }
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(true);
    });

    it('should validate tags array at exactly maxLength of 100', () => {
      const tags = Array(100).fill('#TAG1');
      const data = {
        tags,
        apiKeys: ['key1'],
        minTrophies: 5000,
        scoring: { TROPHY: 1, DON: 1, WAR: 1 }
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(true);
    });

    it('should reject tags array exceeding maxLength of 100', () => {
      const tags = Array(101).fill('#TAG1');
      const data = {
        tags,
        apiKeys: ['key1'],
        minTrophies: 5000,
        scoring: { TROPHY: 1, DON: 1, WAR: 1 }
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(false);
    });

    it('should reject blacklist array exceeding maxLength of 100', () => {
      const tags = ['#TAG1'];
      const blacklist = Array(101).fill('#TAG2');
      const data = {
        tags,
        blacklist,
        apiKeys: ['key1'],
        minTrophies: 5000
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(false);
    });

    it('should reject apiKeys array exceeding 100 entries', () => {
      const data = {
        tags: ['#TAG1'],
        apiKeys: Array(101).fill('key')
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(false);
    });

    it('should reject individual apiKeys exceeding 2000 characters', () => {
      const data = {
        tags: ['#TAG1'],
        apiKeys: ['a'.repeat(2001)]
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(false);
    });

    it('should reject prophetCache exceeding 1000 entries', () => {
      const prophetCache: Record<string, any> = {};
      for (let i = 0; i < 1001; i++) {
        prophetCache[`#TAG${i.toString(36)}`] = { wins: 5 };
      }
      const data = {
        tags: ['#TAG1'],
        apiKeys: ['key1'],
        prophetCache
      };
      expect(v.safeParse(ScanRequestSchema, data).success).toBe(false);
    });
  });

  describe('ClanFullRequestSchema', () => {
    it('should validate clan full snapshot requests', () => {
      expect(v.safeParse(ClanFullRequestSchema, { tag: '#TAG1' }).success).toBe(true);
      expect(v.safeParse(ClanFullRequestSchema, { tag: '#TAG1', apiKeys: ['key1'] }).success).toBe(true);
    });

    it('should normalize tag in clan full requests', () => {
      const result = v.safeParse(ClanFullRequestSchema, { tag: 'tag1' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.tag).toBe('#TAG1');
      }
    });

    it('should reject missing tag', () => {
      expect(v.safeParse(ClanFullRequestSchema, {}).success).toBe(false);
    });
  });

  describe('FetchRequestSchema', () => {
    it('should validate fetch requests targeting authorized API base', () => {
      // Default API_BASE is https://proxy.royaleapi.dev/v1
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://proxy.royaleapi.dev/v1/players/%23P1'] }).success).toBe(true);
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://proxy.royaleapi.dev/v1/clans/%23C1'], scoring: null }).success).toBe(true);
      expect(v.safeParse(FetchRequestSchema, { }).success).toBe(false);
    });

    it('should respect dynamic API_BASE environment variable', () => {
      process.env["API_BASE"] = "https://custom.proxy/v1";
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://custom.proxy/v1/players'] }).success).toBe(true);
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://proxy.royaleapi.dev/v1/players'] }).success).toBe(false);
      delete process.env["API_BASE"];
    });

    it('should reject URLs from unauthorized domains (SSRF prevention)', () => {
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://attacker.com/v1/players'] }).success).toBe(false);
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://proxy.royaleapi.dev.attacker.com/v1'] }).success).toBe(false);
    });

    it('should reject URLs targeting sibling paths', () => {
      // Base path is /v1. /v11 should be rejected.
      expect(v.safeParse(FetchRequestSchema, { urls: ['https://proxy.royaleapi.dev/v11/players'] }).success).toBe(false);
    });

    it('should reject empty urls array', () => {
      expect(v.safeParse(FetchRequestSchema, { urls: [] }).success).toBe(false);
    });

    it('should reject invalid URL formats', () => {
      expect(v.safeParse(FetchRequestSchema, { urls: ['not-a-url'] }).success).toBe(false);
    });

    it('should validate urls array at exactly maxLength of 100', () => {
      const urls = Array(100).fill('https://proxy.royaleapi.dev/v1/test');
      expect(v.safeParse(FetchRequestSchema, { urls }).success).toBe(true);
    });

    it('should reject urls array exceeding maxLength of 100', () => {
      const urls = Array(101).fill('https://proxy.royaleapi.dev/v1/test');
      expect(v.safeParse(FetchRequestSchema, { urls }).success).toBe(false);
    });

    it('should reject apiKeys array exceeding 100 entries', () => {
      const data = {
        urls: ['https://proxy.royaleapi.dev/v1/players/%23P1'],
        apiKeys: Array(101).fill('key')
      };
      expect(v.safeParse(FetchRequestSchema, data).success).toBe(false);
    });

    it('should reject individual apiKeys exceeding 2000 characters', () => {
      const data = {
        urls: ['https://proxy.royaleapi.dev/v1/players/%23P1'],
        apiKeys: ['a'.repeat(2001)]
      };
      expect(v.safeParse(FetchRequestSchema, data).success).toBe(false);
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

    it('should reject endpoint exceeding 500 characters', () => {
      const longEndpoint = 'https://push.com/' + 'a'.repeat(500);
      expect(v.safeParse(SubscriptionRequestSchema, { endpoint: longEndpoint }).success).toBe(false);
    });

    it('should reject p256dh and auth exceeding 200 characters', () => {
      const longKey = 'a'.repeat(201);
      expect(v.safeParse(SubscriptionRequestSchema, {
        endpoint: 'https://push.com',
        keys: { p256dh: longKey, auth: 'a' }
      }).success).toBe(false);
      expect(v.safeParse(SubscriptionRequestSchema, {
        endpoint: 'https://push.com',
        keys: { p256dh: 'a', auth: longKey }
      }).success).toBe(false);
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
          trophies: 6000,
          donations: 100,
          donationsReceived: 50
        }]
      };
      expect(v.safeParse(RoyaleClanMembersResponseSchema, data).success).toBe(true);
    });

    it('should reject members with missing trophies', () => {
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
      expect(v.safeParse(RoyaleClanMembersResponseSchema, data).success).toBe(false);
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

    it('should validate nested leagueStatistics', () => {
      const data = {
        tag: '#TAG1',
        name: 'Player 1',
        trophies: 6000,
        totalDonations: 10000,
        warDayWins: 50,
        challengeCardsWon: 1000,
        leagueStatistics: {
          currentSeason: {
            trophies: 6500
          }
        }
      };
      const result = v.safeParse(RoyalePlayerSchema, data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.leagueStatistics?.currentSeason?.trophies).toBe(6500);
      }
    });

    it('should provide default for trophies in nested leagueStatistics', () => {
      const data = {
        tag: '#TAG1',
        name: 'Player 1',
        trophies: 6000,
        totalDonations: 10000,
        warDayWins: 50,
        challengeCardsWon: 1000,
        leagueStatistics: {
          currentSeason: {}
        }
      };
      const result = v.safeParse(RoyalePlayerSchema, data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.leagueStatistics?.currentSeason?.trophies).toBe(0);
      }
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
      const result = v.parse(RoyaleTournamentResponseSchema, data);
      expect(result.membersList).toEqual([]);
    });
  });

  describe('RoyaleWarLogStandingSchema', () => {
    it('should validate war log standing', () => {
      const data = {
        rank: 1,
        clan: { tag: '#CLAN1', name: 'Clan 1', fame: 1000 }
      };
      expect(v.safeParse(RoyaleWarLogStandingSchema, data).success).toBe(true);
    });

    it('should reject invalid rank', () => {
      expect(v.safeParse(RoyaleWarLogStandingSchema, { rank: 'first', clan: {} }).success).toBe(false);
    });
  });

  describe('RoyaleWarLogItemSchema', () => {
    it('should validate war log item', () => {
      const data = {
        createdDate: '20240101T120000.000Z',
        seasonId: 1,
        standings: []
      };
      expect(v.safeParse(RoyaleWarLogItemSchema, data).success).toBe(true);
    });

    it('should reject missing createdDate', () => {
      expect(v.safeParse(RoyaleWarLogItemSchema, { seasonId: 1, standings: [] }).success).toBe(false);
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

    it('should reject malformed items array', () => {
      expect(v.safeParse(RoyaleWarLogResponseSchema, { items: {} }).success).toBe(false);
    });
  });

  describe('RoyaleRiverRaceParticipantSchema', () => {
    it('should validate participant data', () => {
      const data = {
        tag: '#P123',
        name: 'Player 1',
        fame: 500,
        repairPoints: 0,
        boatAttacks: 0,
        decksUsed: 4,
        decksUsedToday: 4
      };
      expect(v.safeParse(RoyaleRiverRaceParticipantSchema, data).success).toBe(true);
    });

    it('should reject malformed participant data', () => {
      expect(v.safeParse(RoyaleRiverRaceParticipantSchema, { tag: '!!' }).success).toBe(false);
      expect(v.safeParse(RoyaleRiverRaceParticipantSchema, { tag: '#P1', fame: 'lots' }).success).toBe(false);
    });
  });

  describe('RoyaleRiverRaceClanSchema', () => {
    it('should validate clan data in river race', () => {
      const data = {
        tag: '#CLAN1',
        name: 'Clan 1',
        fame: 1000,
        participants: []
      };
      expect(v.safeParse(RoyaleRiverRaceClanSchema, data).success).toBe(true);
    });

    it('should reject invalid tag', () => {
      expect(v.safeParse(RoyaleRiverRaceClanSchema, { tag: '!!', name: 'C', fame: 0, participants: [] }).success).toBe(false);
    });
  });

  describe('RoyaleRiverRaceStandingSchema', () => {
    it('should validate standing data', () => {
      const data = {
        rank: 1,
        clan: {
          tag: '#CLAN1',
          name: 'Clan 1',
          fame: 1000,
          participants: []
        }
      };
      expect(v.safeParse(RoyaleRiverRaceStandingSchema, data).success).toBe(true);
    });

    it('should reject invalid rank', () => {
      expect(v.safeParse(RoyaleRiverRaceStandingSchema, { rank: 'first', clan: {} }).success).toBe(false);
    });
  });

  describe('RoyaleCurrentRiverRaceSchema', () => {
    it('should validate current river race', () => {
      const data = {
        state: 'active',
        clan: {
          tag: '#CLAN1',
          name: 'Clan 1',
          fame: 1000,
          participants: []
        },
        standings: [
          {
            rank: 1,
            clan: {
              tag: '#CLAN1',
              name: 'Clan 1',
              fame: 1000,
              participants: []
            }
          }
        ]
      };
      expect(v.safeParse(RoyaleCurrentRiverRaceSchema, data).success).toBe(true);
    });

    it('should reject invalid race state', () => {
      const data = { state: 123, clan: {}, standings: [] };
      expect(v.safeParse(RoyaleCurrentRiverRaceSchema, data).success).toBe(false);
    });
  });

  describe('RoyaleBattleLogItemSchema', () => {
    it('should validate single battle log item', () => {
      const data = { type: 'riverRacePvP', battleTime: '20240101T120000.000Z' };
      expect(v.safeParse(RoyaleBattleLogItemSchema, data).success).toBe(true);
    });

    it('should reject missing type', () => {
      expect(v.safeParse(RoyaleBattleLogItemSchema, { battleTime: '...' }).success).toBe(false);
    });
  });

  describe('RoyaleBattleLogResponseSchema', () => {
    it('should validate battle log items', () => {
      const data = [
        { type: 'riverRacePvP', battleTime: '20240101T120000.000Z' }
      ];
      expect(v.safeParse(RoyaleBattleLogResponseSchema, data).success).toBe(true);
    });

    it('should reject non-array input', () => {
      expect(v.safeParse(RoyaleBattleLogResponseSchema, {}).success).toBe(false);
    });
  });
});

describe('Worker Hub Schemas', () => {
  describe('GasRawFeedSchema', () => {
    it('should validate correct GAS feed', () => {
      const data = {
        timestamp: '2024-01-01T00:00:00Z',
        source: 'GAS',
        tables: {
          roster: [['#TAG1', 'Player 1']],
          headhunter: [['#RECRUIT1', 'Recruit 1']]
        }
      };
      expect(v.safeParse(GasRawFeedSchema, data).success).toBe(true);
    });

    it('should reject missing tables', () => {
      const data = { timestamp: '...', source: '...' };
      expect(v.safeParse(GasRawFeedSchema, data).success).toBe(false);
    });
  });

  describe('HubErrorSchema', () => {
    it('should validate valid HubError', () => {
      const data = {
        code: 'ERR_TEST',
        message: 'A test error',
        layer: 'WORKER_HUB'
      };
      const result = v.safeParse(HubErrorSchema, data);
      expect(result.success).toBe(true);
    });

    it('should fallback to default layer', () => {
      const data = { code: 'ERR', message: 'msg' };
      const result = v.parse(HubErrorSchema, data);
      expect(result.layer).toBe('WORKER_HUB');
    });

    it('should reject invalid layers', () => {
      const data = { code: 'ERR', message: 'msg', layer: 'INVALID_LAYER' };
      expect(v.safeParse(HubErrorSchema, data).success).toBe(false);
    });
  });

  describe('FsErrorSchema', () => {
    it('should validate fs errors', () => {
      expect(v.safeParse(FsErrorSchema, { code: 'ENOENT' }).success).toBe(true);
      expect(v.safeParse(FsErrorSchema, { }).success).toBe(false);
    });
  });

  describe('HubStateSchema', () => {
    it('should validate full HubState', () => {
      const data = {
        metadata: {
          timestamp: '2024-01-01T00:00:00Z',
          lastCompiled: '2024-01-01T00:00:00Z',
          lastFetched: '2024-01-01T00:00:00Z',
          status: 'healthy',
          version: '1.0.0',
          source: 'WORKER'
        },
        data: {
          roster: [],
          headhunter: []
        }
      };
      expect(v.safeParse(HubStateSchema, data).success).toBe(true);
    });

    it('should enforce status picklist', () => {
      const data = {
        metadata: {
          timestamp: '...',
          status: 'invalid_status',
          version: '1',
          source: '...'
        },
        data: { roster: [], headhunter: [] }
      };
      expect(v.safeParse(HubStateSchema, data).success).toBe(false);
    });
  });
});
