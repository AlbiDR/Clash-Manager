// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IngestionResult, AuditEntry } from "../../../_shared/types.ts";

/**
 * Coverage for the F5 fix in `discovery.ts`: the tournament-harvest registry
 * write is the same two-phase, non-atomic pattern as `deep-depth.ts`
 * (`sync_players` then `sync_recruits`). These tests prove:
 *   (a) a failed `sync_players` call prevents `sync_recruits` from running,
 *       and the failure is recorded on `results.discovery.error`;
 *   (b) a successful `sync_players` call allows `sync_recruits` to run and
 *       `results.discovery.harvested` reflects the real count;
 *   (c) a failed `sync_recruits` call leaves `results.discovery.harvested`
 *       at 0 (not unconditionally set) and records the error.
 *
 * All Supabase/network/Deno-only boundaries are mocked so this runs under a
 * plain Node/Vitest invocation; `_shared/config.ts` (DISCOVERY_KEYWORDS etc.)
 * is plain constants with no Deno dependency, so it is imported for real.
 */

const { mockSupabase, mockFetchWithRotation, mockProcessBatch, rpcResponses } = vi.hoisted(() => {
    const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};

    const mockSupabase = {
        rpc: vi.fn((name: string, args: unknown) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
    };

    const mockFetchWithRotation = vi.fn();

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

import { runDiscovery } from "../discovery.ts";

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

// One un-clanned recruit surfaces from every keyword's tournament fan-out
// (there are 10 DISCOVERY_KEYWORDS, each searches then fetches details for
// non-full tournaments). We route every keyword to the SAME single
// tournament tag with a single clanless member so exactly one recruit is
// harvested overall regardless of keyword fan-out width.
function mockRoyaleRoutes() {
    mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
        if (endpoint.startsWith("/tournaments?name=")) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ items: [{ tag: "#TOURNEY1", type: "openTournament", capacity: 10, maxCapacity: 50 }] }),
            };
        }
        if (endpoint.startsWith("/tournaments/")) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    tag: "#TOURNEY1",
                    type: "openTournament",
                    membersList: [{ tag: "#RECRUIT1", name: "Fresh Recruit", trophies: 5000, clan: null }],
                }),
            };
        }
        throw new Error(`unexpected endpoint in test: ${endpoint}`);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(rpcResponses)) delete rpcResponses[key];
});

describe("runDiscovery tournament-harvest registry write gating (F5)", () => {
    it("does NOT call sync_recruits when sync_players fails, and records the failure", async () => {
        rpcResponses.report_discovery = { data: null, error: null };
        rpcResponses.sync_players = { data: null, error: { message: "players FK violation" } };
        mockRoyaleRoutes();

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDiscovery(results, logAudit);

        const syncPlayersCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_players");
        expect(syncPlayersCall).toBeDefined();

        const syncRecruitsCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncRecruitsCall).toBeUndefined();

        expect(results.discovery.harvested).toBe(0);
        expect(results.discovery.error).toContain("Player Registry Batch Sync Failure");
        expect(results.discovery.error).toContain("players FK violation");
    });

    it("DOES call sync_recruits when sync_players succeeds, and reports the real harvested count", async () => {
        rpcResponses.report_discovery = { data: null, error: null };
        rpcResponses.sync_players = { data: null, error: null };
        rpcResponses.sync_recruits = { data: null, error: null };
        mockRoyaleRoutes();

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDiscovery(results, logAudit);

        const syncPlayersCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_players");
        expect(syncPlayersCall).toBeDefined();

        const syncRecruitsCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits");
        expect(syncRecruitsCall).toBeDefined();
        expect((syncRecruitsCall![1] as { p_recruits: unknown[] }).p_recruits).toHaveLength(1);

        expect(results.discovery.harvested).toBe(1);
        expect(results.discovery.error).toBeUndefined();
    });

    it("leaves harvested at 0 (not unconditional success) when sync_players succeeds but sync_recruits fails", async () => {
        rpcResponses.report_discovery = { data: null, error: null };
        rpcResponses.sync_players = { data: null, error: null };
        rpcResponses.sync_recruits = { data: null, error: { message: "recruits upsert failed" } };
        mockRoyaleRoutes();

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDiscovery(results, logAudit);

        expect(results.discovery.harvested).toBe(0);
        expect(results.discovery.error).toContain("Recruit Registry Batch Sync Failure");
        expect(results.discovery.error).toContain("recruits upsert failed");
    });

    it("skips the registry write entirely and reports zero harvested when no un-clanned recruits are found", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint.startsWith("/tournaments?name=")) {
                return { ok: true, status: 200, json: async () => ({ items: [] }) };
            }
            throw new Error(`unexpected endpoint in test: ${endpoint}`);
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runDiscovery(results, logAudit);

        expect(mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_players")).toBeUndefined();
        expect(mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "sync_recruits")).toBeUndefined();
        expect(results.discovery.harvested).toBe(0);
        expect(results.discovery.error).toBeUndefined();
    });

    it("logs a failure and continues when report_discovery RPC errors, without losing the harvest", async () => {
        rpcResponses.report_discovery = { data: null, error: { message: "discovery report write failed" } };
        rpcResponses.sync_players = { data: null, error: null };
        rpcResponses.sync_recruits = { data: null, error: null };
        mockRoyaleRoutes();

        const results = freshResults();
        const { entries, logAudit } = makeAuditCollector();

        await runDiscovery(results, logAudit);

        const failureEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("Discovery report failed"),
        );
        expect(failureEntry).toBeDefined();

        // The report_discovery failure is independent telemetry and must not
        // block the actual player/recruit registry harvest.
        expect(results.discovery.harvested).toBe(1);
    });
});
