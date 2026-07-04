// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";

/**
 * L1 Core: Backend Substrate & Infrastructure Schemas
 * Authoritative validation for internal telemetry, security, and database snapshots.
 */

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
