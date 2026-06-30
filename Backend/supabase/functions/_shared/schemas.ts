// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";

/**
 * L1 Core: Shared Royale API Schemas
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
 * L1 Core: Player Sync Payload Schema.
 *
 * @remarks
 * Used for inbound sync-player-cards requests.
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const PlayerSyncPayloadSchema = v.object({
    tag: v.string()
});

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
 * L1 Core: Shadow Discovery Target Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const ShadowTargetSchema = v.object({
    opponent_player_tag: v.string()
});

/**
 * L1 Core: Stale Recruit Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const StaleRecruitSchema = v.object({
    player_tag: v.string()
});

/**
 * L1 Core: Player Card Snapshot Schema (Database Row).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const PlayerCardSnapshotSchema = v.object({
    card_name: v.string(),
    rarity: v.string(),
    absolute_level: v.number(),
    count: v.number(),
    is_tower_troop: v.boolean(),
    fetched_at: v.string(),
    player_name: v.string(),
    king_level: v.number(),
    xp_into_level: v.number()
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
 * L1 Core: Headhunter Context Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const HeadhunterContextSchema = v.object({
    required_trophies: v.number(),
    exclusion_tags: v.array(v.string())
});

/**
 * L1 Core: Discovery Anchor Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const DiscoveryAnchorSchema = v.object({
    keyword: v.string()
});

/**
 * L1 Core: Discovery Cache Item Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const DiscoveryCacheItemSchema = v.object({
    player_tag: v.string()
});

/**
 * L1 Core: Ingestion Targets Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const IngestionTargetsSchema = v.object({
    members: v.array(v.string()),
    recruits: v.array(v.string())
});

/**
 * L1 Core: Recruit Fate Schema (RPC).
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const RecruitFateSchema = v.object({
    status: v.string(),
    raw_potential_score: v.union([v.number(), v.string()])
});

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
 * L1 Core: Integrity Check Details Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const IntegrityCheckDetailsSchema = v.object({
    passed: v.boolean(),
    details: v.optional(v.string()),
    issues: v.optional(v.array(v.unknown()))
});

/**
 * L1 Core: Telemetry Response Schema.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const TelemetrySchema = v.union([
    v.object({ id: v.union([v.string(), v.number()]) }),
    v.array(v.object({ id: v.union([v.string(), v.number()]) }))
]);

/**
 * L1 Core: Royale API Key Pool Schema.
 *
 * @remarks
 * **Normalization:**
 * Automatically normalizes heterogeneous key inputs (JSON arrays, comma-separated
 * strings, or single tokens) into a clinical `string[]`.
 *
 * **Threat Mitigation:**
 * Prevents sync failures and runtime crashes by ensuring that the key pool is
 * always a valid array of strings, even if the Vault or Environment contains
 * malformed data.
 *
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const KeyPoolSchema = v.pipe(
    v.union([v.string(), v.array(v.string())]),
    v.transform((input) => {
        if (Array.isArray(input)) return input.filter(Boolean);
        if (!input) return [];
        try {
            const parsed = JSON.parse(input);
            return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [String(parsed)].filter(Boolean);
        } catch {
            return input.split(",").map((k) => k.trim()).filter(Boolean);
        }
    })
);

/**
 * L1 Core: Vault Secret Schema.
 *
 * @remarks
 * **Normalization:**
 * Coerces heterogeneous Vault results (null, undefined, objects, numbers) into
 * a predictable string format.
 *
 * **Threat Mitigation:**
 * Prevents logic corruption and runtime crashes caused by unexpected database
 * return types (e.g., PostgREST auto-parsing JSON strings into objects).
 *
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const VaultSecretSchema = v.pipe(
    v.unknown(),
    v.transform((input) => {
        if (input === null || input === undefined) return "";
        if (typeof input === "string") return input;
        return JSON.stringify(input);
    }),
    v.string()
);
