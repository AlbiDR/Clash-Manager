// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import type { ScannerStats, RecruitSource, RecruitSyncRow } from "../../../_shared/types.ts";
import { calculateRpos, calculateWeightedWinRate } from "../../../_shared/utils.ts";

/**
 * Direct coverage of how `runProfiler()` wires calculateRpos()/
 * calculateWeightedWinRate() output into the `RecruitSyncRow` rows persisted
 * via the `sync_recruits` RPC (drivers.recruits). The RPoS formula itself is
 * exhaustively covered by `_shared/shared-tests/utils.spec.ts`; these tests
 * instead verify that `profiler.ts` extracts the right Royale API fields, in
 * the right parameter slots, and carries the results through to the DB
 * payload -- the wiring `utils.spec.ts` cannot see.
 *
 * All Supabase/network/Deno-only boundaries are mocked so this runs under a
 * plain Node/Vitest invocation; see Backend/vitest.config.ts for how the
 * `npm:`-scheme imports inside the mocked-out modules would otherwise fail
 * to resolve under Node.
 */

const { mockSupabase, mockFetchWithRotation, mockProcessBatch, rpcQueues, rpcResponses } = vi.hoisted(() => {
    // get_recent_scans and get_recruits_fate are each called once per runProfiler()
    // invocation (recent-scans de-dupe, then the new-vs-refresh existing check);
    // queue per-RPC-name responses so both calls in a single test can differ.
    const rpcQueues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
    const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};

    const mockSupabase = {
        rpc: vi.fn((name: string, _args?: unknown) => {
            const queue = rpcQueues[name];
            if (queue && queue.length > 0) return Promise.resolve(queue.shift());
            return Promise.resolve(rpcResponses[name] ?? { data: null, error: null });
        }),
    };

    const mockFetchWithRotation = vi.fn();

    // Deterministic stand-in for the real `p-limit`-backed processBatch:
    // executes every task sequentially and returns their results, preserving
    // real semantics without depending on p-limit being resolvable at all.
    const mockProcessBatch = vi.fn(async (tasks: Array<() => Promise<unknown>>) => {
        const results: unknown[] = [];
        for (const task of tasks) {
            results.push(await task());
        }
        return results;
    });

    return { mockSupabase, mockFetchWithRotation, mockProcessBatch, rpcQueues, rpcResponses };
});

vi.mock("../../client.ts", () => ({
    supabase: mockSupabase,
}));

vi.mock("../../../_shared/muscle.ts", () => ({
    fetchWithRotation: mockFetchWithRotation,
    processBatch: mockProcessBatch,
}));

import { runProfiler } from "../profiler.ts";

const eligibleProfile = {
    tag: "#PLAYER1",
    name: "Eligible Player",
    trophies: 6200,
    totalDonations: 45000,
    warDayWins: 12,
    wins: 3200,
    battleCount: 5000,
    threeCrownWins: 900,
    challengeCardsWon: 8000,
    challengeMaxWins: 15, // >= GRAND_CHALLENGE_WIN_THRESHOLD: exercises the Grand Challenge bonus branch too
    clan: null,
};

function freshStats(): ScannerStats {
    return {
        discovery_targets: 0,
        profiles_scanned: 0,
        recruits_ingested: 0,
        errors: [],
    };
}

type TemporalStub = {
    Now: {
        instant: () => { subtract: () => { toString: () => string } };
    };
};

beforeAll(() => {
    // Node has no native Temporal global; runProfiler() only uses it to
    // compute a threshold string, so a minimal stub is sufficient here.
    (globalThis as unknown as { Temporal: TemporalStub }).Temporal = {
        Now: {
            instant: () => ({
                subtract: () => ({ toString: () => "2026-07-25T00:00:00.000Z" }),
            }),
        },
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(rpcQueues)) delete rpcQueues[key];
    for (const key of Object.keys(rpcResponses)) delete rpcResponses[key];
});

