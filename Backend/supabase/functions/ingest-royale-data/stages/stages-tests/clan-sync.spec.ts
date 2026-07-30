// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IngestionResult, AuditEntry } from "../../../_shared/types.ts";

/**
 * Coverage for `clan-sync.ts` (Stages 2-5: profile, members, race, warlog).
 *
 * Priority: prove the F6 fix -- a member or war-log record missing a
 * required field must FAIL validation (via `createRoyaleFlexibleListSchema`
 * wrapping `RoyaleClanMemberSchema` / `RoyaleWarLogItemSchema`) instead of
 * silently passing through to the `ingest_raw_clan_members` /
 * `ingest_raw_war_log` RPCs. Also covers the general per-stage success/error
 * gating: an RPC `{ error }` return must mark that stage's `success` false
 * and never call through with unvalidated data.
 */

const { mockSupabase, mockFetchWithRotation } = vi.hoisted(() => {
    const mockSupabase = {
        rpc: vi.fn((name: string, args: unknown) => Promise.resolve({ data: null, error: null })),
    };
    const mockFetchWithRotation = vi.fn();
    return { mockSupabase, mockFetchWithRotation };
});

vi.mock("../../client.ts", () => ({
    supabase: mockSupabase,
}));

vi.mock("../../../_shared/muscle.ts", () => ({
    fetchWithRotation: mockFetchWithRotation,
}));

import { runClanSync } from "../clan-sync.ts";

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

const validProfile = { tag: "#CLAN1", name: "Test Clan" };
const validMember = { tag: "#MEMBER1", name: "Member One" };
const validRace = { state: "ongoing", clan: { tag: "#CLAN1", fame: 100 } };
const validWarLogItem = { seasonId: 100, sectionIndex: 3, standings: [] };

function routeFor(path: string, body: unknown, ok = true, status = 200) {
    mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
        if (endpoint === path) {
            return { ok, status, json: async () => body };
        }
        // Other calls in the sequential syncTasks loop return a benign empty
        // 200 so they validate trivially and do not interfere with the
        // assertion under test, unless overridden by a later routeFor() call
        // (each test only cares about one task in the sequence).
        return { ok: true, status: 200, json: async () => ({}) };
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("runClanSync member/warlog validation boundary (F6)", () => {
    it("fails the members stage when a member record is missing required fields", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint === "/clans/%23CLAN1/members") {
                // Missing 'name', a required field on RoyaleClanMemberSchema.
                return { ok: true, status: 200, json: async () => ({ items: [{ tag: "#MEMBER1" }] }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });

        const results = freshResults();
        const { entries, logAudit } = makeAuditCollector();

        await runClanSync("#CLAN1", results, logAudit);

        expect(results.members.success).toBe(false);
        expect(results.members.error).toBe("VALIDATION_FAILED");

        const ingestCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "ingest_raw_clan_members");
        expect(ingestCall).toBeUndefined();

        const failureEntry = entries.find(
            (entry) => entry.stage === "S2_S5_MEMBERS" && entry.action === "error" && JSON.stringify(entry.details).includes("Validation Failed"),
        );
        expect(failureEntry).toBeDefined();
    });

    it("ingests the members stage successfully when every member record is well-formed", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint === "/clans/%23CLAN1/members") {
                return { ok: true, status: 200, json: async () => ({ items: [validMember] }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runClanSync("#CLAN1", results, logAudit);

        expect(results.members.success).toBe(true);
        const ingestCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "ingest_raw_clan_members");
        expect(ingestCall).toBeDefined();
        expect((ingestCall![1] as { p_payload: { items: unknown[] } }).p_payload.items).toHaveLength(1);
    });

    it("fails the warlog stage when a war-log item is missing required fields (seasonId/sectionIndex)", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint === "/clans/%23CLAN1/riverracelog?limit=12") {
                // Missing 'sectionIndex', a required field on RoyaleWarLogItemSchema.
                return { ok: true, status: 200, json: async () => ({ items: [{ seasonId: 100 }] }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });

        const results = freshResults();
        const { entries, logAudit } = makeAuditCollector();

        await runClanSync("#CLAN1", results, logAudit);

        expect(results.warlog.success).toBe(false);
        expect(results.warlog.error).toBe("VALIDATION_FAILED");

        const ingestCall = mockSupabase.rpc.mock.calls.find(([name]: [string]) => name === "ingest_raw_war_log");
        expect(ingestCall).toBeUndefined();

        const failureEntry = entries.find(
            (entry) => entry.stage === "S2_S5_WARLOG" && entry.action === "error" && JSON.stringify(entry.details).includes("Validation Failed"),
        );
        expect(failureEntry).toBeDefined();
    });

    it("ingests the warlog stage successfully when every item is well-formed", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint === "/clans/%23CLAN1/riverracelog?limit=12") {
                return { ok: true, status: 200, json: async () => ({ items: [validWarLogItem] }) };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runClanSync("#CLAN1", results, logAudit);

        expect(results.warlog.success).toBe(true);
    });

    it("marks the profile stage failed (not unconditionally true) when ingest_raw_clan_profile RPC errors", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint === "/clans/%23CLAN1") {
                return { ok: true, status: 200, json: async () => validProfile };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });

        mockSupabase.rpc.mockImplementation((name: string) => {
            if (name === "ingest_raw_clan_profile") {
                return Promise.resolve({ data: null, error: { message: "profile write failed" } });
            }
            return Promise.resolve({ data: null, error: null });
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runClanSync("#CLAN1", results, logAudit);

        expect(results.profile.success).toBe(false);
        expect(results.profile.error).toBe("profile write failed");
    });

    it("marks a stage failed when the Royale API call itself returns a non-ok HTTP status", async () => {
        mockFetchWithRotation.mockImplementation(async (endpoint: string) => {
            if (endpoint === "/clans/%23CLAN1/currentriverrace") {
                return { ok: false, status: 503, json: async () => ({}) };
            }
            return { ok: true, status: 200, json: async () => ({ items: [] }) };
        });

        const results = freshResults();
        const { logAudit } = makeAuditCollector();

        await runClanSync("#CLAN1", results, logAudit);

        expect(results.race.success).toBe(false);
        expect(results.race.error).toBe("HTTP_503");
    });
});
