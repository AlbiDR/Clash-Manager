// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";

/**
 * L1 Core: Royale API Domain Schemas
 * Authoritative validation boundaries for raw data from Royale API Proxy.
 */

/**
 * L1 Core: Royale Tag Format Schema.
 *
 * @remarks
 * Mirrors the database CHECK constraint applied to every `player_tag` /
 * `clan_tag` column (e.g. `features.player_card_snapshots`, `drivers.players`,
 * `drivers.war_activity`): `CHECK (tag ~ '^#[0289CGJLPQRUVY]+$')`.
 * The leading '#' is optional here because several callers accept a tag
 * before it has been run through `normalizeTag()`, which prepends it.
 * Bounds (4-16 chars) are a defensive envelope around every real Supercell
 * tag observed in the wild (shortest known tags are 3 characters after '#',
 * longest are well under 15); a legitimate CR API tag will always fit.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleTagSchema = v.pipe(
    v.string(),
    v.minLength(4, "Tag must be at least 4 characters."),
    v.maxLength(16, "Tag must be at most 16 characters."),
    v.regex(/^#?[0289CGJLPQRUVY]+$/i, "Tag must match the Clash Royale tag format.")
);

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
 * L1 Core: Flexible List Schema Factory.
 *
 * @remarks
 * Handles endpoints that return either a raw array or an 'items' wrapped object.
 * Previously this validated items as `v.record(v.string(), v.unknown())`, which
 * only asserted "an array of objects" and let arbitrary payload shapes through
 * unchecked. It is now parameterized so every caller supplies a real item
 * schema (e.g. `RoyaleClanMemberSchema`) - the array-or-`{items:[...]}` unwrap
 * transform is preserved unchanged.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export function createRoyaleFlexibleListSchema<TItemSchema extends v.GenericSchema>(
    itemSchema: TItemSchema
) {
    return v.pipe(
        v.union([
            v.array(itemSchema),
            v.object({
                items: v.array(itemSchema)
            })
        ]),
        v.transform((input) => {
            if (Array.isArray(input)) {
                return { items: input };
            }
            return input;
        })
    );
}

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
    wins: v.optional(v.number(), 0),
    battleCount: v.optional(v.number(), 0),
    threeCrownWins: v.optional(v.number(), 0),
    challengeMaxWins: v.optional(v.number(), 0),
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
    // [GUARD] The "20260614T093152.000Z" format is checked HERE, at the validation
    // boundary, rather than left to parseBattleTime()'s Temporal.Instant.from narrowing.
    // [THREAT:] A format drift from the Royale API must become a validation miss for
    // the single offending record, not an uncaught throw that 500s an otherwise
    // successful multi-key fan-out (see fetch-player-battlelog/index.ts).
    battleTime: v.pipe(
        v.string(),
        v.regex(/^\d{4}\d{2}\d{2}T\d{2}\d{2}\d{2}/, "battleTime must match the Royale API timestamp format.")
    ),
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
 * Used both for `RoyaleClanDetailSchema.memberList` (clan profile endpoint) and,
 * via `createRoyaleFlexibleListSchema`, for the dedicated `/clans/{tag}/members`
 * endpoint consumed by `ingest-royale-data/stages/clan-sync.ts`. That endpoint's
 * payload is stored verbatim as the `ingest_raw_clan_members` RPC's `p_payload`
 * and later shredded by `substrate.shred_clan_members()`, which reads
 * `tag`, `name`, `role`, `expLevel`, `trophies`, `donations`,
 * `donationsReceived`, `clanRank`, and `lastSeen` off each element - all listed
 * here so validation does not silently strip fields the shredder needs.
 * expLevel/donations/donationsReceived/clanRank/lastSeen are `v.optional`
 * because the shredder tolerates their absence (NULL-safe casts / COALESCE),
 * matching "validate what the pipeline actually reads."
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleClanMemberSchema = v.object({
    tag: v.string(),
    name: v.string(),
    role: v.optional(v.string()),
    trophies: v.optional(v.number()),
    expLevel: v.optional(v.number()),
    donations: v.optional(v.number()),
    donationsReceived: v.optional(v.number()),
    clanRank: v.optional(v.number()),
    lastSeen: v.optional(v.string())
});

/**
 * Internal: Royale War Log Participant Schema.
 *
 * @remarks
 * Matches the fields `substrate.shred_war_log()` reads off each
 * `standing.clan.participants[]` element to populate `drivers.players` and
 * `drivers.war_activity`. `decksUsed` and `fame` are optional because the
 * shredder casts them with a bare `::INTEGER` (NULL-safe, no COALESCE).
 */
const RoyaleWarLogParticipantSchema = v.object({
    tag: v.string(),
    name: v.string(),
    decksUsed: v.optional(v.number()),
    fame: v.optional(v.number())
});

/**
 * Internal: Royale War Log Standing Schema.
 *
 * @remarks
 * Matches one element of `item.standings[]`. `clan.tag` is required because
 * `shred_war_log()` uses it both as the FK-safe identity for
 * `drivers.war_history` and as the `= NEW.clan_tag` filter that selects which
 * standing's participants get shredded into `drivers.war_activity` - a
 * missing tag would either violate the `war_history.clan_tag` CHECK or
 * silently drop the clan's own participants.
 */
const RoyaleWarLogStandingSchema = v.object({
    rank: v.optional(v.number()),
    clan: v.object({
        tag: v.string(),
        name: v.optional(v.string()),
        fame: v.optional(v.number()),
        clanScore: v.optional(v.number()),
        participants: v.optional(v.array(RoyaleWarLogParticipantSchema), [])
    })
});

/**
 * L1 Core: Royale War Log Item Schema.
 *
 * @remarks
 * Item schema for the `/clans/{tag}/riverracelog` endpoint, used with
 * `createRoyaleFlexibleListSchema` in `ingest-royale-data/stages/clan-sync.ts`.
 * Derived directly from `substrate.shred_war_log()` in
 * `Backend/supabase/migrations/20260531232406_master_migration.sql`, which
 * builds `week_id` from `seasonId` and `sectionIndex` (required - a missing
 * value would produce a NULL `week_id`, violating the `war_history.week_id`
 * and `war_activity.week_id` NOT NULL constraints) and iterates `standings`
 * (optional array, defaults to empty - an entry with no standings simply
 * shreds nothing, which is not an error condition).
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RoyaleWarLogItemSchema = v.object({
    seasonId: v.union([v.string(), v.number()]),
    sectionIndex: v.union([v.string(), v.number()]),
    standings: v.optional(v.array(RoyaleWarLogStandingSchema), [])
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
