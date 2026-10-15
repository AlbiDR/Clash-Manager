// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import routeCatalog from "./requestTraceRoutes.json" with { type: "json" };

// EPHEMERAL: intentionally resets on cold start
// [THREAT:] Module-level route lookup Set initializes at load time and resets across worker isolate cold starts.
const SAFE_ROUTES = new Set(routeCatalog.routes);

/**
 * Threshold duration in milliseconds beyond which a successful Supabase RPC invocation
 * is categorized as slow and logged as a warning.
 *
 * @remarks Satisfies CleanStack ADR Section VII: Telemetry & Tracing Standards.
 */
export const SLOW_SUPABASE_RPC_MS = 1_000;

const RPC_PATH = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)\/?$/;
// EPHEMERAL: intentionally resets on cold start
// [THREAT:] Module-level HTTP method lookup Set initializes at load time and resets across worker isolate cold starts.
const SAFE_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const UUID_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRACE_EVENT = "supabase_rpc_trace";

/**
 * Diagnostic outcome classification for traced Supabase RPC requests.
 * - `network_error`: The fetch call threw a network/transport exception before receiving an HTTP response.
 * - `http_error`: The fetch call completed but returned a non-2xx HTTP status code (`!response.ok`).
 * - `slow_success`: The fetch call returned HTTP 2xx, but execution duration exceeded `SLOW_SUPABASE_RPC_MS`.
 */
type TraceOutcome = "network_error" | "http_error" | "slow_success";

/**
 * Serialized telemetry event payload emitted for anomalous or slow Supabase RPC calls.
 *
 * @remarks Satisfies CleanStack ADR Section III: Security & Telemetry Standards.
 * Filters out sensitive query strings, payload body data, and dynamic parameters.
 */
interface TraceEvent {
  /** Static trace event type tag. */
  event: typeof TRACE_EVENT;
  /** Sanitized RPC procedure route path (e.g. `/rest/v1/rpc/purge_recruits` or fallback `/rest/v1/rpc/OTHER_RPC`). */
  route: string;
  /** Normalized HTTP request method (e.g. `POST` or fallback `OTHER`). */
  method: string;
  /** Outcome classification for the request. */
  outcome: TraceOutcome;
  /** Wall-clock duration of the request in milliseconds. */
  duration_ms: number;
  /** HTTP response status code, or `null` if a network error occurred. */
  status: number | null;
  /** Optional validated UUID request identifier extracted from `sb-request-id` response header. */
  request_id?: string;
}

/** Function type matching standard web API `fetch`. */
export type FetchLike = typeof fetch;

/**
 * Extracts and sanitizes the RPC route path from a fetch Request or URL input.
 *
 * @param input - The URL or Request object passed to fetch.
 * @returns The matched route if registered in `SAFE_ROUTES`, `/rest/v1/rpc/OTHER_RPC` if recognized as RPC but unregistered, or `null` if not an RPC endpoint.
 *
 * @remarks Strips all URL query parameters and path extensions to prevent credential or PII leaks in telemetry.
 */
function getRpcRoute(input: RequestInfo | URL): string | null {
  try {
    const url = input instanceof Request ? input.url : String(input);
    const pathname = new URL(url).pathname;
    const match = RPC_PATH.exec(pathname);
    if (!match) return null;
    const route = `/rest/v1/rpc/${match[1]}`;
    // Sanitize against route cardinality explosion and sensitive path injection by validating against known route catalog.
    return SAFE_ROUTES.has(route) ? route : "/rest/v1/rpc/OTHER_RPC";
  } catch {
    return null;
  }
}

/**
 * Normalizes and validates the HTTP method from fetch input arguments.
 *
 * @param input - The URL or Request object passed to fetch.
 * @param init - Optional fetch configuration object containing the request method.
 * @returns Upper-case HTTP method string if in `SAFE_METHODS`, or `OTHER` if unrecognized.
 */
function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  const normalized = method.toUpperCase();
  // Protect telemetry metrics from method string spoofing or injection.
  return SAFE_METHODS.has(normalized) ? normalized : "OTHER";
}

/**
 * Extracts and validates the `sb-request-id` header from a Supabase response.
 *
 * @param response - The HTTP Response object returned by fetch.
 * @returns Validated UUID request ID string, or `undefined` if absent or malformed.
 */
function getRequestId(response: Response): string | undefined {
  const candidate = response.headers.get("sb-request-id");
  if (!candidate || !UUID_REQUEST_ID.test(candidate)) return undefined;
  return candidate;
}

/**
 * Safely serializes and logs a trace event to console output without altering fetch behavior.
 *
 * @param outcome - Outcome classification deciding console severity (warn vs error).
 * @param event - Telemetry trace event structure.
 */
function safeLog(outcome: TraceOutcome, event: TraceEvent): void {
  try {
    const serialized = JSON.stringify(event);
    if (outcome === "slow_success") console.warn(serialized);
    else console.error(serialized);
  } catch {
    // Trace output must never alter fetch execution or throw errors even if console is monkey-patched or overridden.
  }
}

/**
 * Wraps a fetch implementation to trace failed or slow Supabase RPC calls without reading request/response payloads.
 *
 * @param baseFetch - The underlying fetch function to wrap (defaults to global `fetch`).
 * @returns A wrapped fetch function with passive RPC telemetry reporting.
 *
 * @remarks Satisfies CleanStack ADR Section III: Verification Boundaries & Section VII: Security & Tracing Standards.
 * Only static RPC procedure names from `SAFE_ROUTES` are emitted; query parameters and request bodies are strictly excluded.
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
