// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as SupabaseClient from "../SupabaseClient";

// Mock Supabase JS Client
const mockFrom = {
  select: vi.fn(),
  limit: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  abortSignal: vi.fn(),
  insert: vi.fn(),
};

// Make them fluent and thenable
[mockFrom.select, mockFrom.limit, mockFrom.eq, mockFrom.single, mockFrom.abortSignal, mockFrom.insert].forEach(m => {
  m.mockImplementation(() => {
    return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
  });
});

// Hoisted mock client -- referenced directly in tests so vi.clearAllMocks()
// does not sever the reference to the mock factory's return value.
const mockClient = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  from: vi.fn(() => mockFrom),
  functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
};
(mockClient as any).schema = vi.fn(() => mockClient);

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => mockClient),
  };
});

// Mock StorageService
vi.mock("../../services/StorageService", () => ({
  idb: {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
  },
  loadCache: vi.fn(),
  saveCache: vi.fn().mockResolvedValue(undefined),
}));

describe("SupabaseClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() wipes mock implementations; restore a safe default.
    mockClient.rpc.mockResolvedValue({ data: null, error: null });
    mockClient.functions.invoke.mockResolvedValue({ data: null, error: null });

    // Reset env vars
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'mock-key');

    // Also stubGlobal just in case
    vi.stubGlobal('import.meta', {
      env: {
        VITE_SUPABASE_URL: 'https://xyz.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'mock-key',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("initializes successfully", () => {
    expect(SupabaseClient).toBeDefined();
  });

  describe("Errors", () => {
    it("NetworkError is an instance of Error", () => {
      const err = new SupabaseClient.NetworkError("test");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("NetworkError");
      expect(err.message).toBe("test");
    });
  });

  describe("Configuration", () => {
    it("creates a Supabase client with no-store fetch transport", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
      vi.stubGlobal("fetch", fetchMock);

      SupabaseClient.createSupabaseClient();

      const clientOptions = vi.mocked(createClient).mock.calls.at(-1)?.[2] as {
        global?: { fetch?: typeof fetch };
      };
      expect(clientOptions?.global?.fetch).toEqual(expect.any(Function));

      await clientOptions.global!.fetch!("https://xyz.supabase.co/rest/v1/roster_view", {
        headers: { apikey: "mock-key" },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://xyz.supabase.co/rest/v1/roster_view",
        expect.objectContaining({
          cache: "no-store",
          headers: expect.any(Headers),
        }),
      );
      const headers = fetchMock.mock.calls[0][1].headers as Headers;
      expect(headers.get("Cache-Control")).toBe("no-cache");
      expect(headers.get("Pragma")).toBe("no-cache");
      expect(headers.get("apikey")).toBe("mock-key");
    });

    it("isConfigured returns true when both URL and Key are present", () => {
      expect(SupabaseClient.isConfigured()).toBe(true);
    });

    it("isConfigured returns false when URL is missing", () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubGlobal('import.meta', {
        env: {
          VITE_SUPABASE_URL: '',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'mock-key',
        },
      });
      expect(SupabaseClient.isConfigured()).toBe(false);
    });

    it("getApiUrl returns the configured URL", () => {
      expect(SupabaseClient.getApiUrl()).toBe('https://xyz.supabase.co');
    });

    it("getApiUrl returns fallback when unconfigured", () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubGlobal('import.meta', {
        env: {
          VITE_SUPABASE_URL: '',
          VITE_SUPABASE_PUBLISHABLE_KEY: '',
        },
      });
      expect(SupabaseClient.getApiUrl()).toBe('(not configured)');
    });
  });

  describe("Utilities", () => {
    it("ping returns success with the backend version when the Edge Function succeeds", async () => {
      vi.mocked(mockClient.functions.invoke).mockResolvedValue({
        data: { success: true, version: '14.45.7' },
        error: null,
      });

      const result = await SupabaseClient.ping();
      expect(result).toEqual({ status: 'success', message: 'Pong', version: '14.45.7' });
      expect(mockClient.functions.invoke).toHaveBeenCalledWith('ping', expect.objectContaining({ body: {} }));
    });

    it("ping returns error when the Edge Function fails", async () => {
      vi.mocked(mockClient.functions.invoke).mockResolvedValue({
        data: null,
        error: { message: 'Function Error' },
      } as any);

      const result = await SupabaseClient.ping();
      expect(result).toEqual({ status: 'error', message: 'Function Error' });
    });

    it("ping catches and returns exceptions", async () => {
      vi.mocked(mockClient.functions.invoke).mockRejectedValue(new Error("Unexpected Crash"));

      const result = await SupabaseClient.ping();
      expect(result.status).toBe('error');
      expect(result.message).toContain('Unexpected Crash');
    });
  });

  describe("Data Fetching", () => {
    it("fetchRemote transforms data correctly on success", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ player_tag: '#ABC', player_name: 'Hero', trophies: 5000 }], error: null }) // Roster
        .mockResolvedValueOnce({ data: [{ player_tag: '#XYZ', player_name: 'Recruit', trophies: 4000 }], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: { last_success_at: '2026-01-01T00:00:00Z' }, error: null }) // Heartbeat
        .mockResolvedValueOnce({ data: [], error: null }); // Blacklist

      const result = await SupabaseClient.fetchRemote();

      expect(result.lb).toHaveLength(1);
      expect(result.lb[0].id).toBe('ABC');
      expect(result.hh).toHaveLength(1);
      expect(result.hh[0].id).toBe('XYZ');
      expect(result.timestamp).toBe(new Date('2026-01-01T00:00:00Z').getTime());
      expect(SupabaseClient.lastSyncStatus.value).toBe('SUCCESS');
    });

    it("fetchRemote uses fallback defaults for malformed data", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ invalid: 'data' }], error: null }) // Roster
        .mockResolvedValueOnce({ data: [{ invalid: 'data' }], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: null, error: null }) // Heartbeat
        .mockResolvedValueOnce({ data: [], error: null }); // Blacklist

      const result = await SupabaseClient.fetchRemote();

      expect(result.lb[0].n).toBe('Unknown');
      expect(result.hh[0].n).toBe('Unknown');
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("fetchRemote throws Valibot error if view returns an object instead of an array", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: { not: "an array" }, error: null }) // Malformed roster
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      await expect(SupabaseClient.fetchRemote()).rejects.toThrow();
    });

    it("fetchRemote throws error if roster fetch fails", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: null, error: { message: 'Roster Fail' } } as any);

      await expect(SupabaseClient.fetchRemote()).rejects.toThrow('Roster Fetch Error: Roster Fail');
    });

    it("fetchRemote continues with an empty blacklist if blacklist fetch fails", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'Invalid schema: drivers' } } as any);

      const result = await SupabaseClient.fetchRemote();
      expect(result.blacklist).toEqual([]);
      expect(SupabaseClient.lastSyncStatus.value).toBe('SUCCESS');
    });

    it("fetchRemote defaults to Date.now() if heartbeat query fails", async () => {
      const now = 123456789;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null }) // Roster
        .mockResolvedValueOnce({ data: [], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: null, error: { message: 'Heartbeat Error' } } as any) // Heartbeat FAIL
        .mockResolvedValueOnce({ data: [], error: null }); // Blacklist

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBe(now);

      vi.useRealTimers();
    });

    it("fetchRemote handles invalid date strings in heartbeat", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: { last_success_at: 'not-a-date' }, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBeNaN(); // Current behavior: new Date('invalid').getTime() is NaN
    });

    it("fetchRemote throws Valibot error if blacklist player_tag is not a string", async () => {
      const MOCK_INVALID_TAG_NUM = 12345;
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null }) // Roster
        .mockResolvedValueOnce({ data: [], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: null, error: null }) // Heartbeat
        .mockResolvedValueOnce({ data: [{ player_tag: MOCK_INVALID_TAG_NUM }], error: null }); // Blacklist with number instead of string

      await expect(SupabaseClient.fetchRemote()).rejects.toThrow();
    });

    it("fetchRemote throws Valibot error if heartbeat last_success_at is not a string or null", async () => {
      const MOCK_INVALID_HEARTBEAT_NUM = 99999;
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null }) // Roster
        .mockResolvedValueOnce({ data: [], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: { last_success_at: MOCK_INVALID_HEARTBEAT_NUM }, error: null }) // Heartbeat with number instead of string
        .mockResolvedValueOnce({ data: [], error: null }); // Blacklist

      await expect(SupabaseClient.fetchRemote()).rejects.toThrow();
    });
  });
});