describe("runProfiler recruit persistence wiring", () => {
    it("wires calculateRpos()/calculateWeightedWinRate() output into the sync_recruits payload for an eligible recruit", async () => {
        rpcQueues.get_recent_scans = [{ data: [], error: null }]; // nothing recently scanned, so the candidate is fetched
        rpcQueues.get_recruits_fate = [{ data: [{ player_tag: "#PLAYER1" }], error: null }]; // already known -> refresh path (skips fate-telemetry polling)
        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => eligibleProfile,
        });

        const candidates = new Map([["#PLAYER1", "TOURNAMENT"]]);
        const stats = freshStats();

        await runProfiler(candidates, new Set(), 5000, stats, vi.fn());

        const syncCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncCall).toBeDefined();

        const recruits = syncCall![1].p_recruits;
        expect(recruits).toHaveLength(1);

        const expectedRawScore = calculateRpos({
            trophies: eligibleProfile.trophies,
            lifetime_donations: eligibleProfile.totalDonations,
            legacy_war_wins: eligibleProfile.warDayWins,
            wins: eligibleProfile.wins,
            battle_count: eligibleProfile.battleCount,
            three_crown_wins: eligibleProfile.threeCrownWins,
            challenge_cards_won: eligibleProfile.challengeCardsWon,
            challenge_max_wins: eligibleProfile.challengeMaxWins,
        });
        const expectedWinRate = calculateWeightedWinRate(
            eligibleProfile.wins,
            eligibleProfile.battleCount,
            eligibleProfile.threeCrownWins,
        );

        expect(recruits[0]).toMatchObject({
            player_tag: "#PLAYER1",
            player_name: "Eligible Player",
            trophies: eligibleProfile.trophies,
            donations: eligibleProfile.totalDonations,
            war_wins: eligibleProfile.warDayWins,
            raw_potential_score: expectedRawScore,
            win_rate: expectedWinRate,
        });
        expect(stats.highest_rpos).toBe(Math.round(expectedRawScore));
    });

    it("excludes clanned candidates from ingestion and never calls sync_recruits", async () => {
        rpcQueues.get_recent_scans = [{ data: [], error: null }]; // validRecruits stays empty (clanned), so get_recruits_fate is never called
        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ...eligibleProfile, tag: "#PLAYER2", clan: { tag: "#SOMECLAN" } }),
        });

        const candidates = new Map([["#PLAYER2", "TOURNAMENT"]]);
        const stats = freshStats();

        await runProfiler(candidates, new Set(), 5000, stats, vi.fn());

        const syncCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncCall).toBeUndefined();
    });
});

// [THREAT:] drivers.recruits.source is NOT NULL and CHECK-constrained to four
// values, and profiler sends its rows to sync_recruits in batches, so a single
// row carrying a value the constraint rejects fails every row travelling with
// it. The fallback here used to be 'UNKNOWN', which is precisely the one value
// the constraint forbids: the guard written to be safe was the only way to lose
// a batch. It was unreachable only because both writers of `candidates` happened
// to set a literal, and nothing enforced that.
describe("runProfiler discovery-source integrity", () => {
    // The legal values are read from the migration that declares them rather than
    // restated here. A copy would keep passing after the constraint changed, which
    // is the failure this whole test exists to prevent.
    function legalSourcesFromMigration(): string[] {
        const sql = readFileSync(
            new URL("../../../../migrations/20260531232406_master_migration.sql", import.meta.url),
            "utf8",
        );
        const column = /source text NOT NULL CHECK \(source = ANY \(ARRAY\[([^\]]+)\]\)\)/.exec(sql);
        expect(column, "could not locate the source CHECK constraint in the master migration").not.toBeNull();
        return [...column![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    }

    it("emits only sources the database CHECK constraint accepts", async () => {
        const legal = legalSourcesFromMigration();
        // Guards the loop below against passing vacuously if the regex ever stops matching.
        expect(legal.length).toBeGreaterThan(0);
        expect(legal).toContain("TOURNAMENT");

        rpcQueues.get_recent_scans = [{ data: [], error: null }];
        rpcQueues.get_recruits_fate = [{ data: [{ player_tag: "#PLAYER1" }], error: null }];
        mockFetchWithRotation.mockResolvedValue({ ok: true, status: 200, json: async () => eligibleProfile });

        const candidates = new Map<string, RecruitSource>([["#PLAYER1", "TOURNAMENT"]]);
        const stats = freshStats();
        await runProfiler(candidates, new Set(), 5000, stats, vi.fn());

        const rows = mockSupabase.rpc.mock.calls
            .filter(([name]: [string]) => name === "sync_recruits")
            .flatMap(([, args]: [string, { p_recruits: RecruitSyncRow[] }]) => args.p_recruits);

        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(legal, `row for ${row.player_tag} carried an illegal source`).toContain(row.source);
        }
    });

    // [DECISION LOG] A candidate whose provenance cannot be read is skipped and
    // recorded, never relabelled. Substituting a plausible source is the
    // PROVENANCE_ERASURE bug fixed in v14.50.33 wearing a different hat, and
    // substituting an implausible one destroys the batch.
    it("skips a candidate with no recorded source instead of batching an invalid one", async () => {
        rpcQueues.get_recent_scans = [{ data: [], error: null }];
        rpcQueues.get_recruits_fate = [{ data: [{ player_tag: "#PLAYER1" }], error: null }];
        mockFetchWithRotation.mockResolvedValue({ ok: true, status: 200, json: async () => eligibleProfile });

        // The invariant broken deliberately: a key present with no source behind it.
        const candidates = new Map([["#PLAYER1", undefined]]) as unknown as Map<string, RecruitSource>;
        const stats = freshStats();
        await runProfiler(candidates, new Set(), 5000, stats, vi.fn());

        const rows = mockSupabase.rpc.mock.calls
            .filter(([name]: [string]) => name === "sync_recruits")
            .flatMap(([, args]: [string, { p_recruits: RecruitSyncRow[] }]) => args.p_recruits);

        // Nothing is written for it, and nothing invents a source on its behalf.
        expect(rows).toHaveLength(0);
        // And the skip is recorded rather than silent: a candidate vanishing without
        // a trace is how this would go unnoticed a second time.
        expect(stats.errors.some((e) => e.includes("no discovery source"))).toBe(true);
    });
});
