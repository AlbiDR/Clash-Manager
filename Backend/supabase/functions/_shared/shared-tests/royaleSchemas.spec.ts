// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import {
  RoyaleClanSchema,
  createRoyaleFlexibleListSchema,
  RoyaleRiverRaceSchema,
  RoyalePlayerSchema,
  RoyaleFullPlayerSchema,
  RoyaleTournamentListSchema,
  RoyaleTournamentSchema,
  RoyaleBattleLogSchema,
  RoyaleLocationListSchema,
  RoyaleClanMemberSchema,
  RoyaleClanRankingListSchema,
  RoyaleClanDetailSchema,
  RoyaleRankingListSchema,
  RoyaleWarLogItemSchema,
  RoyaleTagSchema,
  HarvestedPlayerSchema,
} from "../royaleSchemas";

describe("Royale API Domain Schemas", () => {
  describe("RoyaleClanSchema", () => {
    it("should parse valid clan data", () => {
      const input = {
        tag: "#ABC",
        name: "Clan Name",
        type: "inviteOnly",
        description: "A clan",
        badgeId: 123,
        clanScore: 50000,
        clanWarTrophies: 3000,
        location: { id: 1, name: "Italy", isCountry: true }
      };
      const result = v.parse(RoyaleClanSchema, input);
      expect(result.tag).toBe("#ABC");
      expect(result.location?.name).toBe("Italy");
    });

    it("should handle optional/nullable fields", () => {
      const input = {
        tag: "#ABC",
        name: "Clan Name",
        location: null
      };
      const result = v.parse(RoyaleClanSchema, input);
      expect(result.tag).toBe("#ABC");
      expect(result.location).toBeNull();
    });

    it("should fail for missing required fields", () => {
      const input = { tag: "#ABC" }; // missing name
      expect(() => v.parse(RoyaleClanSchema, input)).toThrow();
    });
  });

  describe("createRoyaleFlexibleListSchema", () => {
    // [DECISION LOG] The old fixtures fed bare `{ tag: "#1" }` objects because the
    // pre-fix schema validated only "an array of objects." Now that the factory
    // requires a real item schema, the fixtures carry a realistic shape
    // (RoyaleClanMemberSchema requires both tag and name).
    const memberListSchema = createRoyaleFlexibleListSchema(RoyaleClanMemberSchema);

    it("should handle raw array input", () => {
      const input = [{ tag: "#1", name: "P1" }, { tag: "#2", name: "P2" }];
      const result = v.parse(memberListSchema, input);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].tag).toBe("#1");
    });

    it("should handle wrapped items object input", () => {
      const input = { items: [{ tag: "#1", name: "P1" }] };
      const result = v.parse(memberListSchema, input);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].tag).toBe("#1");
    });

    it("should reject items that fail the parameterized item schema", () => {
      // [F6 regression guard] Previously `RoyaleFlexibleListSchema` asserted only
      // "an array of objects" and let arbitrary shapes (e.g. missing `name`) through.
      const input = [{ tag: "#1" }]; // missing required 'name'
      expect(() => v.parse(memberListSchema, input)).toThrow();
    });
  });

  describe("RoyaleRiverRaceSchema", () => {
    it("should parse valid river race data", () => {
      const input = {
        state: "warDay",
        clan: { tag: "#ABC", fame: 1000 }
      };
      const result = v.parse(RoyaleRiverRaceSchema, input);
      expect(result.state).toBe("warDay");
      expect(result.clan.fame).toBe(1000);
    });

    it("should handle optional fame", () => {
      const input = {
        state: "warDay",
        clan: { tag: "#ABC" }
      };
      const result = v.parse(RoyaleRiverRaceSchema, input);
      expect(result.clan.tag).toBe("#ABC");
    });
  });

  describe("RoyalePlayerSchema", () => {
    it("should parse valid player data", () => {
      const input = {
        tag: "#P123",
        name: "Player",
        trophies: 6000,
        totalDonations: 1000,
        warDayWins: 50,
        challengeCardsWon: 100,
        clan: { tag: "#C1" }
      };
      const result = v.parse(RoyalePlayerSchema, input);
      expect(result.tag).toBe("#P123");
      expect(result.clan?.tag).toBe("#C1");
    });

    it("should use default values for optional missing fields", () => {
      const input = { tag: "#P1", name: "P1" };
      const result = v.parse(RoyalePlayerSchema, input);
      expect(result.trophies).toBe(0);
      expect(result.totalDonations).toBe(0);
      expect(result.warDayWins).toBe(0);
    });
  });

  describe("RoyaleFullPlayerSchema", () => {
    it("should parse full player data with cards", () => {
      const input = {
        tag: "#P1",
        name: "P1",
        expLevel: 14,
        expPoints: 50000,
        cards: [
          { name: "Knight", id: 1, level: 14, maxLevel: 14, rarity: "common" }
        ],
        towerTroops: []
      };
      const result = v.parse(RoyaleFullPlayerSchema, input);
      expect(result.expLevel).toBe(14);
      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].rarity).toBe("common");
    });
  });

  describe("RoyaleTournamentListSchema", () => {
    it("should parse tournament items", () => {
      const input = {
        items: [
          { tag: "#T1", type: "open", capacity: 50, maxCapacity: 100 }
        ]
      };
      const result = v.parse(RoyaleTournamentListSchema, input);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].capacity).toBe(50);
    });
  });

  describe("RoyaleTournamentSchema", () => {
    it("should parse tournament details", () => {
      const input = {
        tag: "#T1",
        membersList: [
          { tag: "#P1", name: "P1", trophies: 5000, clan: { tag: "#C1" } }
        ]
      };
      const result = v.parse(RoyaleTournamentSchema, input);
      expect(result.tag).toBe("#T1");
      expect(result.membersList).toHaveLength(1);
    });
  });

  describe("RoyaleBattleLogSchema", () => {
    it("should parse battle log array", () => {
      const input = [
        {
          type: "PvP",
          battleTime: "20260101T000000.000Z",
          team: [{ tag: "#P1", name: "P1", crowns: 3 }],
          opponent: [{ tag: "#P2", name: "P2", crowns: 1, clan: { tag: "#C1" } }]
        }
      ];
      const result = v.parse(RoyaleBattleLogSchema, input);
      expect(result).toHaveLength(1);
      expect(result[0].team[0].crowns).toBe(3);
    });

    it("should reject a malformed battleTime as a validation miss (F10)", () => {
      // [F10 regression guard] battleTime format must be caught HERE so a bad
      // record becomes a validation miss (filtered), not an uncaught throw from
      // parseBattleTime()'s Temporal.Instant.from narrowing further downstream.
      const input = [
        {
          type: "PvP",
          battleTime: "invalid-time-format",
          team: [{ tag: "#P1", name: "P1", crowns: 3 }],
          opponent: [{ tag: "#P2", name: "P2", crowns: 1, clan: { tag: "#C1" } }]
        }
      ];
      const result = v.safeParse(RoyaleBattleLogSchema, input);
      expect(result.success).toBe(false);
    });
  });

  describe("RoyaleLocationListSchema", () => {
    it("should parse location list", () => {
      const input = {
        items: [{ id: 1, name: "International", isCountry: false }]
      };
      const result = v.parse(RoyaleLocationListSchema, input);
      expect(result.items).toHaveLength(1);
    });
  });

  describe("RoyaleClanMemberSchema", () => {
    it("should parse clan member", () => {
      const input = { tag: "#P1", name: "P1", role: "elder", trophies: 5000 };
      const result = v.parse(RoyaleClanMemberSchema, input);
      expect(result.role).toBe("elder");
    });
  });

  describe("RoyaleClanRankingListSchema", () => {
    it("should parse ranking list", () => {
      const input = {
        items: [
          { tag: "#C1", name: "C1", rank: 1, clanScore: 50000, badgeId: 123 }
        ]
      };
      const result = v.parse(RoyaleClanRankingListSchema, input);
      expect(result.items).toHaveLength(1);
    });
  });

  describe("RoyaleClanDetailSchema", () => {
    it("should parse clan detail including members", () => {
      const input = {
        tag: "#C1",
        name: "C1",
        memberList: [{ tag: "#P1", name: "P1" }]
      };
      const result = v.parse(RoyaleClanDetailSchema, input);
      expect(result.memberList).toHaveLength(1);
    });
  });

  describe("RoyaleRankingListSchema", () => {
    it("should parse player rankings", () => {
      const input = {
        items: [
          { tag: "#P1", name: "P1", rank: 1, trophies: 8000, clan: { tag: "#C1", name: "C1" } }
        ]
      };
      const result = v.parse(RoyaleRankingListSchema, input);
      expect(result.items).toHaveLength(1);
    });
  });

  describe("RoyaleWarLogItemSchema", () => {
    it("should parse a real riverracelog item shape", () => {
      const input = {
        seasonId: 55,
        sectionIndex: 3,
        standings: [
          {
            rank: 1,
            clan: {
              tag: "#C1",
              name: "Clan One",
              fame: 12000,
              clanScore: 50000,
              participants: [
                { tag: "#P1", name: "P1", decksUsed: 4, fame: 1200 }
              ]
            }
          }
        ]
      };
      const result = v.parse(RoyaleWarLogItemSchema, input);
      expect(result.standings).toHaveLength(1);
      expect(result.standings[0].clan.participants).toHaveLength(1);
      expect(result.standings[0].clan.participants[0].tag).toBe("#P1");
    });

    it("should default standings to an empty array when absent", () => {
      const input = { seasonId: 55, sectionIndex: 3 };
      const result = v.parse(RoyaleWarLogItemSchema, input);
      expect(result.standings).toEqual([]);
    });

    it("should fail without seasonId or sectionIndex", () => {
      const input = { standings: [] };
      expect(() => v.parse(RoyaleWarLogItemSchema, input)).toThrow();
    });
  });

  describe("RoyaleTagSchema", () => {
    it("should accept a valid tag with the '#' prefix", () => {
      const result = v.parse(RoyaleTagSchema, "#PP80QG99");
      expect(result).toBe("#PP80QG99");
    });

    it("should accept a valid tag without the '#' prefix", () => {
      const result = v.parse(RoyaleTagSchema, "PP80QG99");
      expect(result).toBe("PP80QG99");
    });

    it("should reject a tag that is too short", () => {
      expect(() => v.parse(RoyaleTagSchema, "#PP")).toThrow();
    });

    it("should reject a tag with disallowed characters", () => {
      expect(() => v.parse(RoyaleTagSchema, "#PP80QI99")).toThrow(); // 'I' is not in the CR alphabet
    });
  });

  describe("HarvestedPlayerSchema", () => {
    it("should parse harvested player", () => {
      const input = { tag: "#P1", name: "P1", clan: "Clan Name" };
      const result = v.parse(HarvestedPlayerSchema, input);
      expect(result.clan).toBe("Clan Name");
    });

    it("should handle null clan", () => {
      const input = { tag: "#P1", name: "P1", clan: null };
      const result = v.parse(HarvestedPlayerSchema, input);
      expect(result.clan).toBeNull();
    });
  });
});
