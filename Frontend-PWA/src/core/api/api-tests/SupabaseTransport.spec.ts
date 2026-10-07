// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchSupabaseFresh,
  getRetryDelayMs,
  SUPABASE_READ_BACKOFF_BASE_MS,
  SUPABASE_READ_RETRY_LIMIT,
  SUPABASE_READ_TIMEOUT_MS,
} from "../SupabaseTransport";
import { fetchRemote } from "../SupabaseClient";

const ROSTER_URL = "https://test.supabase.co/rest/v1/roster_view";
const RECRUITS_URL = "https://test.supabase.co/rest/v1/headhunter_view";
const STATEMENT_TIMEOUT_BODY = { code: "57014", message: "canceling statement due to statement timeout" };
/** Draws every jittered wait at the top of its window, the slowest schedule. */
const SLOWEST_JITTER = 1 - Number.EPSILON;

/** Total of every retry's window: the longest a read can spend waiting between attempts. */
const ALL_BACKOFF_WINDOWS_MS = Array.from({ length: SUPABASE_READ_RETRY_LIMIT }, (_, retryIndex) =>
  SUPABASE_READ_BACKOFF_BASE_MS * 2 ** retryIndex).reduce((total, window) => total + window, 0);

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(SLOWEST_JITTER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Supabase read transport", () => {
  it("retries the failing view without replaying a healthy concurrent read", async () => {
    vi.useFakeTimers();
    let rosterAttempts = 0;
    const fetchMock = vi.fn(async (request: Request) => {
      if (request.url === ROSTER_URL && rosterAttempts++ === 0) {
        return Response.json({ message: "Service Unavailable" }, { status: 503 });
      }
      return Response.json([{ player_tag: "#P0Y" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = Promise.all([fetchSupabaseFresh(ROSTER_URL), fetchSupabaseFresh(RECRUITS_URL)]);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_BACKOFF_BASE_MS);
    expect((await result).map(response => response.status)).toEqual([200, 200]);
    expect(fetchMock.mock.calls.filter(([request]) => request.url === RECRUITS_URL)).toHaveLength(1);
    expect(rosterAttempts).toBe(2);
  });

  it("abandons a stalled read and succeeds with a new request", async () => {
    vi.useFakeTimers();
    let oldSignal: AbortSignal | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce((_request, init: RequestInit) => {
        oldSignal = init.signal ?? undefined;
        return new Promise(() => {});
      })
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchSupabaseFresh(ROSTER_URL);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_TIMEOUT_MS + SUPABASE_READ_BACKOFF_BASE_MS);
    expect((await result).status).toBe(200);
    expect(oldSignal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds a body that stalls after HTTP headers arrive", async () => {
    vi.useFakeTimers();
    const body = new ReadableStream({ start() {} });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(body))
      .mockResolvedValueOnce(Response.json([])));
    const result = fetchSupabaseFresh(ROSTER_URL);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_TIMEOUT_MS + SUPABASE_READ_BACKOFF_BASE_MS);
    expect((await result).status).toBe(200);
  });

  it("cancels immediately even when the underlying fetch ignores abort", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const failure = new Error("Network connection lost");
    const result = fetchSupabaseFresh(ROSTER_URL, { signal: controller.signal }).catch(error => error);
    controller.abort(failure);
    expect(await result).toBe(failure);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry writes or hard authorization failures", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({}, { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchSupabaseFresh(ROSTER_URL, { method: "POST", body: "{}" })).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect((await fetchSupabaseFresh(ROSTER_URL)).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after bounded retries and preserves the final server error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ code: "PGRST000" }, { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchSupabaseFresh(ROSTER_URL);
    await vi.advanceTimersByTimeAsync(ALL_BACKOFF_WINDOWS_MS);
    const response = await result;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "PGRST000" });
    expect(fetchMock).toHaveBeenCalledTimes(SUPABASE_READ_RETRY_LIMIT + 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([500, 504])("does not retry a read the server cancelled for its statement timeout (HTTP %i)", async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(STATEMENT_TIMEOUT_BODY, { status })));
    vi.stubGlobal("fetch", fetchMock);
    const response = await fetchSupabaseFresh(ROSTER_URL);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(STATEMENT_TIMEOUT_BODY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits a jittered, doubling window before each retry", async () => {
    vi.useFakeTimers();
    const HALF_WINDOW = 0.5;
    vi.mocked(Math.random).mockReturnValue(HALF_WINDOW);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({}, { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchSupabaseFresh(ROSTER_URL);

    for (let retryIndex = 0; retryIndex < SUPABASE_READ_RETRY_LIMIT; retryIndex++) {
      const waitMs = SUPABASE_READ_BACKOFF_BASE_MS * 2 ** retryIndex * HALF_WINDOW;
      expect(getRetryDelayMs(retryIndex)).toBe(waitMs);
      await vi.advanceTimersByTimeAsync(waitMs - 1);
      expect(fetchMock).toHaveBeenCalledTimes(retryIndex + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(retryIndex + 2);
    }
    expect((await result).status).toBe(503);
  });

  it("keeps every backoff wait together shorter than one read timeout", () => {
    expect(ALL_BACKOFF_WINDOWS_MS).toBeLessThan(SUPABASE_READ_TIMEOUT_MS);
  });
});

describe("Requests issued per failed sync", () => {
  it("issues one request per read when the database cancels every read for its statement timeout", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
    /** Marker RPC, roster, headhunter, heartbeat and blacklist. */
    const READS_PER_SYNC = 5;
    const fetchMock = vi.fn((request: Request) => {
      const endpoint = new URL(request.url).pathname;
      return Promise.resolve(Response.json({ ...STATEMENT_TIMEOUT_BODY, message: `cancelled ${endpoint}` }, { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const failedSync = fetchRemote().catch((syncError: unknown) => syncError);
    await vi.advanceTimersByTimeAsync(ALL_BACKOFF_WINDOWS_MS);

    expect(String(await failedSync)).toContain("Roster Fetch Error");
    expect(fetchMock).toHaveBeenCalledTimes(READS_PER_SYNC);
    const requestedEndpoints = fetchMock.mock.calls.map(([request]) => new URL(request.url).pathname);
    expect(requestedEndpoints.sort()).toEqual([
      "/rest/v1/headhunter_materialized",
      "/rest/v1/pipeline_heartbeat_view",
      "/rest/v1/recruit_blacklist_view",
      "/rest/v1/roster_materialized",
      "/rest/v1/rpc/sync_snapshot_marker",
    ]);
    const markerRequest = fetchMock.mock.calls.find(([request]) =>
      new URL(request.url).pathname === "/rest/v1/rpc/sync_snapshot_marker",
    )?.[0];
    expect(markerRequest?.method).toBe("GET");
  });
});
