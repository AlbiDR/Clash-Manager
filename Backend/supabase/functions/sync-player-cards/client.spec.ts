// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";

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

beforeAll(() => {
  const envStore: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key-123",
    INTERNAL_BEARER_TOKEN: "default-bearer",
    SUPABASE_ANON_KEY: "anon-key-123",
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

describe("sync-player-cards client & environment broker (client.ts)", () => {
  it("exports initial CONFIG values derived from Deno.env", async () => {
    const { CONFIG } = await import("./client.ts");
    expect(CONFIG.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(CONFIG.SUPABASE_SERVICE_ROLE_KEY).toBe("service-key-123");
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("default-bearer");
    expect(CONFIG.SUPABASE_ANON_KEY).toBe("anon-key-123");
  });

  it("syncVault updates INTERNAL_BEARER_TOKEN and sets ROYALE_API_KEYS when present in vault", async () => {
    const { syncVault, CONFIG } = await import("./client.ts");

    mockLoadConfig.mockResolvedValueOnce({
      INTERNAL_BEARER_TOKEN: "vault-secret-bearer",
      ROYALE_API_KEYS: "key1,key2",
    });

    await syncVault();

    expect(mockLoadConfig).toHaveBeenCalledWith(expect.anything(), ["INTERNAL_BEARER_TOKEN", "ROYALE_API_KEYS"]);
    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("vault-secret-bearer");
    expect(mockSetKeys).toHaveBeenCalledWith("key1,key2");
  });

  it("syncVault leaves CONFIG.INTERNAL_BEARER_TOKEN and setKeys untouched when vault returns empty/undefined", async () => {
    const { syncVault, CONFIG } = await import("./client.ts");

    CONFIG.INTERNAL_BEARER_TOKEN = "preset-bearer";

    mockLoadConfig.mockResolvedValueOnce({});

    await syncVault();

    expect(CONFIG.INTERNAL_BEARER_TOKEN).toBe("preset-bearer");
    expect(mockSetKeys).not.toHaveBeenCalled();
  });

  it("propagates errors if loadConfig rejects during syncVault", async () => {
    const { syncVault } = await import("./client.ts");

    mockLoadConfig.mockRejectedValueOnce(new Error("Vault RPC failure"));

    await expect(syncVault()).rejects.toThrow("Vault RPC failure");
  });
});
