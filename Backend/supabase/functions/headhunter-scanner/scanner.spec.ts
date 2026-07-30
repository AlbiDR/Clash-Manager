// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { AuditEntry } from "../_shared/types.ts";

/**
 * Coverage for `scanner.ts`, the S0-S4 orchestrator. All five stage handlers
 * are mocked out (they each have their own dedicated specs under
 * `stages/stages-tests/`) so this file verifies only the orchestration
 * contract itself:
 *   - context boot validation gates the whole run;
 *   - stages execute in the documented S0-S4 order;
 *   - the S2 tournament stage only runs when "AUTO" is requested;
 *   - the F7 epoch-guard fix: `update_epoch_state` resolves with `{ error }`
 *     instead of throwing, so a failed write must be captured into
 *     `stats.errors` and must NOT be reported as a successful 'terminated'
 *     audit entry, without aborting the overall scanner result.
 */

const {
    mockSupabase,
    mockRunGhostPurge,
    mockRunShadowScout,
    mockRunTournamentDiscovery,
    mockRunProfiler,
    mockRunRescan,
    rpcResponses,
} = vi.hoisted(() => {
    const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};
    const mockSupabase = {
        rpc: vi.fn((name: string, args: unknown) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
    };
    return {
        mockSupabase,
        mockRunGhostPurge: vi.fn(async () => 0),
        mockRunShadowScout: vi.fn(async () => undefined),
        mockRunTournamentDiscovery: vi.fn(async () => undefined),
        mockRunProfiler: vi.fn(async () => undefined),
        mockRunRescan: vi.fn(async () => undefined),
        rpcResponses,
    };
});

vi.mock("./client.ts", () => ({
    supabase: mockSupabase,
}));

vi.mock("./stages/ghost-purge.ts", () => ({
    runGhostPurge: mockRunGhostPurge,
}));

vi.mock("./stages/shadow-scout.ts", () => ({
    runShadowScout: mockRunShadowScout,
}));

vi.mock("./stages/tournament-finder.ts", () => ({
    runTournamentDiscovery: mockRunTournamentDiscovery,
}));

vi.mock("./stages/profiler.ts", () => ({
    runProfiler: mockRunProfiler,
}));

vi.mock("./stages/rescan.ts", () => ({
    runRescan: mockRunRescan,
}));

import { executeScanner } from "./scanner.ts";

function makeAuditCollector() {
    const entries: Array<{ stage: string; action: AuditEntry["action"]; details?: unknown }> = [];
    const logAudit = vi.fn((stage: string, action: AuditEntry["action"], details?: unknown) => {
        entries.push({ stage, action, details });
    });
    return { entries, logAudit };
}

beforeAll(() => {
    const mockInstant = {
        since: () => ({ total: (unit: string) => (unit === "milliseconds" ? 42 : 0) }),
    };
    (globalThis as unknown as { Temporal: unknown }).Temporal = {
        Now: { instant: () => mockInstant },
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(rpcResponses)) delete rpcResponses[key];
    rpcResponses.get_headhunter_context = { data: { required_trophies: 5000, exclusion_tags: [] }, error: null };
    rpcResponses.update_epoch_state = { data: null, error: null };
});

describe("executeScanner orchestration", () => {
    it("throws before running any stage when the headhunter context RPC fails validation", async () => {
        rpcResponses.get_headhunter_context = { data: null, error: { message: "context fetch failed" } };
        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        await expect(executeScanner(["AUTO"], logAudit, heartbeat)).rejects.toThrow("Scanner context initialization failed");

        expect(mockRunGhostPurge).not.toHaveBeenCalled();
        expect(mockRunShadowScout).not.toHaveBeenCalled();
    });

    it("runs S0-S4 stages in order and only runs tournament discovery when 'AUTO' is requested", async () => {
        const callOrder: string[] = [];
        mockRunGhostPurge.mockImplementation(async () => {
            callOrder.push("S0_GHOST_PURGE");
            return 3;
        });
        mockRunShadowScout.mockImplementation(async () => {
            callOrder.push("S1_SHADOW_SCOUT");
        });
        mockRunTournamentDiscovery.mockImplementation(async () => {
            callOrder.push("S2_TOURNAMENT_DISCOVERY");
        });
        mockRunProfiler.mockImplementation(async () => {
            callOrder.push("S3_PROFILING");
        });
        mockRunRescan.mockImplementation(async () => {
            callOrder.push("S4_RESCAN");
        });

        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        const result = await executeScanner(["AUTO"], logAudit, heartbeat);

        expect(callOrder).toEqual(["S0_GHOST_PURGE", "S1_SHADOW_SCOUT", "S2_TOURNAMENT_DISCOVERY", "S3_PROFILING", "S4_RESCAN"]);
        expect(result.ghosts_purged).toBe(3);
        expect(result.duration_ms).toBe(42);
    });

    it("skips tournament discovery when 'AUTO' is not in the requested tournaments list", async () => {
        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        await executeScanner(["#SOMETAG"], logAudit, heartbeat);

        expect(mockRunTournamentDiscovery).not.toHaveBeenCalled();
        expect(mockRunShadowScout).toHaveBeenCalled();
        expect(mockRunProfiler).toHaveBeenCalled();
        expect(mockRunRescan).toHaveBeenCalled();
    });

    it("records a failed update_epoch_state write in stats.errors and does not log a success 'terminated' entry (F7)", async () => {
        rpcResponses.update_epoch_state = { data: null, error: { message: "epoch write failed" } };
        const { entries, logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        const result = await executeScanner(["AUTO"], logAudit, heartbeat);

        expect(result.errors.some((e) => e.includes("epoch write failed"))).toBe(true);

        const epochErrorEntry = entries.find((entry) => entry.stage === "EPOCH_GUARD" && entry.action === "error");
        expect(epochErrorEntry).toBeDefined();

        const epochSuccessEntry = entries.find((entry) => entry.stage === "EPOCH_GUARD" && entry.action === "terminated");
        expect(epochSuccessEntry).toBeUndefined();
    });

    it("logs a success 'terminated' entry for the epoch guard when update_epoch_state succeeds", async () => {
        const { entries, logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        const result = await executeScanner(["AUTO"], logAudit, heartbeat);

        expect(result.errors).toHaveLength(0);
        const epochSuccessEntry = entries.find((entry) => entry.stage === "EPOCH_GUARD" && entry.action === "terminated");
        expect(epochSuccessEntry).toBeDefined();
    });

    it("continues the run and records the error when an individual stage throws, instead of aborting the whole scan", async () => {
        mockRunShadowScout.mockImplementation(async () => {
            throw new Error("shadow scout blew up");
        });
        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        const result = await executeScanner(["AUTO"], logAudit, heartbeat);

        expect(result.errors.some((e) => e.includes("shadow scout blew up"))).toBe(true);
        // Downstream stages still run despite the S1 failure.
        expect(mockRunProfiler).toHaveBeenCalled();
        expect(mockRunRescan).toHaveBeenCalled();
    });
});
