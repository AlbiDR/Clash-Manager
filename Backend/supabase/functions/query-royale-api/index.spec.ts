// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock client.ts to prevent real Supabase creation and configuration crash
vi.mock("./client.ts", () => {
  const mockSupabase = {
    rpc: vi.fn().mockImplementation((fn, args) => {
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return {
    CONFIG: {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      SUPABASE_ANON_KEY: "anon-key",
      INTERNAL_BEARER_TOKEN: "internal-bearer",
      CLAN_TAG: "#CLANTAG",
    },
    supabase: mockSupabase,
    syncVault: vi.fn().mockResolvedValue(undefined),
  };
});

let requestHandler: any;
const mockFetch = vi.fn();
let mockRoutes: Record<string, any> = {};

beforeAll(async () => {
  // Mock Deno global completely
  const envStore: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    SUPABASE_ANON_KEY: "anon-key",
    INTERNAL_BEARER_TOKEN: "internal-bearer",
    CLAN_TAG: "#CLANTAG",
    ROYALE_API_KEYS: '["key1", "key2"]',
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
  mockRoutes = {};

  mockFetch.mockImplementation(async (url: string) => {
    // Find the longest match in registered routes to handle specific endpoints first
    const matchedKey = Object.keys(mockRoutes)
      .sort((a, b) => b.length - a.length)
      .find((key) => url.includes(key));

    if (matchedKey) {
      const routeHandler = mockRoutes[matchedKey];
      const responseData = typeof routeHandler === "function" ? await routeHandler(url) : routeHandler;
      return {
        ok: responseData.ok !== false,
        status: responseData.status || 200,
        json: async () => responseData.body,
      } as any;
    }

    // Default Fallback
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: `Route not mocked: ${url}` }),
    } as any;
  });
});

