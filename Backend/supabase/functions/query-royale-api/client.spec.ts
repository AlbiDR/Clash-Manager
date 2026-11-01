// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mocks for dependencies
const mockLoadConfig = vi.fn();
const mockSetKeys = vi.fn();

vi.mock("../_shared/vault.ts", () => ({
  loadConfig: (...args: any[]) => mockLoadConfig(...args),
}));

vi.mock("../_shared/muscle.ts", () => ({
  setKeys: (...args: any[]) => mockSetKeys(...args),
}));

vi.mock("npm:@supabase/supabase-js@2.117.0", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn(),
    rpc: vi.fn(),
  }),
}));

vi.mock("../_shared/requestTrace.ts", () => ({
  withSupabaseRequestTracing: vi.fn().mockReturnValue(vi.fn()),
}));

beforeAll(() => {
  const envStore: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key-123",
    INTERNAL_BEARER_TOKEN: "default-bearer",
    SUPABASE_ANON_KEY: "anon-key-123",
    CLAN_TAG: "#CLANTAG",
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
  vi.resetModules();
});

describe("query-royale-api client & environment broker (client.ts)", () => {
  it("exports initial CONFIG values derived from Deno.env", async () => {
    const { CONFIG } = await import("./client.ts");
    expect(CONFIG.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(CONFIG.SUPABASE_SERVICE_ROLE_KEY).toBe("service-key-123");
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("default-bearer");
    expect(CONFIG.SUPABASE_ANON_KEY).toBe("anon-key-123");
    expect(CONFIG.CLAN_TAG).toBe("#CLANTAG");
  });

  it("syncVault updates INTERNAL_BEARER_TOKEN, CLAN_TAG, and sets ROYALE_API_KEYS when present in vault", async () => {
    const { syncVault, CONFIG } = await import("./client.ts");

    mockLoadConfig.mockResolvedValueOnce({
      INTERNAL_BEARER_TOKEN: "vault-bearer",
      ROYALE_API_KEYS: "key-a,key-b",
      CLAN_TAG: "#VAULTCLAN",
    });

    await syncVault();

    expect(mockLoadConfig).toHaveBeenCalledWith(expect.anything(), [
      "INTERNAL_BEARER_TOKEN",
      "ROYALE_API_KEYS",
      "CLAN_TAG",
    ]);
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("vault-bearer");
    expect(CONFIG.CLAN_TAG).toBe("#VAULTCLAN");
    expect(mockSetKeys).toHaveBeenCalledWith("key-a,key-b");
    expect(mockSetKeys).toHaveBeenCalledTimes(1);
  });

  it("syncVault leaves CONFIG properties and setKeys untouched when vault returns empty/undefined", async () => {
    const { syncVault, CONFIG } = await import("./client.ts");

    CONFIG.INTERNAL_BEARER_TOKEN = "preset-token";
    CONFIG.CLAN_TAG = "#PRESETCLAN";

    mockLoadConfig.mockResolvedValueOnce({});

    await syncVault();

    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("preset-token");
    expect(CONFIG.CLAN_TAG).toBe("#PRESETCLAN");
    expect(mockSetKeys).not.toHaveBeenCalled();
  });

  it("propagates errors if loadConfig rejects during syncVault", async () => {
    const { syncVault } = await import("./client.ts");

    mockLoadConfig.mockRejectedValueOnce(new Error("Vault RPC failure"));

    await expect(syncVault()).rejects.toThrow("Vault RPC failure");
  });
});
