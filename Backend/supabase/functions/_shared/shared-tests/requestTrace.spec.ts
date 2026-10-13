// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, describe, expect, it, vi } from "vitest";
import { SLOW_SUPABASE_RPC_MS, withSupabaseRequestTracing } from "../requestTrace.ts";

const RPC_URL = "https://project.supabase.co/rest/v1/rpc/sync_recruits?select=private_value";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function loggedEvents(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls.flatMap((call) => {
    if (typeof call[0] !== "string") return [];
    try {
      return [JSON.parse(call[0]) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

afterEach(() => vi.restoreAllMocks());

describe("withSupabaseRequestTracing", () => {
  it("groups arbitrary procedure names without exposing identifier-shaped secrets", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = new Response("private", { status: 404 });
    const baseFetch = vi.fn(async () => response);
    const input = "https://project.supabase.co/rest/v1/rpc/playerIdentitySecret";
    await withSupabaseRequestTracing(baseFetch)(input);
    expect(baseFetch).toHaveBeenCalledWith(input, undefined);
    expect(loggedEvents(errorLog)[0].route).toBe("/rest/v1/rpc/OTHER_RPC");
    expect(JSON.stringify(loggedEvents(errorLog))).not.toContain("playerIdentitySecret");
  });

  it("logs a network failure without leaking its URL, message, body, or headers and rethrows the same error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "player-identity-token-should-not-appear";
    const networkError = new TypeError(`request ${RPC_URL} authorization Bearer ${secret}`);
    const tracedFetch = withSupabaseRequestTracing(async () => { throw networkError; });

    await expect(tracedFetch(new Request(`${RPC_URL}&tag=${secret}&player=player-123`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: secret,
    }))).rejects.toBe(networkError);

    const [event] = loggedEvents(errorLog);
    expect(event).toMatchObject({
      event: "supabase_rpc_trace",
      route: "/rest/v1/rpc/sync_recruits",
      method: "POST",
      outcome: "network_error",
      status: null,
    });
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(JSON.stringify(event)).not.toContain("player-123");
    expect(JSON.stringify(event)).not.toContain("authorization");
    expect(JSON.stringify(event)).not.toContain("private_value");
  });

  it("logs HTTP failures with the safe route, status, duration, and Supabase request ID without reading the body", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = new Response("sensitive raw database error", {
      status: 503,
      headers: { "sb-request-id": "0190abc0-1234-5678-9abc-def012345678" },
    });
    const baseFetch = vi.fn(async () => response);
    const input = RPC_URL;
    const controller = new AbortController();
    const init: RequestInit = {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: "Bearer sensitive-token" },
      body: "sensitive request payload",
    };

    const returned = await withSupabaseRequestTracing(baseFetch)(input, init);

    expect(returned).toBe(response);
    expect(baseFetch).toHaveBeenCalledWith(input, init);
    expect(response.bodyUsed).toBe(false);
    expect(loggedEvents(errorLog)).toHaveLength(1);
    expect(loggedEvents(errorLog)[0]).toMatchObject({
      route: "/rest/v1/rpc/sync_recruits",
      method: "POST",
      outcome: "http_error",
      status: 503,
      request_id: "0190abc0-1234-5678-9abc-def012345678",
    });
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("sensitive");
  });

  it("logs slow successful RPCs while staying silent for normal success and non-RPC requests", async () => {
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(0).mockReturnValueOnce(SLOW_SUPABASE_RPC_MS);
    now.mockReturnValueOnce(10).mockReturnValueOnce(20);
    const slowResponse = new Response("ok", { status: 200, headers: { "sb-request-id": "0190abc0-1234-5678-9abc-def012345678" } });
    const fetcher = withSupabaseRequestTracing(async () => slowResponse);

    await fetcher(RPC_URL, { method: "POST" });
    await fetcher(RPC_URL, { method: "POST" });
    await fetcher("https://project.supabase.co/rest/v1/players?id=private");

    expect(loggedEvents(warningLog)).toEqual([
      expect.objectContaining({
        route: "/rest/v1/rpc/sync_recruits",
        method: "POST",
        outcome: "slow_success",
        status: 200,
        duration_ms: SLOW_SUPABASE_RPC_MS,
        request_id: "0190abc0-1234-5678-9abc-def012345678",
      }),
    ]);
    expect(warningLog).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps concurrent call timing and response IDs local to each request", async () => {
    const warningLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const now = vi.spyOn(performance, "now");
    let clock = 0;
    now.mockImplementation(() => clock);
    const first = deferred<Response>();
    const second = deferred<Response>();
    let callCount = 0;
    const tracedFetch = withSupabaseRequestTracing(() => {
      callCount += 1;
      return callCount === 1 ? first.promise : second.promise;
    });

    const fastCall = tracedFetch(`${RPC_URL}&call=fast`, { method: "POST" });
    const slowCall = tracedFetch(`${RPC_URL}&call=slow`, { method: "POST" });
    clock = 15;
    first.resolve(new Response("fast", { status: 200, headers: { "sb-request-id": "0190abc0-1234-5678-9abc-def012345679" } }));
    await fastCall;
    clock = SLOW_SUPABASE_RPC_MS + 5;
    second.resolve(new Response("slow", { status: 200, headers: { "sb-request-id": "0190abc0-1234-5678-9abc-def012345680" } }));
    await slowCall;

    expect(warningLog).toHaveBeenCalledTimes(1);
    expect(errorLog).not.toHaveBeenCalled();
    expect(loggedEvents(warningLog)[0]).toMatchObject({
      duration_ms: SLOW_SUPABASE_RPC_MS + 5,
      request_id: "0190abc0-1234-5678-9abc-def012345680",
      route: "/rest/v1/rpc/sync_recruits",
    });
  });

  it("does not let a throwing logger affect the fetch response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => { throw new Error("logger unavailable"); });
    const response = new Response("ok", { status: 500 });
    const fetcher = withSupabaseRequestTracing(async () => response);

    await expect(fetcher(RPC_URL)).resolves.toBe(response);
  });
});
