// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";

/**
 * L1 Core: Shared Royale API Schemas
 * Authoritative validation boundaries for raw data from Royale API Proxy.
 */

/** [GUARD] Base Clan Identity. */
const BaseClanIdentitySchema = v.object({
    tag: v.string(),
    name: v.string()
});

/** [GUARD] Clan Profile Schema. */
export const RoyaleClanSchema = v.intersect([
    BaseClanIdentitySchema,
    v.object({
        type: v.optional(v.string()),
        description: v.optional(v.string()),
        badgeId: v.optional(v.number()),
        clanScore: v.optional(v.number()),
        clanWarTrophies: v.optional(v.number())
    })
]);

/** [GUARD] Flexible schema for endpoints that might return an array or a wrapped object. */
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

/** [GUARD] River Race Schema. */
export const RoyaleRiverRaceSchema = v.object({
    state: v.string(),
    clan: v.object({
        tag: v.string(),
        fame: v.optional(v.number())
    })
});

/** [GUARD] Royale Player Profile Schema. */
export const RoyalePlayerSchema = v.object({
    tag: v.string(),
    name: v.string(),
    trophies: v.optional(v.number(), 0),
    totalDonations: v.optional(v.number(), 0),
    warDayWins: v.optional(v.number(), 0),
    clan: v.optional(v.nullable(v.object({
        tag: v.string()
    })))
});

/** [GUARD] Royale Card Schema. */
export const RoyaleCardSchema = v.object({
    name: v.string(),
    id: v.number(),
    level: v.number(),
    maxLevel: v.number(),
    count: v.optional(v.number(), 0),
    rarity: v.string()
});

/** [GUARD] Royale Full Player Profile Schema (for /players endpoint). */
export const RoyaleFullPlayerSchema = v.intersect([
    RoyalePlayerSchema,
    v.object({
        expLevel: v.number(),
        expPoints: v.number(),
        cards: v.array(RoyaleCardSchema),
        towerTroops: v.optional(v.array(RoyaleCardSchema), [])
    })
]);

/** [GUARD] Player Sync Payload Schema. */
export const PlayerSyncPayloadSchema = v.object({
    tag: v.string()
});

/** [GUARD] Royale Tournament List Item Schema. */
export const RoyaleTournamentListItemSchema = v.object({
    tag: v.string(),
    capacity: v.number(),
    maxCapacity: v.number()
});

/** [GUARD] Royale Tournament List Schema. */
export const RoyaleTournamentListSchema = v.object({
    items: v.array(RoyaleTournamentListItemSchema)
});

/** [GUARD] Royale Tournament Details Schema. */
export const RoyaleTournamentSchema = v.object({
    tag: v.string(),
    membersList: v.array(v.object({
        tag: v.string(),
        name: v.string(),
        trophies: v.optional(v.number(), 0),
        clan: v.optional(v.nullable(v.object({
            tag: v.string()
        })))
    }))
});

/** [GUARD] Shadow Discovery Target Schema (RPC). */
export const ShadowTargetSchema = v.object({
    opponent_player_tag: v.string()
});

/** [GUARD] Stale Recruit Schema (RPC). */
export const StaleRecruitSchema = v.object({
    player_tag: v.string()
});

/** [GUARD] Headhunter Context Schema (RPC). */
export const HeadhunterContextSchema = v.object({
    required_trophies: v.optional(v.number(), 0),
    exclusion_tags: v.optional(v.array(v.string()), [])
});

/** [GUARD] Royale Battle Log Schema. */
export const RoyaleBattleLogSchema = v.array(v.object({
    type: v.string(),
    battleTime: v.string(),
    opponent: v.array(v.object({
        tag: v.string(),
        name: v.string(),
        clan: v.optional(v.nullable(v.object({
            tag: v.string()
        })))
    }))
}));

/** [GUARD] Discovery Anchor Schema (RPC). */
export const DiscoveryAnchorSchema = v.object({
    keyword: v.string()
});

/** [GUARD] Discovery Cache Item Schema. */
export const DiscoveryCacheItemSchema = v.object({
    player_tag: v.string()
});
