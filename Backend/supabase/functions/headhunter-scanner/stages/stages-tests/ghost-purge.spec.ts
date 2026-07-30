// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScannerStats, AuditEntry } from "../../../_shared/types.ts";

/**
 * Coverage for the F4 fix in `ghost-purge.ts`: `purge_recruits` and
 * `touch_recruits` resolve with `{ error }` instead of throwing, so an
 * unchecked call would let `ghostsEvicted`/`recruitsRefreshed` advance (and
 * the corresponding audit entries report success) even though the write
 * never landed. These tests prove:
 *   (a) a failed `purge_recruits` for a clanned ghost does NOT increment
 *       `ghostsEvicted` (the function's return value), does not push the
 *       tag into `touchedTags` (the clanned tag is never a "still clanless"
 *       refresh candidate to begin with, so this also guards against any
 *       future accidental cross-contamination), and is recorded in
 *       `stats.errors`;
 *   (b) a failed `purge_recruits` for a dead (404) recruit does NOT
 *       increment the returned eviction count and is recorded;
 *   (c) a failed `touch_recruits` does NOT report any recruits refreshed
 *       and is recorded in `stats.errors`.
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

import { runGhostPurge } from "../ghost-purge.ts";

function freshStats(): ScannerStats {
    return {
        discovery_targets: 0,
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

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(rpcResponses)) delete rpcResponses[key];
});

describe("runGhostPurge failed-write gating (F4)", () => {
    it("does NOT count a clanned ghost as evicted when purge_recruits fails, and records the error", async () => {
        rpcResponses.get_hot_zone_recruits = { data: [{ player_tag: "#GHOST1" }], error: null };
        rpcResponses.purge_recruits = { data: null, error: { message: "purge write failed" } };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                tag: "#GHOST1",
                name: "Ghost Player",
                clan: { tag: "#ENEMYCLAN" },
            }),
        });

        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        const evicted = await runGhostPurge(new Set(), stats, logAudit);

        expect(evicted).toBe(0);
        expect(stats.errors.some((e) => e.includes("purge write failed"))).toBe(true);

        const failureEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("Failed to evict clanned ghost"),
        );
        expect(failureEntry).toBeDefined();

        // A ghost that failed to purge must never be reported as evicted via
        // the success-path audit entry either.
        const successEntry = entries.find(
            (entry) => entry.action === "called" && JSON.stringify(entry.details).includes("evicted_clanned_ghost"),
        );
        expect(successEntry).toBeUndefined();
    });

    it("counts a clanned ghost as evicted only when purge_recruits succeeds", async () => {
        rpcResponses.get_hot_zone_recruits = { data: [{ player_tag: "#GHOST2" }], error: null };
        rpcResponses.purge_recruits = { data: null, error: null };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                tag: "#GHOST2",
                name: "Ghost Player 2",
                clan: { tag: "#ENEMYCLAN" },
            }),
        });

        const stats = freshStats();
        const { logAudit } = makeAuditCollector();

        const evicted = await runGhostPurge(new Set(), stats, logAudit);

        expect(evicted).toBe(1);
        expect(stats.errors).toHaveLength(0);
    });

    it("does NOT count a dead (404) recruit as evicted when purge_recruits fails", async () => {
        rpcResponses.get_hot_zone_recruits = { data: [{ player_tag: "#DEAD1" }], error: null };
        rpcResponses.purge_recruits = { data: null, error: { message: "dead-recruit purge failed" } };

        mockFetchWithRotation.mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({}),
        });

        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        const evicted = await runGhostPurge(new Set(), stats, logAudit);

        expect(evicted).toBe(0);
        expect(stats.errors.some((e) => e.includes("dead-recruit purge failed"))).toBe(true);

        const failureEntry = entries.find(
            (entry) => entry.action === "error" && JSON.stringify(entry.details).includes("Failed to purge dead recruit"),
        );
        expect(failureEntry).toBeDefined();
    });

    it("does NOT report any recruits refreshed when touch_recruits fails, and records the error", async () => {
        rpcResponses.get_hot_zone_recruits = { data: [{ player_tag: "#CLANLESS1" }], error: null };
        rpcResponses.touch_recruits = { data: null, error: { message: "touch write failed" } };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                tag: "#CLANLESS1",
                name: "Clanless Player",
                clan: null,
            }),
        });

        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        await runGhostPurge(new Set(), stats, logAudit);

        // touch_recruits must have been attempted with the still-clanless tag.
        const touchCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "touch_recruits");
        expect(touchCall).toBeDefined();
        expect(touchCall![1]).toEqual({ p_tags: ["#CLANLESS1"] });

        expect(stats.errors.some((e) => e.includes("touch write failed"))).toBe(true);

        const resultedDataEntry = entries.find((entry) => entry.action === "resulted_data");
        expect(resultedDataEntry).toBeDefined();
        expect((resultedDataEntry!.details as { refreshed: number }).refreshed).toBe(0);
    });

    it("reports genuine refresh count when touch_recruits succeeds", async () => {
        rpcResponses.get_hot_zone_recruits = { data: [{ player_tag: "#CLANLESS2" }], error: null };
        rpcResponses.touch_recruits = { data: null, error: null };

        mockFetchWithRotation.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                tag: "#CLANLESS2",
                name: "Clanless Player 2",
                clan: null,
            }),
        });

        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        await runGhostPurge(new Set(), stats, logAudit);

        const resultedDataEntry = entries.find((entry) => entry.action === "resulted_data");
        expect((resultedDataEntry!.details as { refreshed: number }).refreshed).toBe(1);
        expect(stats.errors).toHaveLength(0);
    });
});
