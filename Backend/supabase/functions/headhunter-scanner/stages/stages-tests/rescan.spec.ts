// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScannerStats } from "../../../_shared/types.ts";
import { calculateRpos, calculateWeightedWinRate } from "../../../_shared/utils.ts";

/**
 * Direct coverage of how `runRescan()` wires calculateRpos()/
 * calculateWeightedWinRate() output into the `RecruitSyncRow` rows persisted
 * via the `sync_recruits` RPC (drivers.recruits). The RPoS formula itself is
 * exhaustively covered by `_shared/shared-tests/utils.spec.ts`; these tests
 * instead verify that `rescan.ts` extracts the right Royale API fields, in
 * the right parameter slots, and carries the results through to the DB
 * payload -- the wiring `utils.spec.ts` cannot see.
 *
 * All Supabase/network/Deno-only boundaries are mocked so this runs under a
 * plain Node/Vitest invocation; see Backend/vitest.config.ts for how the
 * `npm:`-scheme imports inside the mocked-out modules would otherwise fail
 * to resolve under Node.
 */

const { mockSupabase, mockFetchWithRotation, mockProcessBatch, rpcResponses } = vi.hoisted(() => {
    const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};

    const mockSupabase = {
        rpc: vi.fn((name: string) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
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

    return { mockSupabase, mockFetchWithRotation, mockProcessBatch, rpcResponses };
});

vi.mock("../../client.ts", () => ({
    supabase: mockSupabase,
}));

vi.mock("../../../_shared/muscle.ts", () => ({
    fetchWithRotation: mockFetchWithRotation,
    processBatch: mockProcessBatch,
}));

import { runRescan } from "../rescan.ts";

const staleProfile = {
    tag: "#STALE1",
    name: "Stale Player",
    trophies: 7000,
    totalDonations: 12000,
    warDayWins: 0,
    wins: 900,
    battleCount: 1500,
    threeCrownWins: 300,
    challengeCardsWon: 2000,
    challengeMaxWins: 8,
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

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(rpcResponses)) delete rpcResponses[key];
});

