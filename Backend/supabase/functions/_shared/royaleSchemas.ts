// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";

/**
 * L1 Core: Royale API Domain Schemas
 * Authoritative validation boundaries for raw data from Royale API Proxy.
 */

/**
 * Internal: Base Clan Identity.
 */
const BaseClanIdentitySchema = v.object({
    tag: v.string(),
    name: v.string()
});

/**
 * Internal: Royale Location Schema.
 */
const RoyaleLocationSchema = v.object({
    id: v.number(),
    name: v.string(),
    isCountry: v.optional(v.boolean(), false)
});

/**
 * L1 Core: Clan Profile Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleClanSchema = v.intersect([
    BaseClanIdentitySchema,
    v.object({
        type: v.optional(v.string()),
        description: v.optional(v.string()),
        badgeId: v.optional(v.number()),
        clanScore: v.optional(v.number()),
        clanWarTrophies: v.optional(v.number()),
        location: v.optional(v.nullable(RoyaleLocationSchema))
    })
]);

/**
 * L1 Core: Flexible List Schema.
 *
 * @remarks
 * Handles endpoints that return either a raw array or an 'items' wrapped object.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleFlexibleListSchema = v.pipe(
    v.union([
        v.array(v.record(v.string(), v.unknown())),
        v.object({
            items: v.array(v.record(v.string(), v.unknown()))
        })
    ]),
    v.transform((input) => {
        if (Array.isArray(input)) {
            return { items: input };
        }
        return input;
    })
);

/**
 * L1 Core: River Race Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleRiverRaceSchema = v.object({
    state: v.string(),
    clan: v.object({
        tag: v.string(),
        fame: v.optional(v.number())
    })
});

/**
 * L1 Core: Royale Player Profile Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyalePlayerSchema = v.object({
    tag: v.string(),
    name: v.string(),
    trophies: v.optional(v.number(), 0),
    totalDonations: v.optional(v.number(), 0),
    warDayWins: v.optional(v.number(), 0),
    challengeCardsWon: v.optional(v.number(), 0),
    clan: v.optional(v.nullable(v.object({
        tag: v.string()
    })))
});

/**
 * Internal: Royale Card Schema.
 */
const RoyaleCardSchema = v.object({
    name: v.string(),
    id: v.number(),
    level: v.number(),
    maxLevel: v.number(),
    count: v.optional(v.number(), 0),
    rarity: v.string()
});

/**
 * L1 Core: Royale Full Player Profile Schema.
 *
 * @remarks
 * Used for /players endpoint.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleFullPlayerSchema = v.intersect([
    RoyalePlayerSchema,
    v.object({
        expLevel: v.number(),
        expPoints: v.number(),
        cards: v.array(RoyaleCardSchema),
        towerTroops: v.optional(v.array(RoyaleCardSchema), [])
    })
]);

/**
 * Internal: Royale Tournament List Item Schema.
 */
const RoyaleTournamentListItemSchema = v.object({
    tag: v.string(),
    type: v.optional(v.string()),
    capacity: v.optional(v.number(), 0),
    maxCapacity: v.optional(v.number(), 0)
});

/**
 * L1 Core: Royale Tournament List Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleTournamentListSchema = v.object({
    items: v.array(RoyaleTournamentListItemSchema)
});

/**
 * L1 Core: Royale Tournament Details Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleTournamentSchema = v.object({
    tag: v.string(),
    type: v.optional(v.string()),
    membersList: v.optional(v.array(v.object({
        tag: v.string(),
        name: v.string(),
        trophies: v.optional(v.number(), 0),
        clan: v.optional(v.nullable(v.object({
            tag: v.string()
        })))
    })), [])
});

/**
 * L1 Core: Royale Battle Log Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleBattleLogSchema = v.array(v.object({
    type: v.string(),
    battleTime: v.string(),
    team: v.array(v.object({
        tag: v.string(),
        name: v.string(),
        crowns: v.optional(v.number(), 0)
    })),
    opponent: v.array(v.object({
        tag: v.string(),
        name: v.string(),
        crowns: v.optional(v.number(), 0),
        clan: v.optional(v.nullable(v.object({
            tag: v.string()
        })))
    }))
}));

/**
 * L1 Core: Royale Location List Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleLocationListSchema = v.object({
    items: v.array(RoyaleLocationSchema)
});

/**
 * L1 Core: Royale Clan Member Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleClanMemberSchema = v.object({
    tag: v.string(),
    name: v.string(),
    role: v.optional(v.string()),
    trophies: v.optional(v.number())
});

/**
 * L1 Core: Royale Clan Ranking Item Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleClanRankingItemSchema = v.object({
    tag: v.string(),
    name: v.string(),
    rank: v.number(),
    clanScore: v.number(),
    badgeId: v.number()
});

/**
 * L1 Core: Royale Clan Ranking List Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleClanRankingListSchema = v.object({
    items: v.array(RoyaleClanRankingItemSchema)
});

/**
 * L1 Core: Royale Clan Detail Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleClanDetailSchema = v.intersect([
    RoyaleClanSchema,
    v.object({
        memberList: v.array(RoyaleClanMemberSchema)
    })
]);

/**
 * L1 Core: Royale Ranking Item Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleRankingItemSchema = v.object({
    tag: v.string(),
    name: v.string(),
    rank: v.number(),
    trophies: v.optional(v.nullable(v.number())),
    clan: v.optional(v.nullable(v.object({
        tag: v.optional(v.string()),
        name: v.optional(v.string())
    })))
});

/**
 * L1 Core: Royale Ranking List Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleRankingListSchema = v.object({
    items: v.array(RoyaleRankingItemSchema)
});

/**
 * L1 Core: Harvested Player Schema.
 *
 * @remarks
 * Represents a player discovered during the harvest process.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const HarvestedPlayerSchema = v.object({
    tag: v.string(),
    name: v.string(),
    clan: v.nullable(v.string())
});
