// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { AuditEntry } from "../_shared/types.ts";

/**
 * Coverage for `pipeline.ts`, the S1/S2-S5/S6 orchestrator. All three stage
 * handlers are mocked (they each have dedicated specs under
 * `stages/stages-tests/`), so this verifies only the orchestration contract:
 * stages run in order, each is isolated by its own try/catch so one stage
 * throwing does not abort the others, and `diagnostics.duration_ms` is
 * populated on the returned result.
 */

const { mockRunDiscovery, mockRunClanSync, mockRunDeepDepth } = vi.hoisted(() => ({
    mockRunDiscovery: vi.fn(async () => undefined),
    mockRunClanSync: vi.fn(async () => undefined),
    mockRunDeepDepth: vi.fn(async () => undefined),
}));

vi.mock("./stages/discovery.ts", () => ({
    runDiscovery: mockRunDiscovery,
}));

vi.mock("./stages/clan-sync.ts", () => ({
    runClanSync: mockRunClanSync,
}));

vi.mock("./stages/deep-depth.ts", () => ({
    runDeepDepth: mockRunDeepDepth,
}));

import { executePipeline } from "./pipeline.ts";

function makeAuditCollector() {
    const entries: Array<{ stage: string; action: AuditEntry["action"]; details?: unknown }> = [];
    const logAudit = vi.fn((stage: string, action: AuditEntry["action"], details?: unknown) => {
        entries.push({ stage, action, details });
    });
    return { entries, logAudit };
}

beforeAll(() => {
    const mockInstant = {
        since: () => ({ total: (unit: string) => (unit === "milliseconds" ? 99 : 0) }),
    };
    (globalThis as unknown as { Temporal: unknown }).Temporal = {
        Now: { instant: () => mockInstant },
    };
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe("executePipeline orchestration", () => {
    it("runs discovery, clan-sync, and deep-depth in order and returns diagnostics with duration", async () => {
        const callOrder: string[] = [];
        mockRunDiscovery.mockImplementation(async () => {
            callOrder.push("S1_DISCOVERY");
        });
        mockRunClanSync.mockImplementation(async (clanTag: string) => {
            callOrder.push(`S2_S5_CLAN:${clanTag}`);
        });
        mockRunDeepDepth.mockImplementation(async () => {
            callOrder.push("S6_BATTLES");
        });

        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        const result = await executePipeline("#CLAN1", logAudit, heartbeat);

        expect(callOrder).toEqual(["S1_DISCOVERY", "S2_S5_CLAN:#CLAN1", "S6_BATTLES"]);
        expect(result.diagnostics.clan_tag).toBe("#CLAN1");
        expect(result.diagnostics.duration_ms).toBe(99);
        expect(heartbeat).toHaveBeenCalledTimes(3);
    });

    it("continues to clan-sync and deep-depth even when discovery throws", async () => {
        mockRunDiscovery.mockImplementation(async () => {
            throw new Error("discovery blew up");
        });

        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        const result = await executePipeline("#CLAN1", logAudit, heartbeat);

        expect(mockRunClanSync).toHaveBeenCalled();
        expect(mockRunDeepDepth).toHaveBeenCalled();
        // Stage-level failures are only recorded via logAudit inside pipeline.ts's
        // own catch (the discovery.ts internal error is never surfaced on
        // `results` since the mock replaces its real implementation) -- the
        // pipeline itself must not throw or short-circuit.
        expect(result).toBeDefined();
    });

    it("continues to deep-depth even when clan-sync throws", async () => {
        mockRunClanSync.mockImplementation(async () => {
            throw new Error("clan sync blew up");
        });

        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        await executePipeline("#CLAN1", logAudit, heartbeat);

        expect(mockRunDeepDepth).toHaveBeenCalled();
    });

    it("initializes all result substructures to a not-yet-succeeded state before any stage runs", async () => {
        let observedInitialState: unknown;
        mockRunDiscovery.mockImplementation(async (results: any) => {
            observedInitialState = JSON.parse(JSON.stringify(results));
        });

        const { logAudit } = makeAuditCollector();
        const heartbeat = vi.fn(async () => undefined);

        await executePipeline("#CLAN1", logAudit, heartbeat);

        expect(observedInitialState).toMatchObject({
            discovery: { harvested: 0, duplicates: 0 },
            profile: { success: false },
            members: { success: false },
            race: { success: false },
            warlog: { success: false },
            battles: { success: false },
        });
    });
});
