// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock client.ts to prevent real Supabase creation and configuration crash
vi.mock("./client.ts", () => {
  const mockSupabase = {
    rpc: vi.fn().mockImplementation((fn, args) => {
      if (fn === "report_telemetry") {
        return Promise.resolve({ data: { id: "telemetry-123" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return {
    CONFIG: {
      ROYALE_API_KEYS: '["key1", "key2"]',
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      SUPABASE_ANON_KEY: "anon-key",
      INTERNAL_BEARER_TOKEN: "internal-bearer",
    },
    supabase: mockSupabase,
    syncVault: vi.fn().mockResolvedValue(undefined),
  };
});

let requestHandler: any;
const mockFetch = vi.fn();

beforeAll(async () => {
  // Mock Deno global completely
  const envStore: Record<string, string> = {
    ROYALE_API_KEYS: '["key1", "key2"]',
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SUPABASE_ANON_KEY: "anon-key",
    INTERNAL_BEARER_TOKEN: "internal-bearer",
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
    Instant: {
      from: (str: string) => {
        const date = new Date(str);
        return {
          epochMilliseconds: date.getTime(),
        } as any;
      },
    },
  } as any;

  // Mock fetch globally
  vi.stubGlobal("fetch", mockFetch);

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
  mockFetch.mockReset();
});

describe("fetch-player-battlelog Edge Function", () => {
  it("should handle CORS OPTIONS preflight request", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "OPTIONS",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("should block unauthorized requests (401 Unauthorized)", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "#PP80QG99" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should block requests with invalid method (405 Method Not Allowed)", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "PUT",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "#PP80QG99" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toBe("Method Not Allowed");
  });

  it("should validate the payload schema and reject malformed tag (400 Bad Request)", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "1" }), // too short
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Malformed Payload");
  });

  it("should handle empty keys pool by throwing error", async () => {
    // Modify config to simulate empty pool
    const { CONFIG } = await import("./client.ts");
    const originalKeys = CONFIG.ROYALE_API_KEYS;
    CONFIG.ROYALE_API_KEYS = "[]";

    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("No Royale API keys available in the key pool");

    // Restore original keys
    CONFIG.ROYALE_API_KEYS = originalKeys;
  });

  it("should handle scenario where all key fetches fail", async () => {
    // Mock fetch to return error status
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("keys failed to return a valid battle log");
  });

  it("should parse valid battle times and pick the freshest battle log", async () => {
    const mockFreshLog = [
      {
        type: "PvP",
        battleTime: "20260717T120000.000Z", // fresher
        team: [{ tag: "#P1", name: "Player One", crowns: 3 }],
        opponent: [{ tag: "#P2", name: "Opponent One", crowns: 1, clan: { tag: "#C1" } }]
      }
    ];

    const mockStaleLog = [
      {
        type: "PvP",
        battleTime: "20260717T060000.000Z", // older
        team: [{ tag: "#P1", name: "Player One", crowns: 1 }],
        opponent: [{ tag: "#P2", name: "Opponent One", crowns: 2, clan: { tag: "#C1" } }]
      }
    ];

    // Mock fetch calls: first key gets stale, second key gets fresh
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockStaleLog,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockFreshLog,
      });

    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.battleCount).toBe(1);
    expect(body.data.battles[0].battleTime).toBe("20260717T120000.000Z");
  });

  it("should fail gracefully when receiving malformed battleTime format", async () => {
    const mockMalformedLog = [
      {
        type: "PvP",
        battleTime: "invalid-time-format",
        team: [{ tag: "#P1", name: "Player One", crowns: 3 }],
        opponent: [{ tag: "#P2", name: "Opponent One", crowns: 1, clan: { tag: "#C1" } }]
      }
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockMalformedLog,
    });

    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ playerTag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Invalid battleTime format received");
  });
});
