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
export const RoyaleFlexibleListSchema = v.union([
    v.array(v.record(v.string(), v.unknown())),
    v.object({
        items: v.array(v.record(v.string(), v.unknown()))
    })
]);

/** [GUARD] River Race Schema. */
export const RoyaleRiverRaceSchema = v.object({
    state: v.string(),
    clan: v.object({
        tag: v.string(),
        fame: v.optional(v.number())
    })
});
