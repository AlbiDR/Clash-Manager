// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeAll } from "vitest";
import * as v from "npm:valibot@1.4.2";
import { clinicalServe } from "../protocol.ts";
import { ProtocolError } from "../errors.ts";

/**
 * L1 Core: Protocol Control Surface Spec
 *
 * @remarks
 * Narrowly scoped to the four findings fixed in `protocol.ts`:
 *   - F3: telemetry rows reach a terminal FAILED state on handler throw, and a
 *     `report_telemetry` registration failure aborts the run instead of failing open.
 *   - F7: the top-level catch classifies via `ProtocolError` and never leaks internal
 *     `.message` text across the trust boundary.
 *   - F12: an unset/empty configured bearer token is unsatisfiable by any presented value.
 * F8 (malformed body handling) is exercised indirectly by the empty-body cases below but is
 * primarily covered by the broader Edge Function test-gap effort; it is not re-derived here.
 */

beforeAll(() => {
  // Mock Temporal globally: Node's runtime (unlike Deno) has no native Temporal, mirroring
  // the pattern already used by fetch-player-battlelog/index.spec.ts.
  const mockInstant = {
    toString: () => "2026-07-30T00:00:00.000Z",
    since: () => ({ total: (unit: string) => (unit === "milliseconds" ? 42 : 0) }),
  };
  globalThis.Temporal = {
    Now: { instant: () => mockInstant as any },
  } as any;

  // Mock Deno globally so `_shared/config.ts`'s `getAllowedOrigins()` (invoked by
  // `protocol.ts`'s CORS resolution whenever a restricted request carries an Origin
  // header) has an ALLOWED_ORIGINS value to read, mirroring the pattern used by the
  // three anon-reachable functions' own index.spec.ts files. Every OTHER test in this
  // file never sends an Origin header, so this mock has no effect on them either way.
  const envStore: Record<string, string> = {
    ALLOWED_ORIGINS: "https://app.test.co",
  };
  globalThis.Deno = {
    env: {
      get: (key: string) => envStore[key] || "",
      toObject: () => ({ ...envStore }),
      set: (key: string, value: string) => { envStore[key] = value; },
      delete: (key: string) => { delete envStore[key]; },
      has: (key: string) => key in envStore,
    },
  } as any;
});

const EMPTY_SCHEMA = v.object({});
const BEARER_TOKEN = "correct-horse-battery-staple";

