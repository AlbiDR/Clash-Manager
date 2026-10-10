// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "../_shared/types.ts";

const state = vi.hoisted(() => ({
    rpc: vi.fn(),
    fetch: vi.fn(),
    discovery: vi.fn(),
    deepDepth: vi.fn(),
}));

vi.mock("./client.ts", () => ({
    CONFIG: {
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        INTERNAL_BEARER_TOKEN: "internal-bearer",
        CLAN_TAG: "#CLAN1",
        ROYALE_API_KEYS: "",
    },
    supabase: { rpc: state.rpc },
    syncVault: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_shared/muscle.ts", () => ({
    fetchWithRotation: state.fetch,
}));

vi.mock("./stages/discovery.ts", () => ({
    runDiscovery: state.discovery,
}));

vi.mock("./stages/deep-depth.ts", () => ({
    runDeepDepth: state.deepDepth,
}));

const REQUIRED_RPC_BY_STAGE = {
    profile: "ingest_raw_clan_profile",
    members: "ingest_raw_clan_members",
    race: "ingest_raw_river_race",
    warlog: "ingest_raw_war_log",
} as const;

const VALID_API_RESPONSES: Record<string, unknown> = {
    "/clans/%23CLAN1": { tag: "#CLAN1", name: "Test Clan" },
    "/clans/%23CLAN1/members": { items: [{ tag: "#MEMBER1", name: "Member One" }] },
    "/clans/%23CLAN1/currentriverrace": { state: "warDay", clan: { tag: "#CLAN1", fame: 100 } },
    "/clans/%23CLAN1/riverracelog?limit=12": { items: [{ seasonId: 100, sectionIndex: 3 }] },
};

let requestHandler: (request: Request) => Promise<Response>;

