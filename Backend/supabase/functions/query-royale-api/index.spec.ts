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
  it("should handle CORS OPTIONS preflight request", async () => {
    const req = new Request("https://test.co/query-royale-api", {
      method: "OPTIONS",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
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

  it("should fallback to top country rankings if global PoL yields insufficient results", async () => {
    // Global PoL yields only 5 players (floor is 80)
    const globalPlayers = Array.from({ length: 5 }, (_, index) => ({
      tag: `#PG${index}`,
      name: `Global Player ${index}`,
      rank: index + 1,
      clan: null,
    }));

    // Country fallback yields 80 players
    const countryPlayers = Array.from({ length: 80 }, (_, index) => ({
      tag: `#PC${index}`,
      name: `Country Player ${index}`,
      rank: index + 1,
      clan: null,
    }));

    mockRoutes["/locations/global/pathoflegend/players"] = {
      body: { items: globalPlayers },
    };
    mockRoutes["/locations/57000120/pathoflegend/players"] = {
      body: { items: countryPlayers },
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
    // Merged player tags unique list length (5 global + 80 country = 85 total)
    expect(body.data.items.length).toBe(85);
  });

  it("should fail local harvest when CLAN_TAG config is missing", async () => {
    const { CONFIG } = await import("./client.ts");
    const originalClanTag = CONFIG.CLAN_TAG;
    CONFIG.CLAN_TAG = "";

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
    expect(body.error).toContain("Missing CLAN_TAG configuration on backend server.");

    CONFIG.CLAN_TAG = originalClanTag;
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
    expect(body.error).toContain("Failed to retrieve clan details to identify region: 404");
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
