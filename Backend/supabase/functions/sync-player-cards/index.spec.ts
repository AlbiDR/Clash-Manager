// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockSelectEq = vi.fn();
const mockUpsert = vi.fn();
const mockRpc = vi.fn().mockImplementation((fn, args) => {
  if (fn === "report_telemetry") {
    return Promise.resolve({ data: { id: "telemetry-123" }, error: null });
  }
  return Promise.resolve({ data: null, error: null });
});

// Mock client.ts to prevent real Supabase creation and configuration crash
vi.mock("./client.ts", () => {
  const mockSupabase = {
    schema: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((col, val) => mockSelectEq(col, val)),
    upsert: vi.fn().mockImplementation((rows, opts) => mockUpsert(rows, opts)),
    rpc: mockRpc,
  };
  return {
    CONFIG: {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      SUPABASE_ANON_KEY: "anon-key",
      INTERNAL_BEARER_TOKEN: "internal-bearer",
    },
    supabase: mockSupabase,
    syncVault: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the native rotation engine to prevent actual network key-rotation attempts
vi.mock("../_shared/muscle.ts", () => {
  return {
    fetchWithRotation: vi.fn(),
  };
});

let requestHandler: any;
const mockFetch = vi.fn();

beforeAll(async () => {
  // Mock Deno global completely
  const envStore: Record<string, string> = {
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
    subtract: (duration: { milliseconds: number }) => {
      const date = new Date("2026-07-17T02:00:00.000Z");
      const epoch = date.getTime() - duration.milliseconds;
      return {
        epochMilliseconds: epoch,
      };
    },
    epochMilliseconds: new Date("2026-07-17T02:00:00.000Z").getTime(),
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
        if (isNaN(date.getTime())) {
          throw new Error("Invalid Instant");
        }
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
  mockSelectEq.mockReset();
  mockUpsert.mockReset();
  mockRpc.mockClear();

  // Default mock resolutions
  mockSelectEq.mockResolvedValue({ data: [], error: null });
  mockUpsert.mockResolvedValue({ error: null });
});

describe("sync-player-cards Edge Function", () => {
  it("should handle CORS OPTIONS preflight request", async () => {
    const req = new Request("https://test.co/sync-player-cards", {
      method: "OPTIONS",
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  });

  it("should block unauthorized requests (401 Unauthorized)", async () => {
    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should block requests with invalid method (405 Method Not Allowed)", async () => {
    const req = new Request("https://test.co/sync-player-cards", {
      method: "PUT",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error).toBe("Method Not Allowed");
  });

  it("should validate the payload schema and reject malformed tag (400 Bad Request)", async () => {
    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: 123 }), // Invalid type (should be a string)
    });
    const response = await requestHandler(req);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Malformed Payload");
  });

  it("should return cached results on cache HIT (fresh stored card snapshots in DB)", async () => {
    const mockFreshSnapshot = [
      {
        player_name: "Clash Master",
        king_level: 14,
        xp_into_level: 50000,
        card_name: "P.E.K.K.A",
        rarity: "Epic",
        absolute_level: 14,
        count: 10,
        is_tower_troop: false,
        fetched_at: "2026-07-16T22:00:00.000Z", // < 12 hours before 2026-07-17T02:00:00.000Z
      },
      {
        player_name: "Clash Master",
        king_level: 14,
        xp_into_level: 50000,
        card_name: "Cannoneer",
        rarity: "Epic",
        absolute_level: 12,
        count: 5,
        is_tower_troop: true,
        fetched_at: "2026-07-16T22:00:00.000Z",
      }
    ];

    mockSelectEq.mockResolvedValue({ data: mockFreshSnapshot, error: null });

    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.meta.source).toBe("cache");
    expect(body.data.profile.name).toBe("Clash Master");
    expect(body.data.profile.kingLevel).toBe(14);
    expect(body.data.cards.length).toBe(1);
    expect(body.data.cards[0].name).toBe("P.E.K.K.A");
    expect(body.data.towerTroops.length).toBe(1);
    expect(body.data.towerTroops[0].name).toBe("Cannoneer");
  });

  it("should recover gracefully from a malformed database fetched_at timestamp, treating it as cache MISS", async () => {
    const { fetchWithRotation } = await import("../_shared/muscle.ts");

    const mockMalformedSnapshot = [
      {
        player_name: "Clash Master",
        king_level: 14,
        xp_into_level: 50000,
        card_name: "P.E.K.K.A",
        rarity: "Epic",
        absolute_level: 14,
        count: 10,
        is_tower_troop: false,
        fetched_at: "invalid-timestamp-value", // malformed
      }
    ];

    mockSelectEq.mockResolvedValue({ data: mockMalformedSnapshot, error: null });

    // Mock API response for fallback
    const mockPlayerProfile = {
      tag: "#PP80QG99",
      name: "Clash Master",
      trophies: 6500,
      expLevel: 14,
      expPoints: 50000,
      cards: [
        { id: 26000004, name: "P.E.K.K.A", level: 11, maxLevel: 14, rarity: "epic", count: 10 }
      ],
      towerTroops: []
    };

    vi.mocked(fetchWithRotation).mockResolvedValue({
      ok: true,
      json: async () => mockPlayerProfile,
    } as any);

    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    // Source should be api since malformed fetched_at triggers cache expiration fallback (miss)
    expect(body.data.meta.source).toBe("api");
    expect(vi.mocked(fetchWithRotation)).toHaveBeenCalled();
  });

  it("should handle cache MISS, fetch fresh profile from API, normalize rarity-relative card levels, and upsert snapshots", async () => {
    const { fetchWithRotation } = await import("../_shared/muscle.ts");

    // Mock empty database snapshot to trigger miss
    mockSelectEq.mockResolvedValue({ data: [], error: null });

    // Mock raw Royale API response
    const mockPlayerProfile = {
      tag: "#PP80QG99",
      name: "Clash Legend",
      trophies: 7200,
      expLevel: 15,
      expPoints: 120000,
      cards: [
        // Rare: max level is 14. Level 11 in Royale API.
        // absolute level calculation: maxLevel (15) - (apiMaxLevel (14) - apiLevel (11)) = 12
        { id: 26000011, name: "Giant", level: 11, maxLevel: 14, rarity: "rare", count: 250 },
        // Common: max level is 15. Level 13 in Royale API.
        // absolute level calculation: maxLevel (15) - (apiMaxLevel (15) - apiLevel (13)) = 13
        { id: 26000010, name: "Knight", level: 13, maxLevel: 15, rarity: "common", count: 800 }
      ],
      towerTroops: [
        // Legendary: max level is 14. Level 11 in Royale API.
        // absolute level calculation: maxLevel (15) - (apiMaxLevel (14) - apiLevel (11)) = 12
        { id: 26000044, name: "Dagger Duchess", level: 11, maxLevel: 14, rarity: "legendary", count: 2 }
      ]
    };

    vi.mocked(fetchWithRotation).mockResolvedValue({
      ok: true,
      json: async () => mockPlayerProfile,
    } as any);

    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.meta.source).toBe("api");
    expect(body.data.profile.name).toBe("Clash Legend");
    expect(body.data.profile.kingLevel).toBe(15);

    // Cards list should have correctly absolute-scaled levels
    expect(body.data.cards.length).toBe(2);

    const giant = body.data.cards.find((c: any) => c.name === "Giant");
    expect(giant).toBeDefined();
    expect(giant.level).toBe(12); // Normalized Epic/Rare scale
    expect(giant.count).toBe(250);

    const knight = body.data.cards.find((c: any) => c.name === "Knight");
    expect(knight).toBeDefined();
    expect(knight.level).toBe(13); // Normalized Common scale
    expect(knight.count).toBe(800);

    // Tower troop checks
    expect(body.data.towerTroops.length).toBe(1);
    expect(body.data.towerTroops[0].name).toBe("Dagger Duchess");
    expect(body.data.towerTroops[0].level).toBe(12);

    // Verify upsert was called with the normalized rows
    expect(mockUpsert).toHaveBeenCalled();
    const upsertedData = mockUpsert.mock.calls[0][0];
    expect(upsertedData.length).toBe(3);
    expect(upsertedData[0].player_tag).toBe("#PP80QG99"); // Normalized tag
    expect(upsertedData[0].absolute_level).toBe(12);
    expect(upsertedData[1].absolute_level).toBe(13);
  });

  it("should handle Royale API errors gracefully (500 Error response)", async () => {
    const { fetchWithRotation } = await import("../_shared/muscle.ts");

    vi.mocked(fetchWithRotation).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    } as any);

    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Clash Royale API error: 404");
  });

  it("should validate and reject malformed Clash Royale API payloads gracefully", async () => {
    const { fetchWithRotation } = await import("../_shared/muscle.ts");

    const malformedProfile = {
      tag: "#PP80QG99",
      // Missing name, expLevel, etc. to trigger Valibot validation failure
    };

    vi.mocked(fetchWithRotation).mockResolvedValue({
      ok: true,
      json: async () => malformedProfile,
    } as any);

    const req = new Request("https://test.co/sync-player-cards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer internal-bearer",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: "#PP80QG99" }),
    });

    const response = await requestHandler(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("Invalid response from Clash Royale API");
  });
});
