// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Typed Protocol Errors
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core) contract consumed by the Layer 5 control surface
 *   (`_shared/protocol.ts`).
 * - **Satisfaction:** ADR Section IV: "Error Propagation Contract - Errors must never
 *   be thrown as raw strings. Every thrown value must conform to a typed error shape.
 *   Errors must propagate upward to the nearest Layer 5 control surface before
 *   classification."
 *
 * **Why this module exists:**
 * Before this file, every backend throw site produced a bare `new Error(templateString)`
 * and `clinicalServe` returned `protocolError.message` verbatim to the caller. That gave
 * the control surface nothing to classify on, and it leaked internal detail across the
 * trust boundary (for example `muscle.ts` reports the size of the API key pool, and
 * PostgREST RPC errors quote schema, table, and column names). Edge Functions are
 * reachable with a publicly known anon key, so that leak is real.
 *
 * **The contract:**
 * - `code` is the STABLE machine-readable classification. It is safe to return.
 * - `message` is the FULL internal detail. It is for `console.error` and telemetry
 *   metadata ONLY and must never be returned across the trust boundary.
 * - `CLIENT_SAFE_MESSAGE[code]` is the ONLY human-readable text a client ever sees.
 * - An unclassified throw (any value that is not a `ProtocolError`) degrades to
 *   `INTERNAL_ERROR`, which leaks nothing.
 *
 * **Style:** Mirrors the frontend's existing typed-error approach
 * (`NetworkError` in `Frontend-PWA/src/core/api/SupabaseClient.ts`): a thin subclass of
 * `Error` with an explicit `name` and an explicit `setPrototypeOf` call so that
 * `instanceof` survives transpilation down-levelling.
 */

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_METHOD_NOT_ALLOWED = 405;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;

/**
 * The closed registry of protocol-level error classifications.
 *
 * @remarks
 * [DECISION LOG] Deliberately a closed union rather than an open `string`. Adding a new
 * failure mode requires adding it here, which forces an author to also declare its HTTP
 * status and its client-safe wording. That is the mechanism that keeps the wire contract
 * stable and keeps internal detail from escaping by default.
 */
export type ProtocolErrorCode =
    /** The bearer token presented at the L5 boundary did not match any configured token. */
    | 'UNAUTHORIZED'
    /** The request used a verb the protocol does not implement. */
    | 'METHOD_NOT_ALLOWED'
    /** The request body was present but was not parseable JSON (truncated, binary, or plain text). */
    | 'MALFORMED_BODY'
    /** The parsed body failed the function's Valibot validation boundary. */
    | 'MALFORMED_PAYLOAD'
    /**
     * The caller (an IP, or an IP + target tag/clan pair) exceeded the configured
     * in-memory request-rate ceiling for an anon-reachable Edge Function. See the
     * rate-limiting section of `protocol.ts` for the (deliberately simple, per-warm-instance)
     * enforcement mechanism.
     */
    | 'RATE_LIMITED'
    /** Governance telemetry could not be registered, so the run cannot be audited end to end. */
    | 'TELEMETRY_UNAVAILABLE'
    /** Catch-all for any unclassified throw. Leaks nothing. */
    | 'INTERNAL_ERROR';

/**
 * Authoritative code-to-HTTP-status map.
 *
 * @remarks
 * [DECISION LOG] The status is derived from the code rather than passed per-throw. One
 * code always means one status, which keeps the wire contract predictable for the
 * frontend and removes a per-call-site decision that could drift.
 */
export const PROTOCOL_ERROR_STATUS: Record<ProtocolErrorCode, number> = {
    UNAUTHORIZED: HTTP_STATUS_UNAUTHORIZED,
    METHOD_NOT_ALLOWED: HTTP_STATUS_METHOD_NOT_ALLOWED,
    MALFORMED_BODY: HTTP_STATUS_BAD_REQUEST,
    MALFORMED_PAYLOAD: HTTP_STATUS_BAD_REQUEST,
    RATE_LIMITED: HTTP_STATUS_TOO_MANY_REQUESTS,
    TELEMETRY_UNAVAILABLE: HTTP_STATUS_SERVICE_UNAVAILABLE,
    INTERNAL_ERROR: HTTP_STATUS_INTERNAL_SERVER_ERROR,
};

