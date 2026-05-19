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
}));

describe("SupabaseClient", () => {
  const mockSupabase = vi.mocked(createClient)().rpc.bind(null) as any; // Helper to get the client instance later if needed

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

    it("loadCache calls idb.get", async () => {
      vi.mocked(idb.get).mockResolvedValue({ lb: [], hh: [] } as any);
      const result = await SupabaseClient.loadCache();
      expect(idb.get).toHaveBeenCalledWith("CLAN_MANAGER_DATA_V8");
      expect(result).toEqual({ lb: [], hh: [] });
    });

    it("saveCache calls idb.set", async () => {
      const data = { lb: [], hh: [] } as any;
      await SupabaseClient.saveCache(data);
      expect(idb.set).toHaveBeenCalledWith("CLAN_MANAGER_DATA_V8", data);
    });
  });

  describe("Data Fetching", () => {
    it("fetchRemote transforms data correctly on success", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ player_tag: '#ABC', player_name: 'Hero', trophies: 5000 }], error: null }) // Roster
        .mockResolvedValueOnce({ data: [{ player_tag: '#XYZ', player_name: 'Recruit', trophies: 4000 }], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: { last_success_at: '2026-01-01T00:00:00Z' }, error: null }); // Heartbeat

      const result = await SupabaseClient.fetchRemote();

      expect(result.lb).toHaveLength(1);
      expect(result.lb[0].id).toBe('ABC');
      expect(result.hh).toHaveLength(1);
      expect(result.hh[0].id).toBe('XYZ');
      expect(result.timestamp).toBe(new Date('2026-01-01T00:00:00Z').getTime());
      expect(SupabaseClient.lastSyncStatus.value).toBe('SUCCESS');
      expect(idb.set).toHaveBeenCalled();
    });

    it("fetchRemote uses fallback defaults for malformed data", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ invalid: 'data' }], error: null }) // Roster
        .mockResolvedValueOnce({ data: [{ invalid: 'data' }], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: null, error: null }); // Heartbeat

      const result = await SupabaseClient.fetchRemote();

      expect(result.lb[0].n).toBe('Unknown');
      expect(result.hh[0].n).toBe('Unknown');
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
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
        .mockResolvedValueOnce({ data: null, error: { message: 'Heartbeat Error' } } as any); // Heartbeat FAIL

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBe(now);

      vi.useRealTimers();
    });

    it("fetchRemote handles invalid date strings in heartbeat", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: { last_success_at: 'not-a-date' }, error: null });

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBeNaN(); // Current behavior: new Date('invalid').getTime() is NaN
    });

    it("scanRecruitsDirect returns mapped recruits", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({
        data: [{ player_tag: '#NEW', player_name: 'Newbie', trophies: 3000 }],
        error: null
      });

      const result = await SupabaseClient.scanRecruitsDirect();
      expect(result).toHaveLength(1);
      expect(result![0].n).toBe('Newbie');
    });

    it("scanRecruitsDirect returns null if fetch fails", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({ data: null, error: { message: 'Fetch Failed' } } as any);
      const result = await SupabaseClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("scanRecruitsDirect uses fallback for malformed rows", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({
        data: [{ malformed: true }],
        error: null
      });

      const result = await SupabaseClient.scanRecruitsDirect();
      expect(result).toHaveLength(1);
      expect(result![0].n).toBe('');
      expect(result![0].t).toBe(0);
    });
  });

  describe("Profile Retrieval", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("getPlayerProfile normalizes tags and returns profile", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          profile: { tag: '#MYTAG', name: 'Me', kingLevel: 14, xpIntoLevel: 0 },
          cards: [],
          inventory: { gold: 0, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } },
        }),
      } as any);

      const result = await SupabaseClient.getPlayerProfile('MYTAG');
      expect(result.profile.tag).toBe('#MYTAG');
      expect(result.profile.name).toBe('Me');
      expect(result.profile.kingLevel).toBe(14);
    });

    it("getPlayerProfile throws if profile not found", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Profile not found' }),
      } as any);

      await expect(SupabaseClient.getPlayerProfile('MISSING')).rejects.toThrow('Profile not found');
    });

    it("getPlayerProfile throws if validation fails", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Profile data validation failed' }),
      } as any);

      await expect(SupabaseClient.getPlayerProfile('TAG')).rejects.toThrow('Profile data validation failed');
    });
  });

  describe("Mutations & Online-Only Dismissal", () => {
    it("dismissRecruits throws NetworkError on any RPC error", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'Timeout' } } as any);

      const items = [{ id: 'ABC', score: 80 }];
      await expect(SupabaseClient.dismissRecruits(items)).rejects.toThrow(SupabaseClient.NetworkError);
    });

    it("undismissRecruits normalizes tags and throws NetworkError on any RPC error", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'failed to fetch' } } as any);

      const ids = ['ABC'];
      await expect(SupabaseClient.undismissRecruits(ids)).rejects.toThrow(SupabaseClient.NetworkError);
      
      // Verify tags are normalized
      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', { player_tags: ['#ABC'] });
    });

    it("triggerBackendUpdate returns success/failure based on RPC", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await SupabaseClient.triggerBackendUpdate();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
    });

    it("triggerBackendUpdate returns error if RPC fails", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'Trigger Failed' } } as any);

      const result = await SupabaseClient.triggerBackendUpdate();
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Trigger Failed');
    });

    it("subscribeToPush inserts subscription", async () => {
      vi.mocked(mockFrom.insert).mockResolvedValue({ error: null } as any);

      const sub = { endpoint: 'https://push.com' } as any;
      const result = await SupabaseClient.subscribeToPush(sub);
      expect(result).toBe(true);
      expect(mockFrom.insert).toHaveBeenCalled();
    });
  });
});