function makeRequest(body?: unknown, authToken = BEARER_TOKEN, extraHeaders?: Record<string, string>): Request {
  return new Request("https://example.test/fn", {
    method: "POST",
    headers: {
      ...(authToken !== undefined ? { Authorization: `Bearer ${authToken}` } : {}),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeSupabaseMock(rpcImpl: (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  const supabase = {
    rpc: vi.fn((fn: string, args: unknown) => {
      calls.push({ fn, args });
      return rpcImpl(fn, args);
    }),
  };
  return { supabase, calls };
}

describe("clinicalServe", () => {
  describe("F3: telemetry terminal state", () => {
    it("drives the telemetry row to FAILED when the handler throws", async () => {
      const { supabase, calls } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-123" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => {
          throw new Error("handler exploded");
        },
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe("INTERNAL_ERROR");
      // [ASSERT] The raw handler message must never reach the response body.
      expect(JSON.stringify(body)).not.toContain("handler exploded");

      const updateCalls = calls.filter((c) => c.fn === "update_telemetry");
      expect(updateCalls.length).toBeGreaterThan(0);
      const failedUpdate = updateCalls.find((c) => (c.args as any).p_status === "FAILED");
      expect(failedUpdate).toBeDefined();
      expect((failedUpdate!.args as any).p_id).toBe("tid-123");
    });

    it("aborts the run without invoking the handler when report_telemetry itself returns an RPC error", async () => {
      const { supabase, calls } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: null, error: { message: "connection refused to db-internal-01" } };
        return { data: null, error: null };
      });

      const handler = vi.fn(async () => ({ ok: true }));

      const response = await clinicalServe({
        req: makeRequest({}),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler,
      });

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.code).toBe("TELEMETRY_UNAVAILABLE");
      // [ASSERT] Internal DB topology detail must never leak across the trust boundary.
      expect(JSON.stringify(body)).not.toContain("db-internal-01");

      // [ASSERT] No terminal update was attempted against a row that never registered.
      expect(calls.filter((c) => c.fn === "update_telemetry")).toHaveLength(0);
    });

    it("still completes the run when report_telemetry returns null data with no RPC error (common test-double shape)", async () => {
      // [DECISION LOG COVERAGE] `null` data with `error: null` is a materially weaker
      // signal than an explicit RPC error -- it is the default shape of most Supabase test
      // doubles in this repo and a legitimate PostgREST response for some RPC paths. The
      // run must still complete rather than fail closed for every such caller.
      const { supabase } = makeSupabaseMock(async () => ({ data: null, error: null }));

      const response = await clinicalServe({
        req: makeRequest({}),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("F7: typed error classification", () => {
    it("returns the ProtocolError's own code/status and safe message, never its internal detail", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-456" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => {
          throw new ProtocolError("MALFORMED_PAYLOAD", "schema.rejected_field=secret_internal_column");
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("MALFORMED_PAYLOAD");
      expect(body.error).toBe("Malformed Payload");
      expect(JSON.stringify(body)).not.toContain("secret_internal_column");
    });

    it("degrades an unclassified throw to INTERNAL_ERROR with a generic message", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-789" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => {
          // deliberately not a ProtocolError
          throw "raw string throw with api_key_pool_size=7";
        },
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.code).toBe("INTERNAL_ERROR");
      expect(body.error).toBe("Internal Server Error");
      expect(JSON.stringify(body)).not.toContain("api_key_pool_size");
    });
  });

  describe("F12: constant-time bearer auth", () => {
    it("rejects a request when no token is configured, even against an empty presented token", async () => {
      const { supabase, calls } = makeSupabaseMock(async () => ({ data: null, error: null }));

      const response = await clinicalServe({
        req: makeRequest({}, ""),
        supabase: supabase as any,
        bearerToken: "",
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.code).toBe("UNAUTHORIZED");
      // [ASSERT] Fail-closed: an empty configured token must never authorize anything,
      // including a request presenting an equally empty token. No RPC should ever fire.
      expect(calls.length).toBe(0);
    });

    it("rejects a request when the configured token array contains only empty strings", async () => {
      const { supabase, calls } = makeSupabaseMock(async () => ({ data: null, error: null }));

      const response = await clinicalServe({
        req: makeRequest({}, ""),
        supabase: supabase as any,
        bearerToken: ["", ""],
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(401);
      expect(calls.length).toBe(0);
    });

    it("authorizes a request whose presented token matches a configured non-empty token", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-ok" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "protocol-spec",
        schema: EMPTY_SCHEMA,
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Rate limiting (ProtocolOptions.rateLimit, opt-in)", () => {
    it("allows every request while under the configured per-IP ceiling", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-rl-1" }, error: null };
        return { data: null, error: null };
      });

      for (let requestIndex = 0; requestIndex < 3; requestIndex++) {
        const response = await clinicalServe({
          req: makeRequest({}, BEARER_TOKEN, { "x-forwarded-for": "10.0.0.1" }),
          supabase: supabase as any,
          bearerToken: BEARER_TOKEN,
          eventType: "TEST_EVENT",
          componentId: "rl-under-limit",
          schema: EMPTY_SCHEMA,
          rateLimit: { maxRequests: 3, windowMs: 60_000 },
          handler: async () => ({ ok: true }),
        });
        expect(response.status).toBe(200);
      }
    });

    it("returns 429 with a Retry-After header once a caller IP exceeds the per-IP ceiling", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-rl-2" }, error: null };
        return { data: null, error: null };
      });

      const callOnce = () => clinicalServe({
        req: makeRequest({}, BEARER_TOKEN, { "x-forwarded-for": "10.0.0.2" }),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "rl-over-limit",
        schema: EMPTY_SCHEMA,
        rateLimit: { maxRequests: 2, windowMs: 60_000 },
        handler: async () => ({ ok: true }),
      });

      expect((await callOnce()).status).toBe(200);
      expect((await callOnce()).status).toBe(200);

      const thirdResponse = await callOnce();
      expect(thirdResponse.status).toBe(429);
      const body = await thirdResponse.json();
      expect(body.code).toBe("RATE_LIMITED");
      expect(body.error).toBe("Too Many Requests");
      const retryAfter = thirdResponse.headers.get("Retry-After");
      expect(retryAfter).not.toBeNull();
      expect(Number(retryAfter)).toBeGreaterThan(0);
    });

    it("scopes the per-IP-target bucket independently: hammering one target 429s without a fresh per-IP budget rescuing it, while a DIFFERENT target from the same IP is unaffected", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-rl-3" }, error: null };
        return { data: null, error: null };
      });

      const TAG_SCHEMA = v.object({ tag: v.string() });
      const callWithTag = (tag: string) => clinicalServe({
        req: makeRequest({ tag }, BEARER_TOKEN, { "x-forwarded-for": "10.0.0.3" }),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "rl-target-scope",
        schema: TAG_SCHEMA,
        rateLimit: {
          maxRequests: 100, // per-IP ceiling deliberately generous; the target bucket is what's under test
          windowMs: 60_000,
          targetKey: (payload) => payload.tag,
          targetMaxRequests: 1,
          targetWindowMs: 60_000,
        },
        handler: async () => ({ ok: true }),
      });

      expect((await callWithTag("#POPULAR")).status).toBe(200);

      const secondSameTarget = await callWithTag("#POPULAR");
      expect(secondSameTarget.status).toBe(429);
      const body = await secondSameTarget.json();
      expect(body.code).toBe("RATE_LIMITED");

      // A different target from the SAME caller IP is a distinct bucket and unaffected.
      expect((await callWithTag("#OTHER")).status).toBe(200);
    });

    it("does not rate limit at all when the option is omitted (internal-bearer-only, cron-triggered functions)", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-rl-4" }, error: null };
        return { data: null, error: null };
      });

      for (let requestIndex = 0; requestIndex < 5; requestIndex++) {
        const response = await clinicalServe({
          req: makeRequest({}, BEARER_TOKEN, { "x-forwarded-for": "10.0.0.4" }),
          supabase: supabase as any,
          bearerToken: BEARER_TOKEN,
          eventType: "TEST_EVENT",
          componentId: "rl-not-configured",
          schema: EMPTY_SCHEMA,
          handler: async () => ({ ok: true }),
        });
        expect(response.status).toBe(200);
      }
    });
  });

  describe("Restricted CORS (opt-in via rateLimit presence)", () => {
    it("reflects an Origin on the configured allow-list when rateLimit is set", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-cors-1" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}, BEARER_TOKEN, { "x-forwarded-for": "10.0.1.1", Origin: "https://app.test.co" }),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "cors-allowed",
        schema: EMPTY_SCHEMA,
        rateLimit: { maxRequests: 10, windowMs: 60_000 },
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.test.co");
    });

    it("omits the CORS header for an Origin NOT on the configured allow-list when rateLimit is set", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-cors-2" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}, BEARER_TOKEN, { "x-forwarded-for": "10.0.1.2", Origin: "https://evil.example.com" }),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "cors-denied",
        schema: EMPTY_SCHEMA,
        rateLimit: { maxRequests: 10, windowMs: 60_000 },
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("still completes successfully for a request with no Origin header at all (server-to-server / cron-style caller)", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-cors-3" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}, BEARER_TOKEN, { "x-forwarded-for": "10.0.1.3" }),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "cors-no-origin",
        schema: EMPTY_SCHEMA,
        rateLimit: { maxRequests: 10, windowMs: 60_000 },
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("keeps the blanket '*' for functions that do not opt into rateLimit (e.g. ingest-royale-data, headhunter-scanner)", async () => {
      const { supabase } = makeSupabaseMock(async (fn) => {
        if (fn === "report_telemetry") return { data: { id: "tid-cors-4" }, error: null };
        return { data: null, error: null };
      });

      const response = await clinicalServe({
        req: makeRequest({}, BEARER_TOKEN, { Origin: "https://evil.example.com" }),
        supabase: supabase as any,
        bearerToken: BEARER_TOKEN,
        eventType: "TEST_EVENT",
        componentId: "cors-unrestricted",
        schema: EMPTY_SCHEMA,
        handler: async () => ({ ok: true }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
