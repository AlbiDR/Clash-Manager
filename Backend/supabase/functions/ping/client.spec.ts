// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ping client & environment broker (client.ts)", () => {
  const originalDeno = globalThis.Deno;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.Deno = originalDeno;
  });

  it("exports CONFIG with SUPABASE_ANON_KEY from Deno.env when provided", async () => {
    const envStore: Record<string, string> = {
      SUPABASE_ANON_KEY: "test-anon-key-xyz",
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

    const { CONFIG } = await import("./client.ts");
    expect(CONFIG.SUPABASE_ANON_KEY).toBe("test-anon-key-xyz");
    expect(Object.keys(CONFIG)).toEqual(["SUPABASE_ANON_KEY"]);
  });

  it("falls back to empty string when SUPABASE_ANON_KEY is undefined in Deno.env", async () => {
    globalThis.Deno = {
      env: {
        get: () => undefined as any,
        toObject: () => ({}),
        set: () => {},
        delete: () => {},
        has: () => false,
      },
    } as any;

    const { CONFIG } = await import("./client.ts");
    expect(CONFIG.SUPABASE_ANON_KEY).toBe("");
    expect(Object.keys(CONFIG)).toEqual(["SUPABASE_ANON_KEY"]);
  });
});
