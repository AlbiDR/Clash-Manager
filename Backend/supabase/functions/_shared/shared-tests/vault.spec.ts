// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { loadConfig } from "../vault.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.8";

/**
 * L1 Core: Vault Secret Broker Spec
 *
 * @remarks
 * Verifies decrypted secret fetching from Supabase Vault via substrate.get_vault_secret RPC,
 * Valibot VaultSecretSchema parsing, error logging guards, fallback to Deno environment variables,
 * and concurrent multi-key configuration loading.
 */

beforeAll(() => {
  if (typeof globalThis.Deno === "undefined") {
    const envStore: Record<string, string> = {};
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
  }
});

describe("Vault Secret Broker (vault.ts)", () => {
  let mockSupabase: SupabaseClient;
  let mockRpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc = vi.fn();
    mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient;

    // Reset Deno.env values
    (globalThis.Deno.env as any).set("TEST_ENV_KEY", "");
  });

  describe("loadConfig single key resolution", () => {
    it("returns secret value directly from Vault when RPC call succeeds", async () => {
      mockRpc.mockResolvedValue({ data: "vault_secret_alpha", error: null });

      const config = await loadConfig(mockSupabase, ["SECRET_ALPHA"]);

      expect(config).toEqual({ SECRET_ALPHA: "vault_secret_alpha" });
      expect(mockRpc).toHaveBeenCalledWith("get_vault_secret", { p_name: "SECRET_ALPHA" });
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it("parses structured or JSON object vault outputs via VaultSecretSchema", async () => {
      mockRpc.mockResolvedValue({
        data: { secret: "structured_vault_value" },
        error: null,
      });

      const config = await loadConfig(mockSupabase, ["STRUCTURED_SECRET"]);

      expect(config).toEqual({ STRUCTURED_SECRET: '{"secret":"structured_vault_value"}' });
      expect(mockRpc).toHaveBeenCalledWith("get_vault_secret", { p_name: "STRUCTURED_SECRET" });
    });

    it("falls back to Deno.env when vault RPC returns an error", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "Permission denied or RPC unavailable" },
      });
      (globalThis.Deno.env as any).set("SECRET_FALLBACK", "env_secret_val");

      const config = await loadConfig(mockSupabase, ["SECRET_FALLBACK"]);

      expect(config).toEqual({ SECRET_FALLBACK: "env_secret_val" });
      expect(mockRpc).toHaveBeenCalledWith("get_vault_secret", { p_name: "SECRET_FALLBACK" });
    });

    it("falls back to Deno.env when Vault returns empty string", async () => {
      mockRpc.mockResolvedValue({ data: "", error: null });
      (globalThis.Deno.env as any).set("EMPTY_VAULT_KEY", "env_value_beta");

      const config = await loadConfig(mockSupabase, ["EMPTY_VAULT_KEY"]);

      expect(config).toEqual({ EMPTY_VAULT_KEY: "env_value_beta" });
    });

    it("returns empty string when both Vault and Deno.env yield no secret", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "Secret missing" } });
      (globalThis.Deno.env as any).set("MISSING_KEY", "");

      const config = await loadConfig(mockSupabase, ["MISSING_KEY"]);

      expect(config).toEqual({ MISSING_KEY: "" });
    });
  });

  describe("loadConfig multi-key and edge case orchestration", () => {
    it("loads multiple keys concurrently with mixed Vault, env, and empty fallbacks", async () => {
      (globalThis.Deno.env as any).set("ENV_KEY", "env_value");
      (globalThis.Deno.env as any).set("NONE_KEY", "");

      mockRpc.mockImplementation((rpcName: string, params: { p_name: string }) => {
        if (params.p_name === "VAULT_KEY") {
          return Promise.resolve({ data: "vault_value", error: null });
        }
        if (params.p_name === "ENV_KEY") {
          return Promise.resolve({ data: null, error: { message: "Vault error" } });
        }
        return Promise.resolve({ data: "", error: null });
      });

      const config = await loadConfig(mockSupabase, ["VAULT_KEY", "ENV_KEY", "NONE_KEY"]);

      expect(config).toEqual({
        VAULT_KEY: "vault_value",
        ENV_KEY: "env_value",
        NONE_KEY: "",
      });
      expect(mockRpc).toHaveBeenCalledTimes(3);
    });

    it("returns empty object gracefully when configKeys array is empty", async () => {
      const config = await loadConfig(mockSupabase, []);

      expect(config).toEqual({});
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
