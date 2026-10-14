// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import routeCatalog from "./requestTraceRoutes.json" with { type: "json" };

// EPHEMERAL: intentionally resets on cold start
// [THREAT:] Module-level route lookup Set initializes at load time and resets across worker isolate cold starts.
const SAFE_ROUTES = new Set(routeCatalog.routes);

/** A 1-second successful RPC is slow enough to warrant an invocation log. */
export const SLOW_SUPABASE_RPC_MS = 1_000;

const RPC_PATH = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)\/?$/;
// EPHEMERAL: intentionally resets on cold start
// [THREAT:] Module-level HTTP method lookup Set initializes at load time and resets across worker isolate cold starts.
const SAFE_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const UUID_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACE_EVENT = "supabase_rpc_trace";

type TraceOutcome = "network_error" | "http_error" | "slow_success";

interface TraceEvent {
  event: typeof TRACE_EVENT;
  route: string;
  method: string;
  outcome: TraceOutcome;
  duration_ms: number;
  status: number | null;
  request_id?: string;
}

type FetchLike = typeof fetch;

function getRpcRoute(input: RequestInfo | URL): string | null {
  try {
    const url = input instanceof Request ? input.url : String(input);
    const pathname = new URL(url).pathname;
    const match = RPC_PATH.exec(pathname);
    if (!match) return null;
    const route = `/rest/v1/rpc/${match[1]}`;
    return SAFE_ROUTES.has(route) ? route : "/rest/v1/rpc/OTHER_RPC";
  } catch {
    return null;
  }
}

function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const normalized = method.toUpperCase();
  return SAFE_METHODS.has(normalized) ? normalized : "OTHER";
}

function getRequestId(response: Response): string | undefined {
  const candidate = response.headers.get("sb-request-id");
  if (!candidate || !UUID_REQUEST_ID.test(candidate)) return undefined;
  return candidate;
}

function safeLog(outcome: TraceOutcome, event: TraceEvent): void {
  try {
    const serialized = JSON.stringify(event);
    if (outcome === "slow_success") console.warn(serialized);
    else console.error(serialized);
  } catch {
    // Trace output must never alter fetch behavior, including a patched console.
  }
}

/**
 * Wraps fetch to report failed or slow Supabase RPC calls without reading payloads.
 * Only static RPC procedure names are emitted; URL queries and other path segments
 * are excluded. Supabase Edge logs attach their native execution_id to console events.
 */
export function withSupabaseRequestTracing(baseFetch: FetchLike = fetch): FetchLike {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const route = getRpcRoute(input);
    if (!route) return baseFetch(input, init);

    const method = getMethod(input, init);
    const startedAt = performance.now();
    let response: Response;
    try {
      response = await baseFetch(input, init);
    } catch (error) {
      safeLog("network_error", {
        event: TRACE_EVENT,
        route,
        method,
        outcome: "network_error",
        duration_ms: Math.round(performance.now() - startedAt),
        status: null,
      });
      throw error;
    }

    const duration = Math.round(performance.now() - startedAt);
    const outcome: TraceOutcome | null = !response.ok
      ? "http_error"
      : duration >= SLOW_SUPABASE_RPC_MS
      ? "slow_success"
      : null;

    if (outcome) {
      let requestId: string | undefined;
      try {
        requestId = getRequestId(response);
      } catch {
        // A response-header inspection is best-effort diagnostics only.
      }
      safeLog(outcome, {
        event: TRACE_EVENT,
        route,
        method,
        outcome,
        duration_ms: duration,
        status: response.status,
        ...(requestId ? { request_id: requestId } : {}),
      });
    }
    return response;
  }) as FetchLike;
}
