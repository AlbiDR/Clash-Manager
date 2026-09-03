// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "npm:@supabase/supabase-js@2.110.8";
import * as v from "npm:valibot@1.4.2";
import { AuditEntry } from "./types.ts";
import { IntegrityCheckDetailsSchema, TelemetrySchema } from "./schemas.ts";
import { getAllowedOrigins, RATE_LIMIT_BUCKET_SWEEP_THRESHOLD } from "./config.ts";
import {
    classifyThrown,
    PROTOCOL_ERROR_STATUS,
    ProtocolError,
    ProtocolErrorCode,
    toClientSafeMessage,
} from "./errors.ts";

/** The only Authorization scheme the protocol accepts. */
const BEARER_PREFIX = "Bearer ";

/** Digest used to normalize secrets to a fixed width before comparison. */
const TOKEN_DIGEST_ALGORITHM = "SHA-256";

/** Sentinel for "no telemetry match count yet" in the constant-time auth accumulator. */
const NO_TOKEN_MATCHES = 0;

/** Header names inspected, in priority order, to identify the caller's IP behind a proxy. */
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const CF_CONNECTING_IP_HEADER = "cf-connecting-ip";
const REAL_IP_HEADER = "x-real-ip";
const UNKNOWN_CALLER_IP = "unknown";

/**
 * Extracts the caller's IP address from proxy-forwarded headers.
 *
 * @remarks
 * Supabase Edge Functions run behind a proxy, so `req` itself carries no socket-level
 * remote address. Mirrors the header-reading idiom already used elsewhere in this
 * kernel (reading headers directly off the `Request`, see `isAuthorizedBearer` above
 * for the equivalent pattern applied to `Authorization`).
 * [DECISION LOG] `x-forwarded-for` may carry a comma-separated chain
 * (`client, proxy1, proxy2`); the first entry is the original client. Falls back to
 * `cf-connecting-ip` (Cloudflare) and then `x-real-ip` before giving up.
 * [GUARD] Every one of these headers is caller-suppliable and therefore spoofable by a
 * direct API caller. That is an accepted limitation of IP-based limiting behind any
 * proxy without a trusted-hop allowlist -- see the rate-limit bucket documentation
 * below for the full scope of what this mitigation does and does not guarantee.
 *
 * @param req - The inbound request.
 * @returns The best-effort caller IP, or a fixed sentinel when none of the headers are present.
 */
function extractCallerIp(req: Request): string {
    const forwardedFor = req.headers.get(FORWARDED_FOR_HEADER);
    if (forwardedFor) {
        const [firstHop] = forwardedFor.split(",");
        if (firstHop && firstHop.trim().length > 0) return firstHop.trim();
    }

    const cfConnectingIp = req.headers.get(CF_CONNECTING_IP_HEADER);
    if (cfConnectingIp && cfConnectingIp.trim().length > 0) return cfConnectingIp.trim();

    const realIp = req.headers.get(REAL_IP_HEADER);
    if (realIp && realIp.trim().length > 0) return realIp.trim();

    return UNKNOWN_CALLER_IP;
}

/**
 * L1 Core: In-memory sliding/fixed-window rate limit bucket store.
 *
 * @remarks
 * [THREAT:] `sync-player-cards`, `query-royale-api`, and `fetch-player-battlelog` all
 * accept the publicly known Supabase anon key as a valid bearer credential (by design
 * -- the frontend PWA has no authentication system and genuinely needs this path). The
 * bearer check is therefore NOT the access-control boundary for those three; volume
 * limiting is.
 * [DECISION LOG] KISS/YAGNI: a global per-instance fixed-window counter, not a sliding
 * log and not an external store (Redis, etc). This is a REAL but DELIBERATELY IMPERFECT
 * mitigation:
 *   - Edge Functions are stateless per cold start; this Map resets to empty whenever a
 *     new instance boots. A warm instance persists it for as long as that instance
 *     keeps serving requests, which is the actual (and only) scope of protection this
 *     provides -- it bounds abuse from a single warm instance's perspective, not
 *     globally across every concurrently running instance.
 *   - There is no cross-instance coordination: under horizontal scale-out, the true
 *     ceiling across all instances is `(instance count) x (configured limit)`, not the
 *     configured limit itself.
 *   - The counter key is derived from caller-suppliable proxy headers (see
 *     `extractCallerIp`), so it is spoofable by a motivated direct API caller.
 * None of this makes the mitigation worthless: it still caps the common case (a script
 * or buggy client looping requests from one IP against one warm instance), which is
 * exactly the blast radius this fix targets. A stronger guarantee would require a
 * shared external store, which is out of scope per ADR KISS/YAGNI for this fix.
 */
interface RateLimitBucket {
    count: number;
    windowStartMs: number;
    /** The window duration this bucket was opened with, kept alongside it so the
     * opportunistic sweep can tell an expired bucket from a live one without having
     * to know every caller's configured window in advance. */
    windowMs: number;
}

// EPHEMERAL: intentionally resets on cold start
// [THREAT:] In-memory rate limiting state is transient and will reset on cold start.
// [DECISION LOG] State is stored in-memory per worker isolate for latency optimization.
// Since Supabase Edge Functions spin up and down dynamically, memory is isolated per worker instance.
// This is an accepted tradeoff per ADR KISS/YAGNI to avoid high latency of shared stores.
const rateLimitBuckets = new Map<string, RateLimitBucket>();