function makeRequest(): Request {
    return new Request("https://test.co/ingest-royale-data", {
        method: "POST",
        headers: { Authorization: "Bearer internal-bearer", "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
}

function makeAuditCollector() {
    return vi.fn((_stage: string, _action: AuditEntry["action"], _details?: unknown) => undefined);
}

beforeAll(async () => {
    const envStore: Record<string, string> = { INTERNAL_BEARER_TOKEN: "internal-bearer" };
    const mockInstant = {
        toString: () => "2026-10-10T00:00:00.000Z",
        since: () => ({ total: (unit: string) => (unit === "milliseconds" ? 42 : 0) }),
    };
    (globalThis as unknown as { Temporal: unknown }).Temporal = { Now: { instant: () => mockInstant } };
    (globalThis as unknown as { Deno: unknown }).Deno = {
        env: {
            get: (key: string) => envStore[key] || "",
            toObject: () => ({ ...envStore }),
            set: (key: string, value: string) => { envStore[key] = value; },
            delete: (key: string) => { delete envStore[key]; },
            has: (key: string) => key in envStore,
        },
        serve: vi.fn((handler: (request: Request) => Promise<Response>) => { requestHandler = handler; }),
    };

    await import("./index.ts");
    if (!requestHandler) throw new Error("ingest-royale-data did not register its request handler");
});

beforeEach(() => {
    vi.clearAllMocks();
    state.rpc.mockImplementation(async (name: string) => {
        if (name === "report_telemetry") return { data: { id: "telemetry-1" }, error: null };
        return { data: null, error: null };
    });
    state.fetch.mockImplementation(async (path: string) => ({
        ok: Object.hasOwn(VALID_API_RESPONSES, path),
        status: Object.hasOwn(VALID_API_RESPONSES, path) ? 200 : 404,
        json: async () => VALID_API_RESPONSES[path],
    }));
    state.discovery.mockImplementation(async () => undefined);
    state.deepDepth.mockImplementation(async () => undefined);
});

describe("ingest-royale-data required-write completion", () => {
    it.each(Object.entries(REQUIRED_RPC_BY_STAGE))(
        "fails terminal completion when the %s persistence RPC fails",
        async (_stage, failedRpc) => {
            state.rpc.mockImplementation(async (name: string) => {
                if (name === "report_telemetry") return { data: { id: "telemetry-1" }, error: null };
                if (name === failedRpc) {
                    return { data: null, error: { message: "private schema detail from persistence" } };
                }
                return { data: null, error: null };
            });

            const response = await requestHandler(makeRequest());
            const body = await response.json();
            const calls = state.rpc.mock.calls as Array<[string, unknown]>;
            const telemetryClose = calls.find(([name, args]) =>
                name === "update_telemetry" && (args as { p_status?: string }).p_status === "FAILED",
            );
            const heartbeatStatuses = calls
                .filter(([name]) => name === "report_heartbeat")
                .map(([, args]) => (args as { p_status: string }).p_status);

            expect(response.status).toBe(500);
            expect(body).toMatchObject({ code: "INTERNAL_ERROR", error: "Internal Server Error" });
            expect(JSON.stringify(body)).not.toContain("private schema detail from persistence");
            expect(calls.some(([name]) => name === failedRpc)).toBe(true);
            expect(telemetryClose).toBeDefined();
            expect(heartbeatStatuses).toContain("FAILED");
            expect(heartbeatStatuses).not.toContain("COMPLETED");
        },
    );

    it("keeps successful no-op writes complete when discovery reports a failure", async () => {
        state.discovery.mockImplementation(async (_results: { discovery: { error?: string } }, logAudit: ReturnType<typeof makeAuditCollector>) => {
            _results.discovery.error = "discovery endpoint unavailable";
            logAudit("S1_DISCOVERY", "error", { message: "discovery endpoint unavailable" });
        });
        state.deepDepth.mockImplementation(async (results: { battles: { success: boolean } }) => {
            results.battles.success = true;
        });

        const response = await requestHandler(makeRequest());
        const body = await response.json();
        const calls = state.rpc.mock.calls as Array<[string, unknown]>;
        const telemetryClose = calls.find(([name, args]) =>
            name === "update_telemetry" && (args as { p_status?: string }).p_status === "SUCCESS",
        );
        const heartbeatStatuses = calls
            .filter(([name]) => name === "report_heartbeat")
            .map(([, args]) => (args as { p_status: string }).p_status);

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(telemetryClose).toBeDefined();
        expect(heartbeatStatuses).toContain("COMPLETED");
        expect(Object.values(REQUIRED_RPC_BY_STAGE).every((rpc) =>
            calls.some(([name]) => name === rpc),
        )).toBe(true);
    });

    it("fails completion when a required clan transport throws", async () => {
        state.fetch.mockImplementation(async (path: string) => {
            if (path === "/clans/%23CLAN1/members") throw new Error("transport detail must stay private");
            return {
                ok: Object.hasOwn(VALID_API_RESPONSES, path),
                status: Object.hasOwn(VALID_API_RESPONSES, path) ? 200 : 404,
                json: async () => VALID_API_RESPONSES[path],
            };
        });

        const response = await requestHandler(makeRequest());
        const body = await response.json();
        const calls = state.rpc.mock.calls as Array<[string, unknown]>;

        expect(response.status).toBe(500);
        expect(body.code).toBe("INTERNAL_ERROR");
        expect(JSON.stringify(body)).not.toContain("transport detail must stay private");
        expect(calls.some(([name, args]) => name === "update_telemetry" &&
            (args as { p_status?: string }).p_status === "FAILED")).toBe(true);
        expect(calls.filter(([name]) => name === "report_heartbeat")
            .map(([, args]) => (args as { p_status: string }).p_status)).not.toContain("COMPLETED");
    });

    it("fails closed when clan sync times out even if its late writes finish before pipeline return", async () => {
        state.discovery.mockImplementation(async () => undefined);
        let resolveProfileResponse: ((response: {
            ok: boolean;
            status: number;
            json: () => Promise<unknown>;
        }) => void) | undefined;
        const pendingProfileResponse = new Promise<{
            ok: boolean;
            status: number;
            json: () => Promise<unknown>;
        }>((resolve) => { resolveProfileResponse = resolve; });
        state.fetch.mockImplementation(async (path: string) => {
            if (path === "/clans/%23CLAN1") return await pendingProfileResponse;
            return {
                ok: Object.hasOwn(VALID_API_RESPONSES, path),
                status: Object.hasOwn(VALID_API_RESPONSES, path) ? 200 : 404,
                json: async () => VALID_API_RESPONSES[path],
            };
        });

        let markDeepDepthEntered: (() => void) | undefined;
        const deepDepthEntered = new Promise<void>((resolve) => { markDeepDepthEntered = resolve; });
        let releaseDeepDepth: (() => void) | undefined;
        state.deepDepth.mockImplementation(async () => {
            markDeepDepthEntered?.();
            await new Promise<void>((resolve) => { releaseDeepDepth = resolve; });
        });

        const originalSetTimeout = globalThis.setTimeout;
        let stageTimerCount = 0;
        globalThis.setTimeout = ((handler: TimerHandler, _delay?: number, ...args: unknown[]) => {
            stageTimerCount += 1;
            // Discovery owns the first stage timer; expire the clan stage's timer.
            // This keeps the real request/protocol event loop active without waiting ten minutes.
            if (stageTimerCount === 2 && typeof handler === "function") {
                queueMicrotask(() => handler(...args));
            }
            return stageTimerCount as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout;
        try {
            const responsePromise = requestHandler(makeRequest());
            await deepDepthEntered;
            resolveProfileResponse?.({
                ok: true,
                status: 200,
                json: async () => VALID_API_RESPONSES["/clans/%23CLAN1"],
            });
            await vi.waitFor(() => {
                const calls = state.rpc.mock.calls as Array<[string, unknown]>;
                expect(Object.values(REQUIRED_RPC_BY_STAGE).every((rpc) =>
                    calls.some(([name]) => name === rpc),
                )).toBe(true);
            });
            releaseDeepDepth?.();

            const response = await responsePromise;
            const body = await response.json();
            const calls = state.rpc.mock.calls as Array<[string, unknown]>;

            expect(response.status).toBe(500);
            expect(body.code).toBe("INTERNAL_ERROR");
            expect(calls.some(([name, args]) => name === "update_telemetry" &&
                (args as { p_status?: string }).p_status === "FAILED")).toBe(true);
            expect(calls.filter(([name]) => name === "report_heartbeat")
                .map(([, args]) => (args as { p_status: string }).p_status)).not.toContain("COMPLETED");
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
    });
});