describe("query-royale-api Edge Function", () => {
  // [DECISION LOG COVERAGE] query-royale-api is one of the three anon-reachable
  // functions, so `protocol.ts`'s CORS handling is restricted (allow-list-checked)
  // rather than the blanket `*` still used by the internal-bearer-only functions.
  it("should handle a CORS OPTIONS preflight request with no Origin header (server-to-server caller): no CORS header reflected, but the preflight itself still succeeds", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "OPTIONS",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("should reflect an Origin on the configured allow-list", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "OPTIONS",
      headers: { Origin: "https://app.test.co" },
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.test.co");
  });

  it("should NOT reflect an Origin that is not on the configured allow-list", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("should block unauthorized requests (401 Unauthorized)", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "global" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should block requests with invalid method (405 Method Not Allowed)", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "PUT",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "global" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toBe("Method Not Allowed");
  });

  it("should validate the payload schema and reject invalid endpoints (400 Bad Request)", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "invalid-endpoint" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Malformed Payload");
  });

  it("should handle global harvest successfully with enough Path of Legends players", async () => {
    // Generate 85 clanless players to satisfy target floor (80)
    const mockPlayers = Array.from({ length: 85 }, (_, index) => ({
      tag: `#P${index}`,
      name: `Player ${index}`,
      rank: index + 1,
      clan: null,
    }));

    mockRoutes["/locations/global/pathoflegend/players"] = {
      body: { items: mockPlayers },
    };

    const req = new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "global" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.region).toBe("Global");
    expect(body.data.items.length).toBe(85);
    expect(body.data.items[0]).toEqual({ tag: "#P0", name: "Player 0", clan: null });
  });

  it("recovers a thin global live board from the completed worldwide season, live players first, never from country boards", async () => {
    // Live worldwide board holds 5 clanless players (floor is 80) the day after a reset.
    const globalPlayers = Array.from({ length: 5 }, (_, index) => ({
      tag: `#PG${index}`, name: `Global Player ${index}`, rank: index + 1, clan: null,
    }));
    mockRoutes["/locations/global/pathoflegend/players"] = { body: { items: globalPlayers } };
    // A country board full of players must NOT be consulted by the global harvest.
    mockRoutes["/locations/57000120/pathoflegend/players"] = { body: { items: Array.from({ length: 80 }, (_, index) => ({
      tag: `#PC${index}`, name: `Country Player ${index}`, rank: index + 1, clan: null,
    })) } };
    mockRoutes["/locations/global/seasons"] = { body: { items: [{ id: "2026-09" }] } };
    mockRoutes["/locations/global/pathoflegend/2026-09/rankings/players"] = { body: { items: [
      { tag: "#PG0", name: "Global Player 0 last season", rank: 1 },
      { tag: "#FREE", name: "Old name", rank: 2 },
      { tag: "#JOINED", name: "Joined later", rank: 3 },
    ] } };
    mockRoutes["/players/%23PG0"] = { body: { tag: "#PG0", name: "Global Player 0" } };
    mockRoutes["/players/%23FREE"] = { body: { tag: "#FREE", name: "Current name" } };
    mockRoutes["/players/%23JOINED"] = { body: { tag: "#JOINED", name: "Joined later", clan: { tag: "#CLAN" } } };

    const response = await requestHandler(new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: { Authorization: "Bearer internal-bearer", "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "global" }),
    }));
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.region).toBe("Global (completed season 2026-09)");
    expect(data.items.map((item: { tag: string }) => item.tag)).toEqual(["#PG0", "#PG1", "#PG2", "#PG3", "#PG4", "#FREE"]);
    expect(data.items[0].name).toBe("Global Player 0");
    expect(mockFetch.mock.calls.filter(([url]) => url.includes("/locations/57000120/"))).toHaveLength(0);
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith("/locations/global/seasons"))).toHaveLength(1);
  });

  it("keeps a full global live board live and does not read the completed season", async () => {
    mockRoutes["/locations/global/pathoflegend/players"] = { body: { items: Array.from({ length: 80 }, (_, index) => ({
      tag: `#PG${index}`, name: `Global Player ${index}`, rank: index + 1, clan: null,
    })) } };
    const response = await requestHandler(new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: { Authorization: "Bearer internal-bearer", "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "global" }),
    }));
    const data = (await response.json()).data;
    expect(data.region).toBe("Global");
    expect(data.items).toHaveLength(80);
    expect(mockFetch.mock.calls.filter(([url]) => url.includes("/seasons"))).toHaveLength(0);
  });

  it.each(["country", "international"])("reports an empty %s live board as empty and never backfills it from the worldwide season", async (scope) => {
    mockRoutes["/locations"] = { body: { items: [{ id: 57000120, name: "United States", isCountry: true }] } };
    mockRoutes["/locations/"] = { body: { items: [] } };
    mockRoutes["/clans/"] = { body: {
      tag: "#CLANTAG", name: "Test Clan",
      location: { id: scope === "international" ? 57000101 : 57000120, name: scope === "international" ? "International" : "United States", isCountry: scope !== "international" },
    } };
    // The worldwide season is available and populated; the local harvest must not touch it.
    mockRoutes["/locations/global/seasons"] = { body: { items: [{ id: "2026-09" }] } };
    mockRoutes["/locations/global/pathoflegend/2026-09/rankings/players"] = { body: { items: [{ tag: "#FREE", name: "World number one", rank: 1 }] } };
    mockRoutes["/players/%23FREE"] = { body: { tag: "#FREE", name: "World number one" } };

    const response = await requestHandler(new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: { Authorization: "Bearer internal-bearer", "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "local" }),
    }));
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.items).toEqual([]);
    expect(data.region).toBe(scope === "international" ? "International" : "United States");
    expect(mockFetch.mock.calls.filter(([url]) => url.includes("/seasons") || url.includes("/global/"))).toHaveLength(0);
  });

  it("should fail local harvest when CLAN_TAG config is missing", async () => {
    // protocol.ts's error classification (F7) never returns raw internal messages
    // across the trust boundary; an unclassified `throw new Error(...)` in the
    // handler degrades to the generic INTERNAL_ERROR shape. CONFIG is a module-
    // scoped mock shared across every test in this file, so the mutation is
    // restored in `finally` -- a bare post-assertion restore left it corrupted
    // for every later test whenever this assertion itself threw.
    const { CONFIG } = await import("./client.ts");
    const originalClanTag = CONFIG.CLAN_TAG;
    CONFIG.CLAN_TAG = "";

    try {
      const req = new Request("https://test.co/query-royale-api", {
        method: "POST",
        headers: {
          "Authorization": "Bearer internal-bearer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint: "local" }),
      });

      const response = await requestHandler(req);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(body.error).toBe("Internal Server Error");
    } finally {
      CONFIG.CLAN_TAG = originalClanTag;
    }
  });

  it("should fail local harvest when clan details fetch fails", async () => {
    mockRoutes["/clans/"] = {
      ok: false,
      status: 404,
      body: { error: "Not Found" },
    };

    const req = new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "local" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).toBe("Internal Server Error");
  });

  it("should perform local harvest for specific country with combined PoL & rankings merge", async () => {
    mockRoutes["/clans/"] = {
      body: {
        tag: "#CLANTAG",
        name: "Test Clan",
        location: {
          id: 57000120,
          name: "United States",
          isCountry: true,
        },
      },
    };

    // Country PoL yields 5 players (less than MIN_LOCAL_POL_FLOOR = 10)
    const mockPolPlayers = Array.from({ length: 5 }, (_, index) => ({
      tag: `#POL${index}`,
      name: `PoL Player ${index}`,
      rank: index + 1,
      clan: null,
    }));

    // Country rankings yield 15 players
    const mockRankPlayers = Array.from({ length: 15 }, (_, index) => ({
      tag: `#RNK${index}`,
      name: `Rnk Player ${index}`,
      rank: index + 1,
      clan: null,
    }));

    mockRoutes["/locations/57000120/pathoflegend/players"] = {
      body: { items: mockPolPlayers },
    };
    mockRoutes["/locations/57000120/rankings/players"] = {
      body: { items: mockRankPlayers },
    };

    const req = new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "local" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.region).toBe("United States");
    // Unique list: 5 + 15 = 20 players
    expect(body.data.items.length).toBe(20);
  });

  it("should trigger international concurrent harvesting when clan has international location", async () => {
    mockRoutes["/clans/"] = {
      body: {
        tag: "#CLANTAG",
        name: "International Clan",
        location: {
          id: 57000101, // LOCATION_ID_INTERNATIONAL
          name: "International",
          isCountry: false,
        },
      },
    };

    mockRoutes["/locations"] = {
      body: {
        items: [
          { id: 57000120, name: "United States", isCountry: true },
          { id: 57000095, name: "Spain", isCountry: true },
        ],
      },
    };

    const mockCountryPlayers = [
      { tag: "#PCON1", name: "Country Player 1", rank: 1, clan: null },
    ];

    // Handle fetches for individual countries under concurrent harvest
    mockRoutes["/locations/57000120/pathoflegend/players"] = {
      body: { items: mockCountryPlayers },
    };
    mockRoutes["/locations/57000120/rankings/players"] = {
      body: { items: [] },
    };
    mockRoutes["/locations/57000095/pathoflegend/players"] = {
      body: { items: [] },
    };
    mockRoutes["/locations/57000095/rankings/players"] = {
      body: { items: [] },
    };

    const req = new Request("https://test.co/query-royale-api", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ endpoint: "local" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.region).toContain("International");
    expect(body.data.items.length).toBe(1);
    expect(body.data.items[0]).toEqual({ tag: "#PCON1", name: "Country Player 1", clan: null });
  });
});
