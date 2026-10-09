// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { ScannerWorkBudgetExceededError } from "./work-budget.ts";

/**
 * Coverage for `headhunter-scanner/index.ts`, the public Deno.serve entry
 * point. `./scanner.ts` is mocked out (it has its own dedicated spec) so
 * this file verifies the L5 protocol wiring: CORS, auth, method and payload
 * validation (the `tournaments` array bound), and that a valid payload
 * reaches `executeScanner` with the right arguments. The real
 * `_shared/protocol.ts` (`clinicalServe`) is used un-mocked, matching the
 * pattern in `query-royale-api/index.spec.ts` and
 * `fetch-player-battlelog/index.spec.ts`.
 */

const { mockSupabase } = vi.hoisted(() => ({
    mockSupabase: {
        rpc: vi.fn((name: string) => Promise.resolve(
            name === "report_telemetry"
                ? { data: { id: 1 }, error: null }
                : { data: null, error: null },
        )),
    },
}));

vi.mock("./client.ts", () => {
    return {
        CONFIG: {
            SUPABASE_URL: "https://test.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "service-key",
            INTERNAL_BEARER_TOKEN: "internal-bearer",
            ROYALE_API_KEYS: "",
        },
        supabase: mockSupabase,
        syncVault: vi.fn().mockResolvedValue(undefined),
    };
});

const mockExecuteScanner = vi.fn();
vi.mock("./scanner.ts", () => ({
    executeScanner: mockExecuteScanner,
}));

let requestHandler: (req: Request) => Promise<Response>;

beforeAll(async () => {
    const envStore: Record<string, string> = {
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        INTERNAL_BEARER_TOKEN: "internal-bearer",
        ROYALE_API_KEYS: "",
    };

    (globalThis as unknown as { Deno: unknown }).Deno = {
        env: {
            get: (key: string) => envStore[key] || "",
            toObject: () => ({ ...envStore }),
            set: (key: string, value: string) => { envStore[key] = value; },
            delete: (key: string) => { delete envStore[key]; },
            has: (key: string) => key in envStore,
        },
        serve: vi.fn(),
    };

    const mockInstant = {
        toString: () => "2026-07-30T00:00:00.000Z",
        since: () => ({ total: (unit: string) => (unit === "milliseconds" ? 10 : 0) }),
    };
    (globalThis as unknown as { Temporal: unknown }).Temporal = {
        Now: { instant: () => mockInstant },
    };

    await import("./index.ts");

    const serveCalls = ((globalThis as unknown as { Deno: { serve: { mock: { calls: unknown[][] } } } }).Deno.serve).mock.calls;
    if (serveCalls.length === 0) throw new Error("Deno.serve was not called during bootstrap.");
    requestHandler = serveCalls[0][0] as (req: Request) => Promise<Response>;
});

beforeEach(() => {
    mockExecuteScanner.mockReset();
    mockExecuteScanner.mockResolvedValue({ ghosts_purged: 0, errors: [] });
    mockSupabase.rpc.mockClear();
});

describe("headhunter-scanner Edge Function", () => {
    it("handles CORS OPTIONS preflight", async () => {
        const req = new Request("https://test.co/headhunter-scanner", { method: "OPTIONS" });
        const response = await requestHandler(req);
        expect(response.status).toBe(200);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("blocks unauthorized requests with 401", async () => {
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tournaments: [] }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(401);
    });

    it("rejects non-POST methods with 405", async () => {
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "GET",
            headers: { "Authorization": "Bearer internal-bearer" },
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(405);
    });

    it("rejects a tournaments array exceeding 50 entries (400)", async () => {
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ tournaments: Array.from({ length: 51 }, (_, i) => `#T${i}`) }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(400);
        expect(mockExecuteScanner).not.toHaveBeenCalled();
    });

    it("rejects a tournament tag longer than 64 characters (400)", async () => {
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ tournaments: ["#" + "A".repeat(64)] }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(400);
        expect(mockExecuteScanner).not.toHaveBeenCalled();
    });

    it("passes a valid tournaments payload through to executeScanner and returns 200", async () => {
        mockExecuteScanner.mockResolvedValue({ ghosts_purged: 5, errors: [] });
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ tournaments: ["AUTO"] }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.data.ghosts_purged).toBe(5);

        expect(mockExecuteScanner).toHaveBeenCalledTimes(1);
        expect(mockExecuteScanner.mock.calls[0][0]).toEqual(["AUTO"]);
    });

    it("degrades to a classified 500 INTERNAL_ERROR when executeScanner throws", async () => {
        mockExecuteScanner.mockRejectedValue(new Error("scanner context initialization failed"));
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ tournaments: ["AUTO"] }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.code).toBe("INTERNAL_ERROR");
    });

    it("records a scanner budget expiry as FAILED telemetry and heartbeat, never COMPLETED", async () => {
        mockExecuteScanner.mockRejectedValue(new ScannerWorkBudgetExceededError());
        const req = new Request("https://test.co/headhunter-scanner", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ tournaments: ["AUTO"] }),
        });

        const response = await requestHandler(req);
        const body = await response.json();
        const rpcCalls = mockSupabase.rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
        const telemetryStatuses = rpcCalls
            .filter(([name]) => name === "update_telemetry")
            .map(([, args]) => args.p_status);
        const heartbeatStatuses = rpcCalls
            .filter(([name]) => name === "report_heartbeat")
            .map(([, args]) => args.p_status);

        expect(response.status).toBe(500);
        expect(body.code).toBe("INTERNAL_ERROR");
        expect(telemetryStatuses).toEqual(["FAILED"]);
        expect(heartbeatStatuses).toContain("FAILED");
        expect(heartbeatStatuses).not.toContain("COMPLETED");
    });
});
