import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import {
  BaseActionSchema,
  DismissRecruitsPayloadSchema,
  UndismissRecruitsPayloadSchema,
  TriggerUpdatePayloadSchema,
  PlayerProfilePayloadSchema,
  LoggerPayloadSchema,
  GasGetEventSchema,
  GenericPayloadSchema,
  ClanMemberSnapshotSchema,
  RecruitSchema,
  PlayerResultSchema,
  MarketIntelligenceSchema,
  ProphetIntelSchema,
  RoyaleClanMemberSchema,
  RoyaleClanSchema,
  RoyaleWarLogStandingSchema,
  RoyaleWarLogItemSchema,
  RoyaleWarLogResponseSchema
} from '../Validation';

describe('Validation Schemas (Backend-GAS)', () => {
  describe('BaseActionSchema', () => {
    it('should pass with valid action', () => {
      const payload = { action: 'test' };
      const result = v.safeParse(BaseActionSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should pass without action (optional)', () => {
      const payload = {};
      const result = v.safeParse(BaseActionSchema, payload);
      expect(result.success).toBe(true);
    });
  });

  describe('DismissRecruitsPayloadSchema', () => {
    it('should pass with valid items (string array)', () => {
      const payload = { items: ['tag1', 'tag2'] };
      const result = v.safeParse(DismissRecruitsPayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should pass with valid items (object array)', () => {
      const payload = {
        items: [
          { id: 'tag1', score: 100 },
          { id: 'tag2', potentialRawScore: '50' }
        ]
      };
      const result = v.safeParse(DismissRecruitsPayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should pass with valid ids', () => {
      const payload = { ids: ['tag1', 'tag2'] };
      const result = v.safeParse(DismissRecruitsPayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid item type', () => {
      const payload = { items: [123] };
      const result = v.safeParse(DismissRecruitsPayloadSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  describe('UndismissRecruitsPayloadSchema', () => {
    it('should pass with valid ids', () => {
      const payload = { ids: ['tag1'] };
      const result = v.safeParse(UndismissRecruitsPayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail if ids is missing', () => {
      const payload = {};
      const result = v.safeParse(UndismissRecruitsPayloadSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  describe('TriggerUpdatePayloadSchema', () => {
    it('should pass with target', () => {
      const payload = { target: 'roster' };
      const result = v.safeParse(TriggerUpdatePayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail without target', () => {
      const payload = {};
      const result = v.safeParse(TriggerUpdatePayloadSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  describe('PlayerProfilePayloadSchema', () => {
    it('should pass with tag', () => {
      const payload = { tag: '#ABC' };
      const result = v.safeParse(PlayerProfilePayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail without tag', () => {
      const payload = {};
      const result = v.safeParse(PlayerProfilePayloadSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  describe('LoggerPayloadSchema', () => {
    it('should pass with optional fields', () => {
      const payload = { level: 'info', message: 'test', context: 'app' };
      const result = v.safeParse(LoggerPayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should pass empty', () => {
      const payload = {};
      const result = v.safeParse(LoggerPayloadSchema, payload);
      expect(result.success).toBe(true);
    });
  });

  describe('GasGetEventSchema', () => {
    it('should pass with valid parameter object', () => {
      const payload = {
        parameter: { token: 'secret', action: 'sync' }
      };
      const result = v.safeParse(GasGetEventSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail if parameter is missing', () => {
      const payload = {};
      const result = v.safeParse(GasGetEventSchema, payload);
      expect(result.success).toBe(false);
    });

    it('should pass with optional parameters', () => {
      const payload = {
        parameter: {},
        parameters: { tags: ['a', 'b'] }
      };
      const result = v.safeParse(GasGetEventSchema, payload);
      expect(result.success).toBe(true);
    });
  });

  describe('GenericPayloadSchema', () => {
    it('should pass with any additional fields', () => {
      const payload = { action: 'custom', extra: 123, meta: { foo: 'bar' } };
      const result = v.safeParse(GenericPayloadSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should allow unknown field access after parsing', () => {
      const payload = { action: 'test', data: 'something' };
      const result = v.safeParse(GenericPayloadSchema, payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.output as any).data).toBe('something');
      }
    });
  });

  describe('ClanMemberSnapshotSchema', () => {
    it('should pass with valid member data', () => {
      const payload = {
        tag: '#123',
        name: 'Player',
        role: 'member',
        trophies: 5000,
        donations: 100,
        donationsReceived: 50,
        lastSeen: '2023-01-01'
      };
      const result = v.safeParse(ClanMemberSnapshotSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail if a required field is missing', () => {
      const payload = { tag: '#123', name: 'Player' };
      const result = v.safeParse(ClanMemberSnapshotSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  describe('RecruitSchema', () => {
    it('should pass with valid recruit data', () => {
      const payload = {
        tag: '#REC1',
        name: 'Recruit',
        invited: false,
        foundDate: '2023-05-01'
      };
      const result = v.safeParse(RecruitSchema, payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.trophies).toBe(0); // Default value
      }
    });

    it('should pass with valid source', () => {
      const payload = {
        tag: '#REC2',
        name: 'Recruit 2',
        invited: true,
        foundDate: Date.now(),
        source: 'TOURNAMENT'
      };
      const result = v.safeParse(RecruitSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid source', () => {
      const payload = {
        tag: '#REC3',
        name: 'Recruit 3',
        invited: false,
        foundDate: '2023-05-01',
        source: 'INVALID'
      };
      const result = v.safeParse(RecruitSchema, payload);
      expect(result.success).toBe(false);
    });
  });

  describe('PlayerResultSchema', () => {
    it('should pass with valid player result', () => {
      const payload = {
        tag: '#P1',
        name: 'Pro',
        role: 'elder',
        trophies: 7000,
        daysTracked: 30,
        avgDailyDonations: 10,
        totalDonations: 300,
        lastSeen: '2023-06-01',
        warRateVal: 0.9,
        avgWarFame: 800,
        historyString: 'WWW',
        scores: { raw: 95, perf: 98 },
        cleanKey: 'pro_p1'
      };
      const result = v.safeParse(PlayerResultSchema, payload);
      expect(result.success).toBe(true);
    });
  });

  describe('MarketIntelligenceSchema', () => {
    it('should pass with valid market intelligence', () => {
      const payload = {
        firstSeen: new Date(),
        weeklyMax: new Map([['24W10', 500]]),
        battleWeeks: new Set(['24W10']),
        totalBattleCredits: 5,
        discoveredBattleDays: new Set(['2024-03-01']),
        dailyBattleCredits: new Map([['2024-03-01', 1]]),
        fameHistory: new Map([['24W10', 1200]])
      };
      const result = v.safeParse(MarketIntelligenceSchema, payload);
      expect(result.success).toBe(true);
    });
  });

  describe('ProphetIntelSchema', () => {
    it('should pass with valid prophet intel', () => {
      const payload = {
        wins: 10,
        active: true,
        lastFetch: Date.now()
      };
      const result = v.safeParse(ProphetIntelSchema, payload);
      expect(result.success).toBe(true);
    });

    it('should pass with defaults', () => {
      const payload = {};
      const result = v.safeParse(ProphetIntelSchema, payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.wins).toBe(0);
        expect(result.output.active).toBe(true);
        expect(result.output.lastFetch).toBe(0);
      }
    });
  });

  describe('Royale API Schemas', () => {
    const validMember = {
      tag: '#MEMBER1',
      name: 'Member 1',
      role: 'member',
      expLevel: 14,
      trophies: 6500,
      donations: 500,
      donationsReceived: 200
    };

    describe('RoyaleClanMemberSchema', () => {
      it('should pass with valid member', () => {
        const result = v.safeParse(RoyaleClanMemberSchema, validMember);
        expect(result.success).toBe(true);
      });

      it('should fail with invalid tag', () => {
        const result = v.safeParse(RoyaleClanMemberSchema, { ...validMember, tag: 'ID' }); // Too short
        expect(result.success).toBe(false);
      });
    });

    describe('RoyaleClanSchema', () => {
      it('should pass with valid clan data', () => {
        const payload = {
          tag: '#CLAN1',
          name: 'The Clan',
          memberList: [validMember]
        };
        const result = v.safeParse(RoyaleClanSchema, payload);
        expect(result.success).toBe(true);
      });
    });

    describe('RoyaleWarLogStandingSchema', () => {
      it('should pass with valid standing', () => {
        const payload = {
          rank: 1,
          clan: {
            tag: '#CLAN1',
            name: 'The Clan',
            fame: 50000
          }
        };
        const result = v.safeParse(RoyaleWarLogStandingSchema, payload);
        expect(result.success).toBe(true);
      });
    });

    describe('RoyaleWarLogItemSchema', () => {
      it('should pass with valid war log item', () => {
        const payload = {
          createdDate: '20240101T100000.000Z',
          standings: [
            {
              rank: 1,
              clan: {
                tag: '#CLAN1',
                name: 'The Clan',
                fame: 50000
              }
            }
          ]
        };
        const result = v.safeParse(RoyaleWarLogItemSchema, payload);
        expect(result.success).toBe(true);
      });
    });

    describe('RoyaleWarLogResponseSchema', () => {
      it('should pass with valid war log data', () => {
        const payload = {
          items: [
            {
              createdDate: '20240101T100000.000Z',
              standings: [
                {
                  rank: 1,
                  clan: {
                    tag: '#CLAN1',
                    name: 'The Clan',
                    fame: 50000
                  }
                }
              ]
            }
          ]
        };
        const result = v.safeParse(RoyaleWarLogResponseSchema, payload);
        expect(result.success).toBe(true);
      });

      it('should fail if items is not an array', () => {
        const result = v.safeParse(RoyaleWarLogResponseSchema, { items: {} });
        expect(result.success).toBe(false);
      });
    });
  });
});
