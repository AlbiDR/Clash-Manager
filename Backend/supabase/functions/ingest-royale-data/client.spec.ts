// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mocks for shared dependencies
const mockLoadConfig = vi.fn();
const mockSetKeys = vi.fn();
const mockWithSupabaseRequestTracing = vi.fn().mockReturnValue(vi.fn());

vi.mock("../_shared/vault.ts", () => ({
  loadConfig: (...args: any[]) => mockLoadConfig(...args),
}));

vi.mock("../_shared/muscle.ts", () => ({
  setKeys: (...args: any[]) => mockSetKeys(...args),
}));

vi.mock("../_shared/requestTrace.ts", () => ({
  withSupabaseRequestTracing: (...args: any[]) => mockWithSupabaseRequestTracing(...args),
}));

vi.mock("npm:@supabase/supabase-js@2.117.0", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn(),
    rpc: vi.fn(),
  }),
}));

beforeAll(() => {
  const envStore: Record<string, string> = {
    CLAN_TAG: "#CLAN123",
    PLAYER_TAG: "#PLAYER456",
    ROYALE_API_KEYS: "key-a,key-b",
    SUPABASE_URL: "https://ingest.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-xyz",
    INTERNAL_BEARER_TOKEN: "bearer-token-123",
  };

  globalThis.Deno = {
    env: {
      get: (key: string) => envStore[key] || "",
      toObject: () => ({ ...envStore }),
      set: (key: string, value: string) => {
        envStore[key] = value;
      },
      delete: (key: string) => {
        delete envStore[key];
      },
      has: (key: string) => key in envStore,
    },
  } as any;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingest-royale-data client & environment broker (client.ts)", () => {
  it("exports initial CONFIG values derived from Deno.env", async () => {
    const { CONFIG } = await import("./client.ts");
    expect(CONFIG.CLAN_TAG).toBe("#CLAN123");
    expect(CONFIG.PLAYER_TAG).toBe("#PLAYER456");
    expect(CONFIG.ROYALE_API_KEYS).toBe("key-a,key-b");
    expect(CONFIG.SUPABASE_URL).toBe("https://ingest.supabase.co");
    expect(CONFIG.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role-key-xyz");
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("bearer-token-123");
  });

  it("syncVault updates CONFIG values and calls setKeys when vault returns valid secrets", async () => {
    const { syncVault, CONFIG } = await import("./client.ts");

    mockLoadConfig.mockResolvedValueOnce({
      CLAN_TAG: "#NEWCLAN",
      PLAYER_TAG: "#NEWPLAYER",
      ROYALE_API_KEYS: "vault-key-1,vault-key-2",
      INTERNAL_BEARER_TOKEN: "vault-bearer-99",
    });

    await syncVault();

    expect(mockLoadConfig).toHaveBeenCalledWith(expect.anything(), [
      "CLAN_TAG",
      "PLAYER_TAG",
      "ROYALE_API_KEYS",
      "INTERNAL_BEARER_TOKEN",
    ]);

    expect(CONFIG.CLAN_TAG).toBe("#NEWCLAN");
    expect(CONFIG.PLAYER_TAG).toBe("#NEWPLAYER");
    expect(CONFIG.ROYALE_API_KEYS).toBe("vault-key-1,vault-key-2");
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("vault-bearer-99");
    expect(mockSetKeys).toHaveBeenCalledWith("vault-key-1,vault-key-2");
  });

  it("syncVault leaves CONFIG values and setKeys untouched when vault returns empty/undefined fields", async () => {
    const { syncVault, CONFIG } = await import("./client.ts");

    CONFIG.CLAN_TAG = "#PRESET_CLAN";
    CONFIG.PLAYER_TAG = "#PRESET_PLAYER";
    CONFIG.ROYALE_API_KEYS = "preset-keys";
    CONFIG.INTERNAL_BEARER_TOKEN = "preset-bearer";

    mockLoadConfig.mockResolvedValueOnce({});

    await syncVault();

    expect(CONFIG.CLAN_TAG).toBe("#PRESET_CLAN");
    expect(CONFIG.PLAYER_TAG).toBe("#PRESET_PLAYER");
    expect(CONFIG.ROYALE_API_KEYS).toBe("preset-keys");
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("preset-bearer");
    expect(mockSetKeys).not.toHaveBeenCalled();
  });

  it("syncVault delegates to custom requestClient when provided", async () => {
    const { syncVault } = await import("./client.ts");

    const customClient = { custom: "client" } as any;
    mockLoadConfig.mockResolvedValueOnce({});

    await syncVault(customClient);

    expect(mockLoadConfig).toHaveBeenCalledWith(customClient, [
      "CLAN_TAG",
      "PLAYER_TAG",
      "ROYALE_API_KEYS",
      "INTERNAL_BEARER_TOKEN",
    ]);
  });

  it("propagates errors if loadConfig rejects during syncVault", async () => {
    const { syncVault } = await import("./client.ts");

    mockLoadConfig.mockRejectedValueOnce(new Error("Vault RPC timeout"));

    await expect(syncVault()).rejects.toThrow("Vault RPC timeout");
  });
});