/**
 * The ONLY human-readable error text permitted across the trust boundary.
 *
 * @remarks
 * [THREAT:] Internal exception messages quote API key-pool sizes, upstream status codes,
 * database schema names, and table names. Returning them to an unauthenticated caller is
 * an information-disclosure defect.
 * [DECISION LOG] Every entry is written to be actionable to a caller yet devoid of
 * internal topology. The 401/405/400 strings intentionally preserve the exact wording the
 * protocol has always returned so that existing clients and specs keep working.
 */
export const CLIENT_SAFE_MESSAGE: Record<ProtocolErrorCode, string> = {
    UNAUTHORIZED: 'Unauthorized',
    METHOD_NOT_ALLOWED: 'Method Not Allowed',
    MALFORMED_BODY: 'Malformed Request Body',
    MALFORMED_PAYLOAD: 'Malformed Payload',
    RATE_LIMITED: 'Too Many Requests',
    TELEMETRY_UNAVAILABLE: 'Service Unavailable',
    INTERNAL_ERROR: 'Internal Server Error',
};

/**
 * L1 Core: Typed protocol error.
 *
 * @remarks
 * Carries a stable classification alongside the full internal detail so that the Layer 5
 * control surface can decide what to persist, what to log, and what to return.
 *
 * @example
 * ```ts
 * throw new ProtocolError(
 *     'TELEMETRY_UNAVAILABLE',
 *     `report_telemetry returned no usable id: ${registrationError.message}`,
 *     { cause: registrationError }
 * );
 * ```
 */
export class ProtocolError extends Error {
    /** Stable machine-readable classification. Safe to return across the trust boundary. */
    readonly code: ProtocolErrorCode;
    /** HTTP status the L5 control surface should respond with. Derived from `code`. */
    readonly httpStatus: number;

    /**
     * @param code - The stable classification for this failure.
     * @param message - FULL internal detail. Logged and persisted, NEVER returned to a caller.
     * @param options - Optional `cause` for the originating error, preserved for diagnosis.
     */
    constructor(code: ProtocolErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'ProtocolError';
        this.code = code;
        this.httpStatus = PROTOCOL_ERROR_STATUS[code];
        // [DECISION LOG] Explicit prototype restoration so that `instanceof ProtocolError`
        // holds even when the class is transpiled to an ES5-style constructor function.
        // Mirrors the frontend's NetworkError implementation.
        Object.setPrototypeOf(this, ProtocolError.prototype);
    }
}

/**
 * Resolves the client-facing text for a classification.
 *
 * @remarks
 * [GUARD] Falls back to the `INTERNAL_ERROR` wording for any unrecognized code so that a
 * future code added without a message entry still cannot leak internal detail.
 *
 * @param code - A protocol error classification.
 * @returns Sanitized text that is safe to return across the trust boundary.
 */
export function toClientSafeMessage(code: ProtocolErrorCode): string {
    return CLIENT_SAFE_MESSAGE[code] ?? CLIENT_SAFE_MESSAGE.INTERNAL_ERROR;
}

/**
 * Classifies an unknown thrown value into the typed error contract.
 *
 * @remarks
 * [THREAT:] JavaScript permits throwing any value, so the control surface must assume the
 * caught value is neither an `Error` nor a `ProtocolError`.
 * [DECISION LOG] Anything that is not already a `ProtocolError` degrades to
 * `INTERNAL_ERROR`. The original text is retained as `internalDetail` for logging and
 * telemetry, but it never reaches the response body.
 *
 * @param thrown - The value caught by the Layer 5 control surface.
 * @returns The stable classification plus the full internal detail. The HTTP status and
 *          the client-facing text are derived from `code` via `PROTOCOL_ERROR_STATUS` and
 *          `toClientSafeMessage`, so they are deliberately not duplicated here.
 */
export function classifyThrown(thrown: unknown): {
    code: ProtocolErrorCode;
    internalDetail: string;
} {
    if (thrown instanceof ProtocolError) {
        return { code: thrown.code, internalDetail: thrown.message };
    }

    return {
        code: 'INTERNAL_ERROR',
        internalDetail: thrown instanceof Error ? thrown.message : String(thrown),
    };
}
