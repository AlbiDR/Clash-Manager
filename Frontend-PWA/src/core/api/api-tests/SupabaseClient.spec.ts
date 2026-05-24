// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { idb } from "../../services/StorageService";
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

vi.mock("@supabase/supabase-js", () => {
  const mockClient = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn(() => mockFrom),
  };
  (mockClient as any).schema = vi.fn(() => mockClient);

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
    it("ping returns success when RPC succeeds", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: 'Pong', error: null });

      const result = await SupabaseClient.ping();
      expect(result).toEqual({ status: 'success', message: 'Pong' });
      expect(mockClient.rpc).toHaveBeenCalledWith('ping');
    });

    it("ping returns error when RPC fails", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { message: 'RPC Error' } } as any);

      const result = await SupabaseClient.ping();
      expect(result).toEqual({ status: 'error', message: 'RPC Error' });
    });

    it("ping catches and returns exceptions", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockRejectedValue(new Error("Unexpected Crash"));

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
      const { saveCache } = await import("../../services/StorageService");
      expect(saveCache).toHaveBeenCalled();
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
  });
});
