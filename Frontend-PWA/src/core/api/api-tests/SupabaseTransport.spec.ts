// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSupabaseFresh, SUPABASE_READ_RETRY_DELAYS_MS, SUPABASE_READ_TIMEOUT_MS } from "../SupabaseTransport";

const ROSTER_URL = "https://test.supabase.co/rest/v1/roster_view";
const RECRUITS_URL = "https://test.supabase.co/rest/v1/headhunter_view";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Supabase read transport", () => {
  it("retries the failing view without replaying a healthy concurrent read", async () => {
    vi.useFakeTimers();
    let rosterAttempts = 0;
    const fetchMock = vi.fn(async (request: Request) => {
      if (request.url === ROSTER_URL && rosterAttempts++ === 0) {
        return Response.json({ code: "57014", message: "canceling statement due to statement timeout" }, { status: 500 });
      }
      return Response.json([{ player_tag: "#P0Y" }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = Promise.all([fetchSupabaseFresh(ROSTER_URL), fetchSupabaseFresh(RECRUITS_URL)]);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_RETRY_DELAYS_MS[0]);
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
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_TIMEOUT_MS + SUPABASE_READ_RETRY_DELAYS_MS[0]);
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
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_TIMEOUT_MS + SUPABASE_READ_RETRY_DELAYS_MS[0]);
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
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ code: "57014" }, { status: 500 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchSupabaseFresh(ROSTER_URL);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0));
    const response = await result;
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "57014" });
    expect(fetchMock).toHaveBeenCalledTimes(SUPABASE_READ_RETRY_DELAYS_MS.length + 1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
