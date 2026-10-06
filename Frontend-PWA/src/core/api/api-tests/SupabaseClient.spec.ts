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
import { SOURCE_STALENESS_THRESHOLD } from "../../config";

/** The store's staleness rule: data older than the source staleness window reads as STALE. */
const getIsStale = (timestamp: number) => Date.now() - timestamp > SOURCE_STALENESS_THRESHOLD;

// Mock Supabase JS Client
const mockFrom = {
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  abortSignal: vi.fn(),
  insert: vi.fn(),
};

// Make them fluent and thenable
[mockFrom.select, mockFrom.order, mockFrom.limit, mockFrom.eq, mockFrom.single, mockFrom.abortSignal, mockFrom.insert].forEach(m => {
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
    vi.useRealTimers();
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
        accessToken?: () => Promise<string | null>;
        global?: { fetch?: typeof fetch };
      };
      expect(clientOptions.accessToken).toEqual(expect.any(Function));
      expect(await clientOptions.accessToken!()).toBeNull();
      expect(clientOptions?.global?.fetch).toEqual(expect.any(Function));

      await clientOptions.global!.fetch!("https://xyz.supabase.co/rest/v1/roster_view", {
        headers: { apikey: "mock-key" },
      });

      const request = fetchMock.mock.calls[0][0] as Request;
      expect(request.url).toBe("https://xyz.supabase.co/rest/v1/roster_view");
      expect(request.cache).toBe("no-store");
      const headers = request.headers;
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

    it("uses the operator endpoint override as the transport URL", () => {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: vi.fn((key: string) => key === "cm_supabase_url"
            ? "  https://override.supabase.co  "
            : null),
        },
      });

      expect(SupabaseClient.getSupabaseUrl()).toBe("https://override.supabase.co");
      expect(SupabaseClient.getApiUrl()).toBe("https://override.supabase.co");
      expect(SupabaseClient.isConfigured()).toBe(true);
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
    it("returns a validated, bounded pipeline health snapshot", async () => {
      vi.mocked(mockFrom.abortSignal).mockResolvedValue({
        data: {
          status: "COMPLETED",
          last_success_at: "2026-09-15T18:00:00Z",
          last_triggered_at: "2026-09-15T18:01:00Z",
          last_failure_at: null,
        },
        error: null,
      });

      await expect(SupabaseClient.fetchPipelineHealth()).resolves.toEqual({
        status: "COMPLETED",
        lastSuccessAt: Date.parse("2026-09-15T18:00:00Z"),
        lastTriggeredAt: Date.parse("2026-09-15T18:01:00Z"),
        lastFailureAt: null,
      });
    });

    it("degrades an invalid pipeline health response to unavailable", async () => {
      vi.mocked(mockFrom.abortSignal).mockResolvedValue({
        data: { status: "UNKNOWN" },
        error: null,
      });

      await expect(SupabaseClient.fetchPipelineHealth()).resolves.toBeNull();
    });

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

    it("ping reports the HTTP status of an edge function error", async () => {
      const WORKER_LIMIT = 546;
      vi.mocked(mockClient.functions.invoke).mockResolvedValue({
        data: null,
        error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
          context: new Response(null, { status: WORKER_LIMIT }),
        }),
      });

      const result = await SupabaseClient.ping();

      expect(result).toEqual(expect.objectContaining({ status: "error", httpStatus: WORKER_LIMIT }));
    });

    it("ping reports no HTTP status when the edge function never answered", async () => {
      vi.mocked(mockClient.functions.invoke).mockResolvedValue({
        data: null,
        error: Object.assign(new Error("Failed to send a request to the Edge Function"), { context: new TypeError("Failed to fetch") }),
      });

      const result = await SupabaseClient.ping();

      expect(result.status).toBe("error");
      expect(result.httpStatus).toBeUndefined();
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
        .mockResolvedValueOnce({ data: [{ component_id: 'ROYALE_DATA_INGESTOR', last_success_at: '2026-01-01T00:00:00Z' }], error: null }) // Heartbeat
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

    describe("withholding recruits dismissed since the snapshot was taken", () => {
      const SNAPSHOT_RECRUITS = [
        { player_tag: '#KEPT', player_name: 'Kept', trophies: 4000 },
        { player_tag: '#DISMISSED', player_name: 'Dismissed', trophies: 4100 },
        { player_tag: '#UNPREFIXED', player_name: 'Unprefixed', trophies: 4200 },
      ];

      const setSnapshotReads = (blacklistResponse: unknown) => {
        vi.mocked(mockFrom.abortSignal)
          .mockResolvedValueOnce({ data: [], error: null }) // Roster
          .mockResolvedValueOnce({ data: SNAPSHOT_RECRUITS, error: null }) // Headhunter snapshot
          .mockResolvedValueOnce({ data: null, error: null }) // Heartbeat
          .mockResolvedValueOnce(blacklistResponse as any); // Blacklist
      };

      it("drops a dismissed recruit that is still in the snapshot", async () => {
        // The blacklist view may return a tag without its '#'.
        setSnapshotReads({ data: [{ player_tag: '#DISMISSED' }, { player_tag: 'unprefixed' }], error: null });

        const result = await SupabaseClient.fetchRemote();

        expect(result.hh.map((recruit) => recruit.id)).toEqual(['KEPT']);
        expect(result.blacklist).toEqual(['#DISMISSED', '#unprefixed']);
      });

      it("leaves the snapshot untouched when nothing is dismissed", async () => {
        setSnapshotReads({ data: [], error: null });

        const result = await SupabaseClient.fetchRemote();

        expect(result.hh.map((recruit) => recruit.id)).toEqual(['KEPT', 'DISMISSED', 'UNPREFIXED']);
        expect(result.blacklist).toEqual([]);
      });

      it("filters with the last known blacklist when the blacklist read fails", async () => {
        setSnapshotReads({ data: null, error: { message: 'Invalid schema: drivers' } });

        const result = await SupabaseClient.fetchRemote({ knownBlacklist: ['#DISMISSED'] });

        expect(result.hh.map((recruit) => recruit.id)).toEqual(['KEPT', 'UNPREFIXED']);
        expect(result.blacklist).toEqual(['#DISMISSED']);
        expect(SupabaseClient.lastSyncStatus.value).toBe('SUCCESS');
      });

      it("filters with the last known blacklist when the blacklist has a malformed row", async () => {
        const MOCK_INVALID_TAG_NUM = 12345;
        setSnapshotReads({ data: [{ player_tag: '#UNPREFIXED' }, { player_tag: MOCK_INVALID_TAG_NUM }], error: null });

        const result = await SupabaseClient.fetchRemote({ knownBlacklist: ['#DISMISSED'] });

        expect(result.hh.map((recruit) => recruit.id)).toEqual(['KEPT', 'UNPREFIXED']);
        expect(result.blacklist).toEqual(['#DISMISSED']);
      });

      it("fails the sync rather than treat an unreadable blacklist as empty when none is known", async () => {
        setSnapshotReads({ data: null, error: { message: 'Invalid schema: drivers' } });

        await expect(SupabaseClient.fetchRemote()).rejects.toThrow('Recruit blacklist unavailable');
      });

      it("fails the sync on a malformed blacklist when none is known", async () => {
        setSnapshotReads({ data: { not: 'an array' }, error: null });

        await expect(SupabaseClient.fetchRemote()).rejects.toThrow('Recruit blacklist unavailable');
      });

      it("falls back to the last known blacklist when the blacklist read stalls", async () => {
        vi.useFakeTimers();
        const stalledBlacklist = new Promise<never>(() => {});
        vi.mocked(mockFrom.abortSignal)
          .mockResolvedValueOnce({ data: [], error: null })
          .mockResolvedValueOnce({ data: SNAPSHOT_RECRUITS, error: null })
          .mockResolvedValueOnce({ data: null, error: null })
          .mockImplementationOnce(() => stalledBlacklist as any);

        const refresh = SupabaseClient.fetchRemote({ knownBlacklist: ['#DISMISSED'] });
        await vi.advanceTimersByTimeAsync(SupabaseClient.OPTIONAL_METADATA_TIMEOUT_MS);

        const result = await refresh;
        expect(result.hh.map((recruit) => recruit.id)).toEqual(['KEPT', 'UNPREFIXED']);
      });

      it("does not cap the blacklist read at the optional timeout when none is known", async () => {
        vi.useFakeTimers();
        const requestSignals: AbortSignal[] = [];
        let setBlacklistResponse: (response: unknown) => void = () => {};
        vi.mocked(mockFrom.abortSignal)
          .mockResolvedValueOnce({ data: [], error: null })
          .mockResolvedValueOnce({ data: SNAPSHOT_RECRUITS, error: null })
          .mockResolvedValueOnce({ data: null, error: null })
          .mockImplementationOnce((signal: AbortSignal) => {
            requestSignals.push(signal);
            return new Promise((resolve) => { setBlacklistResponse = resolve; }) as any;
          });

        const refresh = SupabaseClient.fetchRemote();
        await vi.advanceTimersByTimeAsync(SupabaseClient.OPTIONAL_METADATA_TIMEOUT_MS);
        expect(requestSignals[0]?.aborted).toBe(false);

        setBlacklistResponse({ data: [{ player_tag: '#DISMISSED' }], error: null });
        const result = await refresh;
        expect(result.hh.map((recruit) => recruit.id)).toEqual(['KEPT', 'UNPREFIXED']);
      });
    });

    it("does not let a stalled optional heartbeat block a complete payload", async () => {
      vi.useFakeTimers();
      const stalledHeartbeat = new Promise<never>(() => {});
      const requestSignals: AbortSignal[] = [];
      vi.mocked(mockFrom.abortSignal)
        .mockImplementationOnce((signal: AbortSignal) => {
          requestSignals.push(signal);
          return Promise.resolve({ data: [{ player_tag: '#ABC', last_ingested_at: '2026-02-03T04:05:06Z' }], error: null }) as any;
        })
        .mockImplementationOnce((signal: AbortSignal) => {
          requestSignals.push(signal);
          return Promise.resolve({ data: [], error: null }) as any;
        })
        .mockImplementationOnce((signal: AbortSignal) => {
          requestSignals.push(signal);
          return stalledHeartbeat as any;
        })
        .mockImplementationOnce((signal: AbortSignal) => {
          requestSignals.push(signal);
          return Promise.resolve({ data: [], error: null }) as any;
        });

      const refresh = SupabaseClient.fetchRemote();
      await vi.advanceTimersByTimeAsync(SupabaseClient.OPTIONAL_METADATA_TIMEOUT_MS);

      const result = await refresh;
      expect(result.timestamp).toBe(new Date('2026-02-03T04:05:06Z').getTime());
      expect(result.blacklist).toEqual([]);
      expect(requestSignals[2]?.aborted).toBe(true);
      expect(SupabaseClient.lastSyncStatus.value).toBe('SUCCESS');
    });

    it("does not forge a fresh timestamp if heartbeat and roster freshness are unavailable", async () => {
      const now = 123456789;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null }) // Roster
        .mockResolvedValueOnce({ data: [], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: null, error: { message: 'Heartbeat Error' } } as any) // Heartbeat FAIL
        .mockResolvedValueOnce({ data: [], error: null }); // Blacklist

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBe(0);
      expect(result.lastFetched).toBe(now);

      vi.useRealTimers();
    });

    it("fetchRemote handles invalid date strings in heartbeat", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [{ component_id: 'ROYALE_DATA_INGESTOR', last_success_at: 'not-a-date' }], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBe(0);
    });

    it("falls back to roster timestamps as a lower bound when the heartbeat is unavailable", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ player_tag: '#ABC', last_ingested_at: '2026-02-03T04:05:06Z' }], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'Heartbeat Error' } } as any)
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBe(new Date('2026-02-03T04:05:06Z').getTime());
    });

    describe("freshness comes from the pipeline heartbeat", () => {
      const NOW = Date.parse('2026-02-03T12:00:00Z');
      /** Old enough to read as stale on its own. */
      const LONG_AGO = new Date(NOW - 2 * SOURCE_STALENESS_THRESHOLD).toISOString();

      /** Answers one sync with the given roster row and heartbeat timestamps. */
      const setFreshnessReads = (lastIngestedAt: string, lastSuccessAt: string) => {
        vi.mocked(mockFrom.abortSignal)
          .mockResolvedValueOnce({ data: [{ player_tag: '#ABC', last_ingested_at: lastIngestedAt }], error: null })
          .mockResolvedValueOnce({ data: [], error: null })
          .mockResolvedValueOnce({ data: [{ component_id: 'ROYALE_DATA_INGESTOR', last_success_at: lastSuccessAt }], error: null })
          .mockResolvedValueOnce({ data: [], error: null });
      };

      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
      });

      it("reports an unchanged roster as fresh when the heartbeat is fresh", async () => {
        // Rows nobody rewrote since long ago; the ingest itself just completed.
        setFreshnessReads(LONG_AGO, new Date(NOW).toISOString());

        const result = await SupabaseClient.fetchRemote();

        expect(result.timestamp).toBe(NOW);
        expect(getIsStale(result.timestamp)).toBe(false);
      });

      it("reports a stale heartbeat as stale even when roster rows are recent", async () => {
        setFreshnessReads(new Date(NOW).toISOString(), LONG_AGO);

        const result = await SupabaseClient.fetchRemote();

        expect(result.timestamp).toBe(Date.parse(LONG_AGO));
        expect(getIsStale(result.timestamp)).toBe(true);
      });
    });

    it("drops one malformed roster row without discarding valid rows", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ player_tag: '#ABC' }, { player_tag: { invalid: true } }], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [{ component_id: 'ROYALE_DATA_INGESTOR', last_success_at: '2026-01-01T00:00:00Z' }], error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await SupabaseClient.fetchRemote();
      expect(result.lb).toHaveLength(1);
      expect(result.lb[0].id).toBe('ABC');
    });

    it("rejects a roster payload when every returned row is malformed", async () => {
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [{ player_tag: { invalid: true } }], error: null })
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: [], error: null });

      await expect(SupabaseClient.fetchRemote()).rejects.toThrow('Roster validation failed for every row');
    });

    it("fetchRemote degrades invalid heartbeat metadata without discarding datasets", async () => {
      const MOCK_INVALID_HEARTBEAT_NUM = 99999;
      vi.mocked(mockFrom.abortSignal)
        .mockResolvedValueOnce({ data: [], error: null }) // Roster
        .mockResolvedValueOnce({ data: [], error: null }) // Headhunter
        .mockResolvedValueOnce({ data: [{ component_id: 'ROYALE_DATA_INGESTOR', last_success_at: MOCK_INVALID_HEARTBEAT_NUM }], error: null }) // Heartbeat with number instead of string
        .mockResolvedValueOnce({ data: [], error: null }); // Blacklist

      const result = await SupabaseClient.fetchRemote();
      expect(result.timestamp).toBe(0);
    });
  });
});
