// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScannerStats, AuditEntry } from "../../../_shared/types.ts";

/**
 * Coverage for `shadow-scout.ts`. Proves:
 *   (a) a failed `get_shadow_discovery_targets` RPC does not populate the
 *       candidates map, is logged, and does not throw;
 *   (b) a valid target list adds only un-excluded tags as "SHADOW"
 *       candidates and increments `stats.discovery_shadow`/`discovery_targets`;
 *   (c) a malformed RPC payload (fails ShadowTargetSchema) is not added to
 *       candidates.
 */

const { mockSupabase, rpcResponses } = vi.hoisted(() => {
    const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};
    const mockSupabase = {
        rpc: vi.fn((name: string) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
    };
    return { mockSupabase, rpcResponses };
});

vi.mock("../../client.ts", () => ({
    supabase: mockSupabase,
}));

import { runShadowScout } from "../shadow-scout.ts";

function freshStats(): ScannerStats {
    return {
        discovery_targets: 0,
        discovery_shadow: 0,
        profiles_scanned: 0,
        recruits_ingested: 0,
        errors: [],
        top50_unknown_reasons: [],
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

describe("runShadowScout", () => {
    it("does not populate candidates and logs the failure when the RPC errors", async () => {
        rpcResponses.get_shadow_discovery_targets = { data: null, error: { message: "shadow rpc failed" } };

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        await runShadowScout(candidates, new Set(), stats, logAudit);

        expect(candidates.size).toBe(0);
        const failureEntry = entries.find(
            (entry) => entry.action === "integrity_checked" && JSON.stringify(entry.details).includes("shadow rpc failed"),
        );
        expect(failureEntry).toBeDefined();
        // A failed read is a failure, not "no shadow targets": it must reach stats.errors
        // and keep this run's Top 50 count away from the epoch guard.
        expect(stats.errors.some((error) => error.includes("shadow rpc failed"))).toBe(true);
        expect(stats.top50_unknown_reasons.some((reason) => reason.includes("shadow rpc failed"))).toBe(true);
    });

    it("records nothing unknown when the read answers with no targets", async () => {
        rpcResponses.get_shadow_discovery_targets = { data: [], error: null };

        const stats = freshStats();
        await runShadowScout(new Map<string, string>(), new Set(), stats, makeAuditCollector().logAudit);

        expect(stats.errors).toEqual([]);
        expect(stats.top50_unknown_reasons).toEqual([]);
    });

    it("adds only un-excluded targets as SHADOW candidates and updates stats", async () => {
        rpcResponses.get_shadow_discovery_targets = {
            data: [{ opponent_player_tag: "#SHADOW1" }, { opponent_player_tag: "#EXCLUDED1" }],
            error: null,
        };

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { logAudit } = makeAuditCollector();

        await runShadowScout(candidates, new Set(["#EXCLUDED1"]), stats, logAudit);

        expect(candidates.get("#SHADOW1")).toBe("SHADOW");
        expect(candidates.has("#EXCLUDED1")).toBe(false);
        expect(stats.discovery_shadow).toBe(1);
        expect(stats.discovery_targets).toBe(1);
    });

    it("does not add anything when the RPC payload fails schema validation", async () => {
        rpcResponses.get_shadow_discovery_targets = { data: [{ wrong_field: "#BAD1" }], error: null };

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { entries, logAudit } = makeAuditCollector();

        await runShadowScout(candidates, new Set(), stats, logAudit);

        expect(candidates.size).toBe(0);
        expect(stats.discovery_targets).toBe(0);
        const failureEntry = entries.find(
            (entry) => entry.action === "integrity_checked" && JSON.stringify(entry.details).includes("Unexpected RPC data shape"),
        );
        expect(failureEntry).toBeDefined();
        expect(stats.top50_unknown_reasons).toContain("ShadowScout: shadow targets failed validation");
    });

    it("does not throw when the RPC implementation itself rejects", async () => {
        mockSupabase.rpc.mockImplementationOnce(() => Promise.reject(new Error("network down")));

        const candidates = new Map<string, string>();
        const stats = freshStats();
        const { logAudit } = makeAuditCollector();

        await expect(runShadowScout(candidates, new Set(), stats, logAudit)).resolves.toBeUndefined();
        expect(stats.errors.some((e) => e.includes("network down"))).toBe(true);
        expect(stats.top50_unknown_reasons.some((reason) => reason.includes("network down"))).toBe(true);
    });
});
