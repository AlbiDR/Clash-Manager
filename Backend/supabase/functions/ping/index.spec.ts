// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// [DECISION LOG] client.ts is NOT mocked: ping has no Supabase client to stub, and the
// real module only reads the anon key from the Deno env stubbed in beforeAll below.

let requestHandler: any;

beforeAll(async () => {
  // Mock Deno global completely
  const envStore: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SUPABASE_ANON_KEY: "anon-key",
  };

  globalThis.Deno = {
    env: {
      get: (key: string) => envStore[key] || "",
      toObject: () => ({ ...envStore }),
      set: (key: string, value: string) => { envStore[key] = value; },
      delete: (key: string) => { delete envStore[key]; },
      has: (key: string) => key in envStore,
    },
    serve: vi.fn(),
  } as any;

  // Mock Temporal global because Node 22 does not have it natively
  const mockInstant = {
    toString: () => "2026-07-17T02:00:00.000Z",
    since: () => ({
      total: (unit: string) => unit === "milliseconds" ? 123 : 0,
    }),
  };

  globalThis.Temporal = {
    Now: {
      instant: () => mockInstant as any,
    },
  } as any;

  // Dynamically import the entry point file to trigger Deno.serve registration
  await import("./index.ts");

  const serveCalls = (globalThis.Deno.serve as any).mock.calls;
  if (serveCalls.length > 0) {
    requestHandler = serveCalls[0][0];
  } else {
    throw new Error("Deno.serve was not called during bootstrap.");
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ping Edge Function", () => {
  it("should preserve the public CORS contract while rate limiting the health probe", async () => {
    const req = new Request("https://test.co/ping", { method: "OPTIONS" });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rate limits repeated anon-key probes", async () => {
    const makeRequest = () => new Request("https://test.co/ping", {
      method: "POST",
      headers: {
        "Authorization": "Bearer anon-key",
        "Content-Type": "application/json",
        "x-forwarded-for": "198.51.100.77",
      },
      body: "{}",
    });

    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await requestHandler(makeRequest());
      expect(response.status).toBe(200);
    }

    const limitedResponse = await requestHandler(makeRequest());
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("Retry-After")).toMatch(/^\d+$/);
    await expect(limitedResponse.json()).resolves.toMatchObject({
      error: "Too Many Requests",
      code: "RATE_LIMITED",
    });
  });

  it("should block unauthorized requests (401 Unauthorized)", async () => {
    const req = new Request("https://test.co/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return success with the live backend version when authorized with the anon key", async () => {
    const req = new Request("https://test.co/ping", {
      method: "POST",
      headers: {
        "Authorization": "Bearer anon-key",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // [DECISION LOG] Asserted as a pattern, not a pinned literal: this string is
    // re-synced to the monorepo's ground-truth version on every release by
    // validate-project.ts --fix (see PATHS.protocol), so pinning an exact value here
    // would make this test fail on every single version bump.
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // [THREAT:] Every probe used to insert a telemetry row and two heartbeats. Nothing read
  // them, and when the database was slow the failed insert became a 503 that the app
  // retried. Any write would have to go out over the network, so a probe that makes no
  // network call and has no client to write with wrote nothing.
  it("answers without touching the database: no Supabase client and no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const response = await requestHandler(new Request("https://test.co/ping", {
        method: "POST",
        headers: {
          "Authorization": "Bearer anon-key",
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.88",
        },
        body: "{}",
      }));

      expect(response.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(Object.keys(await import("./client.ts"))).toEqual(["CONFIG"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
