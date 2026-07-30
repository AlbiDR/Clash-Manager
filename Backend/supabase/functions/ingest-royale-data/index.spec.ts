// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

/**
 * Coverage for `ingest-royale-data/index.ts`, the public Deno.serve entry
 * point. `./pipeline.ts` is mocked out (it has its own dedicated spec) so
 * this verifies the L5 protocol wiring: CORS, auth, method validation, the
 * `CLAN_TAG` tag-format guard, tag normalization before it reaches
 * `executePipeline`, and the fallback to `CONFIG.CLAN_TAG` when the caller
 * omits it -- matching sibling functions (sync-player-cards,
 * fetch-player-battlelog). The real `_shared/protocol.ts` is used
 * un-mocked, matching `query-royale-api/index.spec.ts`.
 */

vi.mock("./client.ts", () => {
    const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    return {
        CONFIG: {
            SUPABASE_URL: "https://test.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "service-key",
            INTERNAL_BEARER_TOKEN: "internal-bearer",
            CLAN_TAG: "#DEFAULTCLAN",
            ROYALE_API_KEYS: "",
        },
        supabase: mockSupabase,
        syncVault: vi.fn().mockResolvedValue(undefined),
    };
});

const mockExecutePipeline = vi.fn();
vi.mock("./pipeline.ts", () => ({
    executePipeline: mockExecutePipeline,
}));

let requestHandler: (req: Request) => Promise<Response>;

beforeAll(async () => {
    const envStore: Record<string, string> = {
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        INTERNAL_BEARER_TOKEN: "internal-bearer",
        CLAN_TAG: "#DEFAULTCLAN",
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
    mockExecutePipeline.mockReset();
    mockExecutePipeline.mockResolvedValue({ diagnostics: { clan_tag: "#DEFAULTCLAN", duration_ms: 1 } });
});

describe("ingest-royale-data Edge Function", () => {
    it("handles CORS OPTIONS preflight", async () => {
        const req = new Request("https://test.co/ingest-royale-data", { method: "OPTIONS" });
        const response = await requestHandler(req);
        expect(response.status).toBe(200);
    });

    it("blocks unauthorized requests with 401", async () => {
        const req = new Request("https://test.co/ingest-royale-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(401);
    });

    it("rejects non-POST methods with 405", async () => {
        const req = new Request("https://test.co/ingest-royale-data", {
            method: "GET",
            headers: { "Authorization": "Bearer internal-bearer" },
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(405);
    });

    it("accepts an absent body (pg_cron trigger case) and falls back to CONFIG.CLAN_TAG", async () => {
        const req = new Request("https://test.co/ingest-royale-data", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer" },
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(200);
        expect(mockExecutePipeline).toHaveBeenCalledTimes(1);
        expect(mockExecutePipeline.mock.calls[0][0]).toBe("#DEFAULTCLAN");
    });

    it("rejects a malformed CLAN_TAG payload (400) and never calls executePipeline", async () => {
        const req = new Request("https://test.co/ingest-royale-data", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ CLAN_TAG: "not-a-valid-tag!!" }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(400);
        expect(mockExecutePipeline).not.toHaveBeenCalled();
    });

    it("normalizes a lowercase/prefix-less caller-supplied CLAN_TAG before calling executePipeline", async () => {
        const req = new Request("https://test.co/ingest-royale-data", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({ CLAN_TAG: "2pp0lqq" }),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(200);
        expect(mockExecutePipeline.mock.calls[0][0]).toBe("#2PP0LQQ");
    });

    it("degrades to a classified 500 INTERNAL_ERROR when executePipeline throws", async () => {
        mockExecutePipeline.mockRejectedValue(new Error("pipeline blew up"));
        const req = new Request("https://test.co/ingest-royale-data", {
            method: "POST",
            headers: { "Authorization": "Bearer internal-bearer", "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        const response = await requestHandler(req);
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.code).toBe("INTERNAL_ERROR");
    });
});
