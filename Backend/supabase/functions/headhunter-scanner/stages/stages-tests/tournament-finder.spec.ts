// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScannerStats, AuditEntry } from "../../../_shared/types.ts";

/**
 * Coverage for the F4 fix in `tournament-finder.ts`: `upsert_discovery_cache`
 * resolves with `{ error }` instead of throwing. Before the fix an unchecked
 * call would leave the discovery cache silently un-populated on failure while
 * the pipeline moved on as if the tournament had been recorded, causing the
 * same tournament to be re-fetched (and its members re-added as candidates)
 * on every subsequent run. These tests prove:
 *   (a) a failed `upsert_discovery_cache` is recorded in `stats.errors` and
 *       logged, but does NOT corrupt the `candidates` map -- the discovered
 *       candidate is still added regardless of the cache-write outcome,
 *       since discovery and cache-bookkeeping are independent concerns;
 *   (b) a failed `report_anchor_yield` is recorded in `stats.errors` without
 *       throwing or losing already-discovered candidates.
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

import { runTournamentDiscovery } from "../tournament-finder.ts";

function freshStats(): ScannerStats {
    return {
        discovery_targets: 0,
        discovery_tournament: 0,
        profiles_scanned: 0,
        recruits_ingested: 0,
        errors: [],
    };
}

function makeAuditCollector() {
    const entries: Array<{ stage: string; action: AuditEntry["action"]; details?: unknown }> = [];
    const logAudit = vi.fn((stage: string, action: AuditEntry["action"], details?: unknown) => {
        entries.push({ stage, action, details });
    });
    return { entries, logAudit };
}

// Route every keyword search to the same single tournament with one
// clanless member, so exactly one candidate surfaces per run regardless of
// how many keywords fan out (anchors default to a 36-keyword DB fetch, or a
// 36-letter fallback if that RPC fails/returns empty).
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
    // Restrict to a single anchor keyword so every fetched tournament maps
    // 1:1 to the single candidate above, keeping assertions deterministic.
    rpcResponses.get_active_discovery_anchors = { data: [{ keyword: "sol" }], error: null };
    rpcResponses.get_discovery_cache = { data: [], error: null };
    rpcResponses.report_anchor_yield = { data: null, error: null };
});

describe("runTournamentDiscovery failed-write gating (F4)", () => {
    it("still adds the discovered candidate when upsert_discovery_cache fails, but records the error", async () => {
        rpcResponses.upsert_discovery_cache = { data: null, error: { message: "cache write failed" } };
        mockRoyaleRoutes();

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        await runTournamentDiscovery(candidates, new Set(), 5000, stats, logAudit);

        expect(candidates.get("#RECRUIT1")).toBe("TOURNAMENT");
        expect(stats.discovery_targets).toBe(1);

        expect(stats.errors.some((e) => e.includes("cache write failed"))).toBe(true);
        const failureEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("Discovery cache upsert failed"),
        );
        expect(failureEntry).toBeDefined();
    });

    it("records no error and populates the cache write when upsert_discovery_cache succeeds", async () => {
        rpcResponses.upsert_discovery_cache = { data: null, error: null };
        mockRoyaleRoutes();

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { logAudit } = makeAuditCollector();

        await runTournamentDiscovery(candidates, new Set(), 5000, stats, logAudit);

        const cacheCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "upsert_discovery_cache");
        expect(cacheCall).toBeDefined();
        expect(cacheCall![1]).toEqual({ p_tag: "#TOURNEY1", p_type: "TOURNAMENT" });
        expect(stats.errors).toHaveLength(0);
    });

    it("records an error but does not throw or drop discovered candidates when report_anchor_yield fails", async () => {
        rpcResponses.upsert_discovery_cache = { data: null, error: null };
        rpcResponses.report_anchor_yield = { data: null, error: { message: "anchor yield write failed" } };
        mockRoyaleRoutes();

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        await expect(runTournamentDiscovery(candidates, new Set(), 5000, stats, logAudit)).resolves.toBeUndefined();

        expect(candidates.get("#RECRUIT1")).toBe("TOURNAMENT");
        expect(stats.errors.some((e) => e.includes("anchor yield write failed"))).toBe(true);

        const failureEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("Anchor yield report failed"),
        );
        expect(failureEntry).toBeDefined();
    });

    it("does not add an already-cached (blacklisted) tournament's members as candidates", async () => {
        rpcResponses.get_discovery_cache = { data: [{ player_tag: "#TOURNEY1" }], error: null };
        rpcResponses.upsert_discovery_cache = { data: null, error: null };
        mockRoyaleRoutes();

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { logAudit } = makeAuditCollector();

        await runTournamentDiscovery(candidates, new Set(), 5000, stats, logAudit);

        expect(candidates.size).toBe(0);
        expect(stats.discovery_targets).toBe(0);
        // A blacklisted tournament's details are never re-fetched, so the cache
        // RPC (which only fires after a details fetch) is never called either.
        expect(mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "upsert_discovery_cache")).toBeUndefined();
    });
});