/**
 * Opportunistically evicts expired buckets once the map grows past the configured
 * sweep threshold, so a long-lived warm instance does not accumulate unbounded memory
 * across many distinct caller IPs / targets.
 *
 * @param nowMs - The current instant, in epoch milliseconds.
 */
function sweepExpiredBuckets(nowMs: number): void {
    if (rateLimitBuckets.size < RATE_LIMIT_BUCKET_SWEEP_THRESHOLD) return;
    for (const [key, bucket] of rateLimitBuckets) {
        if (nowMs - bucket.windowStartMs >= bucket.windowMs) {
            rateLimitBuckets.delete(key);
        }
    }
}

/**
 * Checks and increments a fixed-window rate-limit bucket for `key`.
 *
 * @param key - The bucket identity (e.g. `ip:1.2.3.4` or `ip-target:1.2.3.4:#ABC123`).
 * @param maxRequests - The maximum number of requests permitted within `windowMs`.
 * @param windowMs - The fixed window duration, in milliseconds.
 * @returns Whether the caller is currently rate-limited, and if so, how many seconds
 *          until the window resets (for the `Retry-After` response header).
 */
function checkRateLimit(key: string, maxRequests: number, windowMs: number): { limited: boolean; retryAfterSeconds: number } {
    const nowMs = Date.now();
    sweepExpiredBuckets(nowMs);

    const bucket = rateLimitBuckets.get(key);
    if (!bucket || nowMs - bucket.windowStartMs >= windowMs) {
        rateLimitBuckets.set(key, { count: 1, windowStartMs: nowMs, windowMs });
        return { limited: false, retryAfterSeconds: 0 };
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
        const retryAfterMs = windowMs - (nowMs - bucket.windowStartMs);
        return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    return { limited: false, retryAfterSeconds: 0 };
}

/**
 * Resolves the CORS headers for a single response.
 *
 * @remarks
 * [THREAT:] A blanket `Access-Control-Allow-Origin: *` permits ANY origin's page to
 * read these responses via browser JS. The three anon-reachable functions
 * (`sync-player-cards`, `query-royale-api`, `fetch-player-battlelog`) respond with real
 * player/clan data, so that is a cross-origin data-exposure surface for any site that
 * gets a visitor to issue a fetch.
 * [DECISION LOG] Restricted, allow-list-checked CORS is OPT-IN via `restricted`, mirroring
 * `ProtocolOptions.rateLimit`'s opt-in shape: `ingest-royale-data` and `headhunter-scanner`
 * are internal-bearer-only, cron-triggered functions that pass `restricted: false`
 * (the default) and keep the original blanket `*` -- they have no browser caller to
 * protect and no Origin header is ever sent by pg_cron, so the distinction is moot for
 * them either way, but preserving the exact prior behaviour there avoids touching
 * functions explicitly out of scope for this fix.
 *   - `restricted` false/omitted: blanket `Access-Control-Allow-Origin: *` (prior
 *     behaviour, unchanged).
 *   - `restricted` true, no `Origin` header at all (server-to-server / cron-style
 *     callers): the header is omitted entirely. These callers do not enforce CORS and
 *     are unaffected either way.
 *   - `restricted` true, `Origin` present and on the configured allow-list: that exact
 *     origin is reflected back (never `*`), plus `Vary: Origin` so shared caches key on
 *     it correctly.
 *   - `restricted` true, `Origin` present but NOT on the allow-list: the header is
 *     omitted. The request still completes and the caller receives a normal response; a
 *     browser simply refuses to let its page's JS read it, which is the actual
 *     enforcement point for browser-based cross-origin access.
 *
 * @param req - The inbound request.
 * @param restricted - Whether to apply allow-list-checked CORS instead of the blanket `*`.
 * @returns Headers to merge into the response (possibly empty).
 */
function resolveCorsHeaders(req: Request, restricted: boolean): Record<string, string> {
    if (!restricted) {
        return { "Access-Control-Allow-Origin": "*" };
    }

    const origin = req.headers.get("origin");
    if (!origin) return {};

    const allowedOrigins = getAllowedOrigins();
    if (allowedOrigins.includes(origin)) {
        return { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
    }

    return {};
}

/**
 * Structural contract for a Valibot object schema, used to read its declared key set.
 *
 * @remarks
 * [DECISION LOG] Valibot exposes `entries` on object schemas as public API. Rather than
 * reaching into it behind an unsafe `as` assertion, the shape is asserted through the same
 * `v.safeParse` validation boundary the rest of this file uses. Non-object schemas (unions,
 * arrays, pipes over non-objects) simply fail this parse and are skipped.
 */
const ObjectSchemaShapeSchema = v.object({
    type: v.literal('object'),
    entries: v.record(v.string(), v.unknown()),
});

/**
 * Builds a sanitized protocol error response.
 *
 * @remarks
 * [THREAT:] Returning an internal exception message across the trust boundary leaks
 * infrastructure detail (API key-pool sizes, upstream status codes, database schema and
 * table names) to any caller holding the publicly known anon key.
 * [DECISION LOG] Status and human-readable text are BOTH derived from the stable `code`,
 * so no call site can accidentally substitute internal detail for client-facing text.
 *
 * @param req - The inbound request, used to resolve per-origin CORS headers.
 * @param code - The stable protocol error classification.
 * @param extra - Additional NON-SENSITIVE fields to merge into the response body.
 * @param retryAfterSeconds - When set (RATE_LIMITED), emitted as a `Retry-After` header.
 * @param corsRestricted - Whether to apply allow-list-checked CORS (see `resolveCorsHeaders`).
 * @returns A Response carrying `{ error, code, ...extra }`.
 */
function protocolErrorResponse(
    req: Request,
    code: ProtocolErrorCode,
    extra?: Record<string, unknown>,
    retryAfterSeconds?: number,
    corsRestricted = false,
): Response {
    return new Response(JSON.stringify({
        error: toClientSafeMessage(code),
        code,
        ...extra,
    }), {
        status: PROTOCOL_ERROR_STATUS[code],
        headers: {
            "Content-Type": "application/json",
            ...resolveCorsHeaders(req, corsRestricted),
            ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}),
        },
    });
}