describe("runRescan recruit persistence wiring", () => {
    it("wires calculateRpos()/calculateWeightedWinRate() output into the sync_recruits payload for a refreshed recruit", async () => {
        rpcResponses.get_stale_recruits = { data: [{ player_tag: "#STALE1" }], error: null };
        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => staleProfile,
        });

        const stats = freshStats();
        await runRescan(new Set(), 6000, stats, vi.fn());

        const syncCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncCall).toBeDefined();

        const recruits = syncCall![1].p_recruits;
        expect(recruits).toHaveLength(1);

        const expectedRawScore = calculateRpos({
            trophies: staleProfile.trophies,
            lifetime_donations: staleProfile.totalDonations,
            legacy_war_wins: staleProfile.warDayWins,
            wins: staleProfile.wins,
            battle_count: staleProfile.battleCount,
            three_crown_wins: staleProfile.threeCrownWins,
            challenge_cards_won: staleProfile.challengeCardsWon,
            challenge_max_wins: staleProfile.challengeMaxWins,
        });
        const expectedWinRate = calculateWeightedWinRate(
            staleProfile.wins,
            staleProfile.battleCount,
            staleProfile.threeCrownWins,
        );

        expect(recruits[0]).toMatchObject({
            player_tag: "#STALE1",
            player_name: "Stale Player",
            trophies: staleProfile.trophies,
            donations: staleProfile.totalDonations,
            war_wins: staleProfile.warDayWins,
            raw_potential_score: expectedRawScore,
            win_rate: expectedWinRate,
            status: "ACTIVE", // trophies (7000) >= requiredTrophies (6000)
        });
    });

    it("purges recruits who have since joined a clan and never includes them in the sync_recruits batch", async () => {
        rpcResponses.get_stale_recruits = { data: [{ player_tag: "#STALE2" }], error: null };
        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ ...staleProfile, tag: "#STALE2", clan: { tag: "#ENEMYCLAN" } }),
        });

        const stats = freshStats();
        await runRescan(new Set(), 6000, stats, vi.fn());

        const purgeCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "purge_recruits");
        expect(purgeCall).toBeDefined();
        expect(purgeCall![1]).toEqual({ p_tags: ["#STALE2"] });

        const syncCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncCall).toBeUndefined();
    });

    describe("RPOS field anomaly detection", () => {
        it("triggers anomaly warning and logAudit error when >= 10 profiles are processed and all have 0% win rate despite positive raw scores", async () => {
            // Setup 10 stale recruits
            const staleRecruits = Array.from({ length: 10 }, (_, i) => ({ player_tag: `#STALE_${i}` }));
            rpcResponses.get_stale_recruits = { data: staleRecruits, error: null };

            // Fetch returns profiles with wins = 0 and threeCrownWins = 0 (so win_rate = 0), but positive trophies/donations (so positive raw score)
            mockFetchWithRotation.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    ...staleProfile,
                    wins: 0,
                    threeCrownWins: 0,
                    totalDonations: 1000,
                }),
            });

            const stats = freshStats();
            const logAuditSpy = vi.fn();
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            await runRescan(new Set(), 6000, stats, logAuditSpy);

            // Expect anomaly logged
            const anomalyAudit = logAuditSpy.mock.calls.find(
                ([_stage, action, details]: [string, string, any]) =>
                    action === "integrity_checked" && details?.details?.includes("rpos_field_anomaly")
            );
            expect(anomalyAudit).toBeDefined();
            expect(anomalyAudit![2]).toEqual({
                passed: false,
                details: "rpos_field_anomaly: all rescanned profiles returned 0% win rate with positive raw scores",
            });

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("RPOS FIELD ANOMALY")
            );

            consoleWarnSpy.mockRestore();
        });

        it("does NOT trigger anomaly warning or logAudit error when >= 10 profiles are processed but not all have 0% win rate", async () => {
            const staleRecruits = Array.from({ length: 10 }, (_, i) => ({ player_tag: `#STALE_${i}` }));
            rpcResponses.get_stale_recruits = { data: staleRecruits, error: null };

            // First profile has non-zero win rate, others have 0%
            let fetchCount = 0;
            mockFetchWithRotation.mockImplementation(async () => {
                const profile = {
                    ...staleProfile,
                    wins: fetchCount === 0 ? 500 : 0,
                    threeCrownWins: 0,
                    totalDonations: 1000,
                };
                fetchCount++;
                return {
                    ok: true,
                    status: 200,
                    json: async () => profile,
                };
            });

            const stats = freshStats();
            const logAuditSpy = vi.fn();
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            await runRescan(new Set(), 6000, stats, logAuditSpy);

            const anomalyAudit = logAuditSpy.mock.calls.find(
                ([_stage, action, details]: [string, string, any]) =>
                    action === "integrity_checked" && details?.details?.includes("rpos_field_anomaly")
            );
            expect(anomalyAudit).toBeUndefined();
            expect(consoleWarnSpy).not.toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });

        it("does NOT trigger anomaly warning or logAudit error when fewer than 10 profiles are processed and all have 0% win rate", async () => {
            const staleRecruits = Array.from({ length: 9 }, (_, i) => ({ player_tag: `#STALE_${i}` }));
            rpcResponses.get_stale_recruits = { data: staleRecruits, error: null };

            mockFetchWithRotation.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    ...staleProfile,
                    wins: 0,
                    threeCrownWins: 0,
                    totalDonations: 1000,
                }),
            });

            const stats = freshStats();
            const logAuditSpy = vi.fn();
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            await runRescan(new Set(), 6000, stats, logAuditSpy);

            const anomalyAudit = logAuditSpy.mock.calls.find(
                ([_stage, action, details]: [string, string, any]) =>
                    action === "integrity_checked" && details?.details?.includes("rpos_field_anomaly")
            );
            expect(anomalyAudit).toBeUndefined();
            expect(consoleWarnSpy).not.toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });
    });
});
