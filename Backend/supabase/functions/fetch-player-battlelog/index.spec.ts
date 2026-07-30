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
    ALLOWED_ORIGINS: "https://app.test.co",
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
  // [DECISION LOG COVERAGE] fetch-player-battlelog is one of the three anon-reachable
  // functions, so `protocol.ts`'s CORS handling is restricted (allow-list-checked)
  // rather than the blanket `*` still used by the internal-bearer-only functions.
  it("should handle a CORS OPTIONS preflight request with no Origin header (server-to-server caller): no CORS header reflected, but the preflight itself still succeeds", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "OPTIONS",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("should reflect an Origin on the configured allow-list", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "OPTIONS",
      headers: { Origin: "https://app.test.co" },
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.test.co");
  });

  it("should NOT reflect an Origin that is not on the configured allow-list", async () => {
    const req = new Request("https://test.co/fetch-player-battlelog", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
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
    // protocol.ts's error classification (F7) never returns raw internal
    // messages across the trust boundary; an unclassified `throw new Error(...)`
    // degrades to the generic INTERNAL_ERROR shape. CONFIG is a module-scoped
    // mock shared across every test in this file, so the mutation is restored
    // in `finally` -- a bare post-assertion restore left it corrupted for every
    // later test whenever this assertion itself threw.
    const { CONFIG } = await import("./client.ts");
    const originalKeys = CONFIG.ROYALE_API_KEYS;
    CONFIG.ROYALE_API_KEYS = "[]";

    try {
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
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(body.error).toBe("Internal Server Error");
    } finally {
      CONFIG.ROYALE_API_KEYS = originalKeys;
    }
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
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toBe("Internal Server Error");
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

  it("should fail gracefully (via the validation gate, not a crash) when ALL keys return a malformed battleTime", async () => {
    // [F10] battleTime format is now enforced inside RoyaleBattleLogSchema, so a
    // malformed record makes that key's response fail validation (-> null),
    // exactly like an HTTP failure. When every key is malformed, the pool is
    // exhausted and the handler reports it the same way it reports total
    // fetch failure - it never reaches parseBattleTime()'s throw path.
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
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toBe("Internal Server Error");
  });

  it("should NOT discard an otherwise-successful fan-out when only one key returns a malformed battleTime (F10)", async () => {
    // key1 (index 0) returns a malformed record, key2 (index 1) returns a valid one.
    // The fix must surface key2's valid battle log instead of 500ing the whole request.
    const mockMalformedLog = [
      {
        type: "PvP",
        battleTime: "invalid-time-format",
        team: [{ tag: "#P1", name: "Player One", crowns: 3 }],
        opponent: [{ tag: "#P2", name: "Opponent One", crowns: 1, clan: { tag: "#C1" } }]
      }
    ];

    const mockValidLog = [
      {
        type: "PvP",
        battleTime: "20260717T120000.000Z",
        team: [{ tag: "#P1", name: "Player One", crowns: 2 }],
        opponent: [{ tag: "#P2", name: "Opponent One", crowns: 0, clan: { tag: "#C1" } }]
      }
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockMalformedLog,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockValidLog,
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
});