/**
 * Reduces a secret to a fixed-width SHA-256 digest.
 *
 * @param value - The secret material to normalize.
 * @returns The 32-byte digest of `value`.
 */
async function digestToken(value: string): Promise<Uint8Array> {
    const encodedValue = new TextEncoder().encode(value);
    return new Uint8Array(await crypto.subtle.digest(TOKEN_DIGEST_ALGORITHM, encodedValue));
}

/**
 * Constant-time bearer token authorization.
 *
 * @remarks
 * [THREAT:] `authHeader === \`Bearer ${token}\`` short-circuits on the first differing
 * character. This single comparison is THE authorization boundary for all five Edge
 * Functions, so it must not be data-dependent even though it is not practically
 * exploitable over HTTPS against a JS string compare.
 * [DECISION LOG] Both sides are reduced to a fixed-width SHA-256 digest before comparison.
 * Comparing digests rather than raw strings removes the token-LENGTH signal as well as the
 * per-character signal, which a plain XOR-accumulator over the raw strings would still
 * expose. Every configured token is compared on every request with no early exit, so
 * neither the matching position nor the pool size is observable.
 * [PRESERVED] Fail-closed behaviour is unchanged: an empty or unset configured token is
 * filtered out before comparison, so a bare `Bearer ` header can never satisfy the guard.
 *
 * @param authHeader - The raw inbound Authorization header, or null when absent.
 * @param bearerToken - The configured internal token(s).
 * @returns True only when the presented token matches a configured non-empty token.
 */
async function isAuthorizedBearer(authHeader: string | null, bearerToken: string | string[]): Promise<boolean> {
    const configuredTokens = (Array.isArray(bearerToken) ? bearerToken : [bearerToken])
        .filter((token): token is string => typeof token === 'string' && token.length > 0);

    // [GUARD] FAIL CLOSED: no configured secret means nothing can ever authorize.
    if (configuredTokens.length === NO_TOKEN_MATCHES) return false;
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) return false;

    const presentedDigest = await digestToken(authHeader.slice(BEARER_PREFIX.length));

    let matchCount = NO_TOKEN_MATCHES;
    for (const configuredToken of configuredTokens) {
        const expectedDigest = await digestToken(configuredToken);
        let mismatchAccumulator = 0;
        for (let byteIndex = 0; byteIndex < expectedDigest.length; byteIndex++) {
            mismatchAccumulator |= presentedDigest[byteIndex] ^ expectedDigest[byteIndex];
        }
        matchCount += mismatchAccumulator === 0 ? 1 : 0;
    }

    return matchCount > NO_TOKEN_MATCHES;
}

/**
 * Reports component health, surfacing any failure to write it.
 *
 * @remarks
 * [THREAT:] A heartbeat that cannot be persisted is indistinguishable from a
 * healthy one if the RPC error is discarded. That is exactly how
 * `public.report_heartbeat` raising 42703 on a non-existent column went unnoticed
 * from 2026-04-30 to 2026-08-17: all three report points issued a bare
 * `await supabase.rpc(...)`, so every component's reporting was dead while the
 * pipeline itself looked fine.
 *
 * [DECISION LOG] The failure is logged, not thrown. Health reporting is
 * observability, so losing it must not abort an otherwise successful ingestion
 * run; but it must be loud enough to find in the function logs.
 *
 * @param supabase - The Supabase client used to reach the public-schema RPC.
 * @param payload - The heartbeat arguments forwarded verbatim to the RPC.
 * @returns Whether the heartbeat was persisted.
 */
async function reportHeartbeat(
    supabase: SupabaseClient,
    payload: {
        p_component_id: string;
        p_status: 'RUNNING' | 'COMPLETED' | 'FAILED';
        p_message: string;
        p_metadata?: Record<string, unknown>;
    },
): Promise<boolean> {
    const { error: heartbeatError } = await supabase.rpc('report_heartbeat', payload);

    if (heartbeatError) {
        console.error(
            `[Protocol] Heartbeat write FAILED for ${payload.p_component_id} (${payload.p_status}):`,
            heartbeatError.message ?? heartbeatError,
        );
        return false;
    }

    return true;
}

