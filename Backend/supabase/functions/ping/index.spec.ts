// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock client.ts to prevent real Supabase creation and configuration crash
vi.mock("./client.ts", () => {
  const mockSupabase = {
    rpc: vi.fn().mockImplementation((fn: string) => {
      if (fn === "report_telemetry") {
        return Promise.resolve({ data: { id: "telemetry-123" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return {
    CONFIG: {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      SUPABASE_ANON_KEY: "anon-key",
    },
    supabase: mockSupabase,
  };
});

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
  it("should handle a CORS OPTIONS preflight request with the blanket wildcard (no rate limiting configured)", async () => {
    const req = new Request("https://test.co/ping", { method: "OPTIONS" });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
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
});
