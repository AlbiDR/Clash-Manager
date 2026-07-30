// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IngestionResult, AuditEntry } from "../../../_shared/types.ts";

/**
 * Coverage for the F5 fix in `deep-depth.ts`: the shadow-lead registry write
 * is a two-phase, non-atomic operation (`sync_players` then `sync_recruits`).
 * These tests prove the gating is real:
 *   (a) a failed `sync_players` call prevents `sync_recruits` from ever being
 *       invoked, and the failure is recorded on `results.battles`;
 *   (b) a successful `sync_players` call allows `sync_recruits` to run;
 *   (c) `results.battles.success` reflects the actual outcome of the write,
 *       not an unconditional `true`.
 *
 * All Supabase/network/Deno-only boundaries are mocked so this runs under a
 * plain Node/Vitest invocation; the `npm:valibot@1.4.2` schema imports are
 * resolved for real via the `npm:` specifier rewrite in Backend/vitest.config.ts,
 * so validation logic is exercised as-written rather than stubbed out.
 */

const { mockSupabase, mockFetchWithRotation, mockProcessBatch, rpcResponses } = vi.hoisted(() => {
    const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};

    const mockSupabase = {
        rpc: vi.fn((name: string, args: unknown) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
    };

    const mockFetchWithRotation = vi.fn();

    // Deterministic stand-in for the real `p-limit`-backed processBatch: executes
    // every task sequentially, preserving real semantics without depending on
    // p-limit being resolvable at all.
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

import { runDeepDepth } from "../deep-depth.ts";

function freshResults(): IngestionResult {
    return {
        discovery: { harvested: 0, duplicates: 0 },
        profile: { success: false },
        members: { success: false },
        race: { success: false },
        warlog: { success: false },
        battles: { success: false },
        diagnostics: { clan_tag: "#TEST", duration_ms: 0 },
    };
}

function makeAuditCollector() {
    const entries: Array<{ stage: string; action: AuditEntry["action"]; details?: unknown }> = [];
    const logAudit = vi.fn((stage: string, action: AuditEntry["action"], details?: unknown) => {
        entries.push({ stage, action, details });
    });
    return { entries, logAudit };
}

const validBattleLogPayload = [
    {
        type: "PvP",
        battleTime: "20260725T093152.000Z",
        team: [{ tag: "#MEMBER1", name: "Member One", crowns: 3 }],
        opponent: [{ tag: "#SHADOW1", name: "Shadow Opponent", crowns: 1 }],
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(rpcResponses)) delete rpcResponses[key];
});

describe("runDeepDepth shadow-lead registry write gating (F5)", () => {
    it("does NOT call sync_recruits when sync_players fails, and records the failure", async () => {
        rpcResponses.get_ingestion_targets = { data: { members: [], recruits: ["#RECRUIT1"] }, error: null };
        rpcResponses.ingest_player_battles = { data: null, error: null };
        rpcResponses.sync_players = { data: null, error: { message: "players FK violation" } };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => validBattleLogPayload,
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDeepDepth(results, logAudit);

        const syncPlayersCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_players");
        expect(syncPlayersCall).toBeDefined();

        const syncRecruitsCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncRecruitsCall).toBeUndefined();

        expect(results.battles.success).toBe(false);
        expect(results.battles.error).toContain("Player Registry Sync Failure");
        expect(results.battles.error).toContain("players FK violation");
    });

    it("DOES call sync_recruits when sync_players succeeds, and reports success", async () => {
        rpcResponses.get_ingestion_targets = { data: { members: [], recruits: ["#RECRUIT1"] }, error: null };
        rpcResponses.ingest_player_battles = { data: null, error: null };
        rpcResponses.sync_players = { data: null, error: null };
        rpcResponses.sync_recruits = { data: null, error: null };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => validBattleLogPayload,
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDeepDepth(results, logAudit);

        const syncPlayersCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_players");
        expect(syncPlayersCall).toBeDefined();
        expect((syncPlayersCall![1] as { p_players: unknown[] }).p_players).toHaveLength(1);

        const syncRecruitsCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncRecruitsCall).toBeDefined();
        expect((syncRecruitsCall![1] as { p_recruits: unknown[] }).p_recruits).toHaveLength(1);

        expect(results.battles.success).toBe(true);
        expect(results.battles.error).toBeUndefined();
    });

    it("reports failure (not unconditional success) when sync_players succeeds but sync_recruits fails", async () => {
        rpcResponses.get_ingestion_targets = { data: { members: [], recruits: ["#RECRUIT1"] }, error: null };
        rpcResponses.ingest_player_battles = { data: null, error: null };
        rpcResponses.sync_players = { data: null, error: null };
        rpcResponses.sync_recruits = { data: null, error: { message: "recruits upsert failed" } };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => validBattleLogPayload,
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDeepDepth(results, logAudit);

        expect(results.battles.success).toBe(false);
        expect(results.battles.error).toContain("Shadow Lead Batch Upsert Failure");
        expect(results.battles.error).toContain("recruits upsert failed");
    });

    it("reports success when there are no shadow leads to synchronize (no clanless opponents observed)", async () => {
        rpcResponses.get_ingestion_targets = { data: { members: [], recruits: ["#RECRUIT1"] }, error: null };
        rpcResponses.ingest_player_battles = { data: null, error: null };

        // Opponent has a clan tag, so it is never harvested as a shadow lead;
        // sync_players/sync_recruits should never be reached.
        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => [
                {
                    type: "PvP",
                    battleTime: "20260725T093152.000Z",
                    team: [{ tag: "#MEMBER1", name: "Member One", crowns: 3 }],
                    opponent: [{ tag: "#CLANNED1", name: "Clanned Opponent", crowns: 1, clan: { tag: "#SOMECLAN" } }],
                },
            ],
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDeepDepth(results, logAudit);

        expect(mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_players")).toBeUndefined();
        expect(mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits")).toBeUndefined();
        expect(results.battles.success).toBe(true);
    });

    it("throws and records results.battles.error when get_ingestion_targets fails", async () => {
        rpcResponses.get_ingestion_targets = { data: null, error: { message: "targets query failed" } };

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await expect(runDeepDepth(results, logAudit)).rejects.toThrow(/Failed to fetch ingestion targets/);
        expect(results.battles.error).toContain("Failed to fetch ingestion targets");
    });

    it("logs an RPC error for ingest_player_battles without aborting the shadow-lead harvest for other targets", async () => {
        rpcResponses.get_ingestion_targets = { data: { members: [], recruits: ["#RECRUIT1", "#RECRUIT2"] }, error: null };
        rpcResponses.ingest_player_battles = { data: null, error: { message: "battles ingest failed" } };
        rpcResponses.sync_players = { data: null, error: null };
        rpcResponses.sync_recruits = { data: null, error: null };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => validBattleLogPayload,
        });

        const results = freshResults();
        const { entries, logAudit } = makeAuditCollector();

        await runDeepDepth(results, logAudit);

        const ingestErrorEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("battles ingest failed"),
        );
        expect(ingestErrorEntry).toBeDefined();

        // Shadow leads are still harvested from the (still-validated) battle log
        // payload even though the DB ingestion RPC for battles itself failed.
        const syncRecruitsCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncRecruitsCall).toBeDefined();
        expect(results.battles.success).toBe(true);
    });

    it("reports a dead recruit via report_dead_recruit on a 404 and logs failure if that RPC errors", async () => {
        rpcResponses.get_ingestion_targets = { data: { members: [], recruits: ["#GHOST1"] }, error: null };
        rpcResponses.report_dead_recruit = { data: null, error: { message: "purge failed" } };

        mockFetchWithRotation.mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({}),
        });

        const results = freshResults();
        const { entries, logAudit } = makeAuditCollector();

        await runDeepDepth(results, logAudit);

        const deadRecruitCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "report_dead_recruit");
        expect(deadRecruitCall).toBeDefined();
        expect(deadRecruitCall![1]).toEqual({ p_player_tag: "#GHOST1" });

        const failureEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("Failed to report dead recruit"),
        );
        expect(failureEntry).toBeDefined();

        // No shadow leads harvested from a 404 target, so the write phase is
        // never reached: this cannot be conflated with a genuine ingestion success.
        expect(results.battles.success).toBe(true);
    });
});