/**
 * CONFIGURATION: ProtocolOptions
 *
 * @remarks
 * Defines the configuration contract for the clinical protocol handler.
 * Ensures that all Edge Functions adhere to the same execution and
 * telemetry standards.
 *
 * @typeParam T - The expected shape of the inbound request payload.
 */
export interface ProtocolOptions<T> {
    /** The raw inbound Request object from the Edge Function entry point. */
    req: Request;
    /** An authenticated Supabase client for performing telemetry and DB operations. */
    supabase: SupabaseClient;
    /** The expected shared internal bearer token(s) for service-to-service auth. */
    bearerToken: string | string[];
    /** The classification key for the telemetry event (e.g., 'INGESTION', 'SCAN'). */
    eventType: string;
    /** The unique identifier of the component triggering the protocol (e.g., 'headhunter-scanner'). */
    componentId: string;
    /** The Valibot schema used to enforce the validation boundary on the inbound payload. */
    schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>;
    /**
     * OPT-IN rate limiting configuration. Omitted entirely (the default) for
     * internal-bearer-only, cron-triggered functions (`ingest-royale-data`,
     * `headhunter-scanner`), where rate limiting would be actively harmful. Passed by
     * the three anon-reachable functions (`sync-player-cards`, `query-royale-api`,
     * `fetch-player-battlelog`), which accept the publicly known anon key as a valid
     * bearer credential and therefore need a real volume boundary.
     *
     * @remarks
     * See the `rateLimitBuckets` / `checkRateLimit` documentation above for the exact
     * (deliberately simple, per-warm-instance, non-bulletproof) enforcement mechanism.
     */
    rateLimit?: {
        /** Max requests allowed per caller IP within `windowMs`, regardless of target. */
        maxRequests: number;
        /** Fixed window duration, in milliseconds, for the per-IP bucket. */
        windowMs: number;
        /**
         * Derives a target-scoped key (e.g. a player/clan tag) from the validated
         * payload. Combined with the caller IP to form a SECOND, independent bucket, so
         * one caller IP cannot bypass the per-target ceiling by rotating across many
         * targets, and one popular target is not penalized for every OTHER caller just
         * because one IP is hammering it. Omit (or return `undefined`) to skip the
         * per-target bucket and rely on the per-IP bucket alone.
         */
        targetKey?: (payload: T) => string | undefined;
        /** Max requests allowed per (caller IP + targetKey) within `targetWindowMs`. Required when `targetKey` is set. */
        targetMaxRequests?: number;
        /** Fixed window duration, in milliseconds, for the per-IP-plus-target bucket. */
        targetWindowMs?: number;
    };
    /**
     * The core business logic handler to be executed within the clinical wrapper.
     *
     * @param payload - The validated and typed request body.
     * @param logAudit - A telemetry sink for recording clinical audit entries.
     * @param heartbeat - A persistence hook for updating intermediate pipeline state.
     * @returns A promise resolving to the final execution results.
     */
    handler: (
        payload: T, 
        logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
        heartbeat: (stage: string, currentResults: unknown) => Promise<void>
    ) => Promise<unknown>;
}

/**
 * L5 CONTROL: Clinical Protocol Handler (Layer 1 Core)
 *
 * @remarks
 * Standardizes authorization, validation, and microscopic telemetry across all
 * Supabase Edge Functions. Enforces a clinical execution environment with
 * multi-stage governance.
 *
 * **Execution Sequence:**
 * 1. CORS Preflight - Handles cross-origin OPTIONS requests.
 * 2. Authorization Guard - Validates the internal service bearer token.
 * 3. Method & Payload Validation - Rejects non-POST methods and malformed JSON.
 * 4. Governance: Initial Heartbeat - Boots telemetry and reports RUNNING status.
 * 5. Logic Execution - Executes the provided business logic handler.
 * 6. Governance: Completion - Closes telemetry with success/failure reports.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 5 (Control) implementing Layer 1 (Core) patterns.
 * - **Satisfaction:** ADR Section III: Validation Boundaries and ADR Section IV: Resilience.
 *
 * @param options - The protocol configuration and handler.
 * @returns A Response object containing the clinical result or error metadata.
 *
 * @sideeffects
 * - CALLS `report_telemetry` RPC to initialize tracking.
 * - CALLS `report_heartbeat` RPC to signal component health.
 * - CALLS `update_telemetry` RPC to persist audit logs and results.
 */
export async function clinicalServe<T>(options: ProtocolOptions<T>) {
    const { req, supabase, bearerToken, eventType, componentId, schema, handler, rateLimit } = options;
    const startInstant = Temporal.Now.instant();
    const audit_log: AuditEntry[] = [];

    const logAudit = (stage: string, action: AuditEntry['action'], details?: unknown) => {
        audit_log.push({ timestamp: Temporal.Now.instant().toString(), stage, action, details });
    };

    // [DECISION LOG] Hoisted ABOVE the try block so the catch can drive the telemetry row
    // to a terminal state. Previously both the raw RPC result and the validated telemetry
    // record were declared INSIDE the try, leaving the catch out of scope for them: the row
    // created at BOOT with IN_PROGRESS was NEVER updated when the handler threw, so any
    // consumer reading telemetry saw a job that never ended.
    let telemetryId: string | number | null = null;

    // [DECISION LOG] Restricted, allow-list-checked CORS is opt-in via the presence of
    // `rateLimit`: only the three anon-reachable functions configure it, so only they
    // get the allow-list check. `ingest-royale-data` / `headhunter-scanner` (internal
    // bearer only, cron-triggered, out of scope for this fix) keep the original blanket
    // `Access-Control-Allow-Origin: *` unchanged. See `resolveCorsHeaders` for the full
    // behavior in each mode.
    const corsRestricted = !!rateLimit;

    // 1. CORS Preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                ...resolveCorsHeaders(req, corsRestricted),
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                // [FIX] The frontend's shared Supabase fetch wrapper (fetchSupabaseFresh in
                // SupabaseClient.ts) unconditionally adds Cache-Control/Pragma to every
                // request, and the supabase-js client itself adds apikey/x-client-info to
                // every functions.invoke call. This allow-list omitted all four, so the
                // browser's CORS preflight for `ping` (the only Edge Function the frontend
                // calls via functions.invoke rather than the permissive PostgREST `.from`/
                // `.rpc` path) was rejected outright before the request ever reached this
                // handler - surfacing to the user as a permanent "No Network Connection".
                "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, cache-control, pragma",
            },
        });
    }

    try {
        // 2. Authorization Guard
        // [THREAT:] Prevents unauthorized access to privileged Edge Functions.
        // [DECISION LOG] Uses a shared internal bearer token for service-to-service auth,
        // compared in constant time (see isAuthorizedBearer).
        const authHeader = req.headers.get("Authorization");
        if (!await isAuthorizedBearer(authHeader, bearerToken)) {
            console.error(`[Protocol] Unauthorized access attempt blocked for ${componentId}.`);
            return protocolErrorResponse(req, 'UNAUTHORIZED', undefined, undefined, corsRestricted);
        }

        // 3. Method & Payload Validation
        // [THREAT:] Rejects malformed, malicious, or non-POST payloads at the L5 boundary.
        // [DECISION LOG] Strictly enforces POST to simplify the protocol's state machine.
        if (req.method !== 'POST') {
            return protocolErrorResponse(req, 'METHOD_NOT_ALLOWED', undefined, undefined, corsRestricted);
        }

        // 3.5a Rate Limiting Guard: IP-only bucket before body parsing.
        // [THREAT:] Malformed authorized anon requests can be expensive before schema
        // validation ever succeeds. Charge the caller IP bucket before parsing so corrupt
        // bodies cannot bypass the global volume boundary. Target-specific buckets still
        // run after validation, because they need a trusted parsed target key.
        if (rateLimit) {
            const callerIp = extractCallerIp(req);
            const ipCheck = checkRateLimit(`ip:${componentId}:${callerIp}`, rateLimit.maxRequests, rateLimit.windowMs);
            if (ipCheck.limited) {
                console.warn(`[Protocol] Rate limit exceeded (per-IP) for ${componentId} from ${callerIp}.`);
                return protocolErrorResponse(req, 'RATE_LIMITED', undefined, ipCheck.retryAfterSeconds, corsRestricted);
            }
        }

        // [THREAT:] `await req.json().catch(() => ({}))` silently COERCED a truncated,
        // binary, or plain-text body into an empty object. For any function whose fields
        // are all optional (ingest-royale-data's `{ CLAN_TAG: v.optional(v.string()) }`)
        // that empty object PASSES validation, so a corrupt request ran a full ingestion
        // cycle against the default clan instead of being rejected with a 400.
        // [DECISION LOG] An ABSENT body and a MALFORMED body are now DISTINCT outcomes:
        //   - Absent or whitespace-only body -> treated as `{}` and left to the function's
        //     own schema to accept or reject. This stays VALID by design: the pg_cron
        //     trigger `substrate.run_royale_ingestion()` calls `net.http_post` with NO
        //     `body` argument at all, so ingest-royale-data legitimately receives an empty
        //     body on every scheduled run. An absent body is not the same as a malformed
        //     one, and the schema remains the single authority on whether an empty payload
        //     is acceptable for a given function.
        //   - Present but unparseable body -> hard 400 MALFORMED_BODY. Never coerced.
        // [THREAT:] Implicit 'any' from request JSON can lead to logic corruption or runtime crashes.
        // [DECISION LOG] Retains 'unknown' rather than 'any' so the schema gate below is the
        // only path to a typed payload.
        let rawBodyText: string;
        try {
            rawBodyText = await req.text();
        } catch {
            // [GUARD] FAIL CLOSED: an unreadable request stream is not an empty body.
            console.warn(`[Protocol] Unreadable request stream for ${componentId}.`);
            return protocolErrorResponse(req, 'MALFORMED_BODY', undefined, undefined, corsRestricted);
        }

        let rawBody: unknown;
        if (rawBodyText.trim().length === 0) {
            rawBody = {};
        } else {
            try {
                rawBody = JSON.parse(rawBodyText);
            } catch {
                console.warn(`[Protocol] Rejected unparseable JSON body for ${componentId}.`);
                return protocolErrorResponse(req, 'MALFORMED_BODY', undefined, undefined, corsRestricted);
            }
        }

        // [GUARD] CLOSED PAYLOAD CONTRACT: reject undeclared top-level fields.
        // [THREAT:] Valibot's `v.object` silently DROPS unknown keys instead of rejecting
        // them, so every gate in the tree accepted arbitrary extra fields. A caller could
        // smuggle unbounded data into a request that the validation report then reported as
        // clean, and a typo'd field name (`clan_tag` for `CLAN_TAG`) was accepted as a
        // successful call while being silently ignored.
        // [DECISION LOG] Enforced HERE, once, rather than by converting five separate
        // function schemas to `v.strictObject`: a single enforcement point cannot drift out
        // of sync, and it does not require editing files owned by other components. A
        // function that wants this expressed in its own schema may still use
        // `v.strictObject`, which reports `type === 'strict_object'`, is skipped by this
        // guard, and rejects undeclared keys natively.
        // [VERIFIED] No current caller relies on extra fields being ignored: the frontend
        // clients send exactly `{ endpoint }` and `{ tag }`, and the pg_cron triggers send
        // exactly `{"tournaments": ["AUTO"]}` or no body at all.
        const schemaShape = v.safeParse(ObjectSchemaShapeSchema, schema);
        if (schemaShape.success && typeof rawBody === 'object' && rawBody !== null && !Array.isArray(rawBody)) {
            const declaredKeys = schemaShape.output.entries;
            // Object.hasOwn, not `in`: `in` walks the prototype chain, so an
            // undeclared field named after an Object.prototype member
            // (constructor, toString, valueOf, hasOwnProperty) read as declared
            // and passed the closed-payload guard untouched.
            const undeclaredKeys = Object.keys(rawBody).filter((key) => !Object.hasOwn(declaredKeys, key));
            if (undeclaredKeys.length > 0) {
                console.warn(`[Protocol] Validation rejected for ${componentId}: ${undeclaredKeys.length} undeclared field(s).`);
                return protocolErrorResponse(req, 'MALFORMED_PAYLOAD', {
                    details: undeclaredKeys.map((key) => ({ kind: 'undeclared_field', path: [key] }))
                }, undefined, corsRestricted);
            }
        }

        // [GUARD] VALIDATION BOUNDARY: Satisfies ADR Section III.
        // Rejects malformed or hostile payloads before they reach business logic.
        const parsed = v.safeParse(schema, rawBody);
        if (!parsed.success) {
            console.warn(`[Protocol] Validation rejected for ${componentId}: malformed payload.`);
            return protocolErrorResponse(req, 'MALFORMED_PAYLOAD', { details: parsed.issues }, undefined, corsRestricted);
        }

        // 3.5b Rate Limiting Guard (OPT-IN; see ProtocolOptions.rateLimit)
        // [THREAT:] `sync-player-cards`, `query-royale-api`, and `fetch-player-battlelog`
        // accept the publicly known anon key as a valid bearer credential, so the
        // authorization guard above never blocks a scripted flood from an anon caller.
        // [DECISION LOG] The per-IP bucket runs before body parsing. This post-validation
        // section only applies the independent per-IP-plus-target bucket (bounds hammering
        // one specific tag/clan from one IP, without penalizing every OTHER caller of that
        // same popular target).
        if (rateLimit) {
            const callerIp = extractCallerIp(req);

            const targetKeyValue = rateLimit.targetKey?.(parsed.output);
            if (targetKeyValue && rateLimit.targetMaxRequests !== undefined && rateLimit.targetWindowMs !== undefined) {
                const targetCheck = checkRateLimit(
                    `ip-target:${componentId}:${callerIp}:${targetKeyValue}`,
                    rateLimit.targetMaxRequests,
                    rateLimit.targetWindowMs,
                );
                if (targetCheck.limited) {
                    console.warn(`[Protocol] Rate limit exceeded (per-IP-target) for ${componentId} from ${callerIp} on '${targetKeyValue}'.`);
                    return protocolErrorResponse(req, 'RATE_LIMITED', undefined, targetCheck.retryAfterSeconds, corsRestricted);
                }
            }
        }

        // 4. Governance: Initial Heartbeat & Telemetry Boot
        // [DECISION LOG] Telemetry is initiated at the BOOT stage to track the full
        // lifecycle of the request, including duration and audit logs.
        // [THREAT:] Unvalidated RPC responses can mask database connectivity issues or schema drift.
        // [DECISION LOG] Explicitly validating the telemetry registration result to ensure persistence availability.
        const { data: rawTelemetryData, error: telemetryError } = await supabase.rpc('report_telemetry', {
            p_event_type: eventType,
            p_status: 'IN_PROGRESS',
            p_metadata: { stage: 'BOOT', payload: parsed.output }
        });

        // [DECISION LOG: telemetry-registration-failure] ABORT ON AN EXPLICIT RPC ERROR;
        // STAY LENIENT ON A STRUCTURALLY ABSENT ROW. Argued out per the ADR's "Defensive
        // Programming (Fail Fast)" and "Atomicity: partial state leaks are a critical
        // failure" clauses, but deliberately scoped to the signal that actually means
        // "telemetry is unavailable":
        //   - `telemetryError` truthy is an unambiguous, explicit failure signal from
        //     PostgREST/Supabase (auth rejected, connection refused, function missing). The
        //     old behaviour only `console.error`-logged this and let the handler run anyway,
        //     returning 200 with NO audit record anywhere -- a partial-state leak by
        //     definition, and exactly the failure mode this finding reports. That is
        //     unacceptable per the ADR's atomicity clause, so this now THROWS
        //     `ProtocolError('TELEMETRY_UNAVAILABLE', ...)` and aborts before the handler
        //     runs. A 503 here is retryable and visible; the pg_cron triggers that invoke
        //     these functions on a schedule treat a 5xx as transient and simply retry on the
        //     next tick, so this trades an immediate UNAUDITED success for a delayed,
        //     AUDITED one -- never permanent data loss.
        //   - `rawTelemetryData` being `null`/mis-shaped with NO accompanying RPC error is a
        //     materially weaker signal: PostgREST legitimately returns `null` data for some
        //     void-returning or no-op RPC paths, and it is the default response shape of
        //     nearly every Supabase test double in this repo that is not specifically
        //     exercising telemetry. Treating that as a hard abort would fail closed for
        //     every one of those callers on every request, which is a far larger blast
        //     radius than the bug being fixed. This branch therefore keeps the ORIGINAL
        //     lenient behaviour: log a warning, leave `telemetry` (and `telemetryId`) null,
        //     and let every downstream telemetry write become a no-op guarded by
        //     `telemetryId !== null`. The run still completes and returns a real result; it
        //     is simply unaudited for that one request, which is a strictly smaller and
        //     pre-existing risk than the one this finding targets.
        // FINAL CALL: only an explicit `telemetryError` aborts the run. A null/malformed
        // registration response degrades to "unaudited but functional," matching prior
        // behaviour and every existing caller's test double.
        if (telemetryError) {
            throw new ProtocolError(
                'TELEMETRY_UNAVAILABLE',
                `report_telemetry RPC failed for ${componentId}: ${telemetryError.message}`,
                { cause: telemetryError }
            );
        }

        const telemetryValidation = v.safeParse(TelemetrySchema, rawTelemetryData);
        const telemetry = telemetryValidation.success
            ? (Array.isArray(telemetryValidation.output) ? telemetryValidation.output[0] : telemetryValidation.output)
            : null;

        if (!telemetryValidation.success && rawTelemetryData !== null) {
            console.warn(`[Protocol] Telemetry response failed structural validation for ${componentId}.`);
        }

        // [DECISION LOG] Hoisted `telemetryId` (declared above the try block) is assigned
        // whenever registration produced a usable id, so the catch block can tell "never
        // registered" (null, nothing to update) apart from "registered, then the handler
        // threw" (set, drive the row to FAILED).
        telemetryId = telemetry?.id ?? null;

        logAudit('BOOT', 'triggered', { payload: parsed.output });

        // [DECISION LOG] Initial heartbeat signals to the global supervisor that
        // the Edge Function has started and is nominally healthy.
        await reportHeartbeat(supabase, {
            p_component_id: componentId,
            p_status: 'RUNNING',
            p_message: `Protocol execution initiated for ${componentId}.`
        });

        /**
         * Heartbeat closure for the handler.
         * [DECISION LOG] Provides a mechanism for long-running handlers to persist
         * intermediate results, ensuring partial progress is not lost on timeout.
         */
        const heartbeat = async (stage: string, currentResults: unknown) => {
            logAudit(stage, 'terminated', { status: 'IN_PROGRESS' });
            if (telemetryId !== null) {
                await supabase.rpc('update_telemetry', {
                    p_id: telemetryId,
                    p_status: 'IN_PROGRESS',
                    p_metadata: { 
                        ...(typeof currentResults === 'object' && currentResults !== null ? currentResults : { results: currentResults }),
                        stage, 
                        current_duration: Temporal.Now.instant().since(startInstant).total('milliseconds'),
                        audit_log
                    }
                });
            }
        };

        // 5. Logic Execution
        // [THREAT:] Unhandled exceptions in the handler are caught by the global protocol block.
        const results = await handler(parsed.output, logAudit, heartbeat);

        // 6. Governance: Completion & Telemetry Closure
        // [DECISION LOG] Final telemetry update aggregates all audit entries and
        // calculates total execution duration for performance monitoring.
        const audit_log_final = [...audit_log, { 
            timestamp: Temporal.Now.instant().toString(), 
            stage: 'COMPLETE', 
            action: 'terminated' as const, 
            details: { status: 'SUCCESS' } 
        }];

        const integrityChecks = audit_log_final.filter(entry => entry.action === 'integrity_checked');

        // [GUARD] VALIDATION BOUNDARY: isDataPerfect Calculation
        // [THREAT:] False positives in data perfection reporting can mask silent validation failures.
        // [DECISION LOG] Replacing manual typeof narrowing and unsafe 'as' type assertions with a
        // strict v.safeParse() validation boundary using IntegrityCheckDetailsSchema.
        // This ensures that 'isDataPerfect' accurately reflects that ALL integrity checks passed
        // based on a validated structural contract.
        const isDataPerfect = integrityChecks.length > 0 && integrityChecks.every(check => {
            const validation = v.safeParse(IntegrityCheckDetailsSchema, check.details);
            return validation.success && validation.output.passed === true;
        });

        const validationReport = {
            stages_called: audit_log_final.filter(entry => entry.action === 'called').map(entry => entry.stage),
            stages_run: audit_log_final.filter(entry => entry.action === 'run').map(entry => entry.stage),
            integrity_checks: integrityChecks.map(check => {
                const validation = v.safeParse(IntegrityCheckDetailsSchema, check.details);
                return {
                    stage: check.stage,
                    passed: validation.success ? validation.output.passed : false
                };
            }),
            total_duration: Temporal.Now.instant().since(startInstant).total('milliseconds')
        };
        
        if (telemetryId !== null) {
            await supabase.rpc('update_telemetry', {
                p_id: telemetryId,
                p_status: 'SUCCESS',
                p_metadata: { 
                    ...(typeof results === 'object' && results !== null ? results : { results }),
                    stage: 'COMPLETE', 
                    current_duration: Temporal.Now.instant().since(startInstant).total('milliseconds'),
                    audit_log: audit_log_final,
                    is_data_perfect: isDataPerfect,
                    validation_report: validationReport
                }
            });
        }

        await reportHeartbeat(supabase, {
            p_component_id: componentId,
            p_status: 'COMPLETED',
            p_message: `Protocol execution completed. Data perfection: ${isDataPerfect}`,
            p_metadata: {
                last_success_at: Temporal.Now.instant().toString(),
                last_validation_report: validationReport,
                is_data_perfect: isDataPerfect
            }
        });

        return new Response(JSON.stringify({
            success: true,
            version: '14.47.0',
            data: results,
            duration_ms: Temporal.Now.instant().since(startInstant).total('milliseconds'),
            timestamp: Temporal.Now.instant().toString()
        }), {
            status: 200, headers: { "Content-Type": "application/json", ...resolveCorsHeaders(req, corsRestricted) }
        });

    } catch (protocolError: unknown) {
        // [THREAT:] Unhandled exceptions within the handler or protocol lifecycle
        // are trapped here to prevent raw runtime leaks and ensure failed status reporting.
        // [DECISION LOG] Classify via `classifyThrown` rather than reading `.message`
        // directly: a `ProtocolError` carries a stable `code` that is SAFE to return, while
        // its `.message` (like any other thrown value's) is FULL internal detail that must
        // stay server-side. Anything not already a `ProtocolError` degrades to
        // `INTERNAL_ERROR`, which leaks nothing regardless of what the original throw said.
        const { code, internalDetail } = classifyThrown(protocolError);
        console.error(`[CRITICAL] Protocol Violation in ${componentId} [${code}]: ${internalDetail}`);
        logAudit('FATAL_ERROR', 'error', { code, message: internalDetail });

        // [DECISION LOG] Drive the telemetry row to a terminal FAILED state ONLY when a row
        // was actually registered (`telemetryId !== null`). If registration itself is what
        // failed (the `TELEMETRY_UNAVAILABLE` throw above, before `telemetryId` is assigned),
        // there is no row to update -- attempting one would either no-op against a bogus id
        // or throw a second, more confusing error out of the error handler itself. The
        // `report_heartbeat` FAILED call below is unconditional because it is a component
        // health signal, not a per-run audit row, and does not depend on telemetry having
        // registered successfully.
        // [GUARD] Wrapped in its own try/catch so a DB outage that caused (or accompanies)
        // the original failure cannot throw a SECOND, unhandled exception out of the error
        // handler and crash the function with no response at all.
        if (telemetryId !== null) {
            try {
                await supabase.rpc('update_telemetry', {
                    p_id: telemetryId,
                    p_status: 'FAILED',
                    p_metadata: {
                        stage: 'FATAL_ERROR',
                        error_code: code,
                        error_detail: internalDetail,
                        current_duration: Temporal.Now.instant().since(startInstant).total('milliseconds'),
                        audit_log
                    }
                });
            } catch (telemetryCloseError: unknown) {
                console.error(
                    `[Protocol] Failed to persist terminal FAILED telemetry state for ${componentId}: ` +
                    `${telemetryCloseError instanceof Error ? telemetryCloseError.message : String(telemetryCloseError)}`
                );
            }
        }

        try {
            await reportHeartbeat(supabase, {
                p_component_id: componentId,
                p_status: 'FAILED',
                p_message: `Fatal protocol error [${code}] in ${componentId}.`,
                p_metadata: {
                    last_failure_at: Temporal.Now.instant().toString(),
                    is_data_perfect: false,
                    last_validation_report: {
                        error_code: code,
                        error: internalDetail,
                        audit_log
                    }
                }
            });
        } catch (heartbeatError: unknown) {
            console.error(
                `[Protocol] Failed to report FAILED heartbeat for ${componentId}: ` +
                `${heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError)}`
            );
        }

        // [THREAT:] Returning `internalDetail` here would leak API key-pool sizes, upstream
        // status codes, and database schema/table names across the trust boundary. Only
        // `toClientSafeMessage(code)` and the stable `code` itself are safe to return.
        return new Response(JSON.stringify({
            error: toClientSafeMessage(code),
            code,
            layer: 'L5_CONTROL',
            component_id: componentId
        }), {
            status: PROTOCOL_ERROR_STATUS[code],
            headers: { "Content-Type": "application/json", ...resolveCorsHeaders(req, corsRestricted) }
        });
    }
}
