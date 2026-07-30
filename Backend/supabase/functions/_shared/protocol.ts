// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "npm:@supabase/supabase-js@2.110.8";
import * as v from "npm:valibot@1.4.2";
import { AuditEntry } from "./types.ts";
import { IntegrityCheckDetailsSchema, TelemetrySchema } from "./schemas.ts";
import {
    classifyThrown,
    PROTOCOL_ERROR_STATUS,
    ProtocolError,
    ProtocolErrorCode,
    toClientSafeMessage,
} from "./errors.ts";

/** Standard response headers for every protocol response body. */
const JSON_RESPONSE_HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
};

/** The only Authorization scheme the protocol accepts. */
const BEARER_PREFIX = "Bearer ";

/** Digest used to normalize secrets to a fixed width before comparison. */
const TOKEN_DIGEST_ALGORITHM = "SHA-256";

/** Sentinel for "no telemetry match count yet" in the constant-time auth accumulator. */
const NO_TOKEN_MATCHES = 0;

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
 * @param code - The stable protocol error classification.
 * @param extra - Additional NON-SENSITIVE fields to merge into the response body.
 * @returns A Response carrying `{ error, code, ...extra }`.
 */
function protocolErrorResponse(code: ProtocolErrorCode, extra?: Record<string, unknown>): Response {
    return new Response(JSON.stringify({
        error: toClientSafeMessage(code),
        code,
        ...extra,
    }), {
        status: PROTOCOL_ERROR_STATUS[code],
        headers: JSON_RESPONSE_HEADERS,
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
    schema: v.BaseSchema<unknown, T, unknown>;
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
    const { req, supabase, bearerToken, eventType, componentId, schema, handler } = options;
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

    // 1. CORS Preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type",
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
            return protocolErrorResponse('UNAUTHORIZED');
        }

        // 3. Method & Payload Validation
        // [THREAT:] Rejects malformed, malicious, or non-POST payloads at the L5 boundary.
        // [DECISION LOG] Strictly enforces POST to simplify the protocol's state machine.
        if (req.method !== 'POST') {
            return protocolErrorResponse('METHOD_NOT_ALLOWED');
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
            return protocolErrorResponse('MALFORMED_BODY');
        }

        let rawBody: unknown;
        if (rawBodyText.trim().length === 0) {
            rawBody = {};
        } else {
            try {
                rawBody = JSON.parse(rawBodyText);
            } catch {
                console.warn(`[Protocol] Rejected unparseable JSON body for ${componentId}.`);
                return protocolErrorResponse('MALFORMED_BODY');
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
            const undeclaredKeys = Object.keys(rawBody).filter((key) => !(key in declaredKeys));
            if (undeclaredKeys.length > 0) {
                console.warn(`[Protocol] Validation rejected for ${componentId}: ${undeclaredKeys.length} undeclared field(s).`);
                return protocolErrorResponse('MALFORMED_PAYLOAD', {
                    details: undeclaredKeys.map((key) => ({ kind: 'undeclared_field', path: [key] }))
                });
            }
        }

        // [GUARD] VALIDATION BOUNDARY: Satisfies ADR Section III.
        // Rejects malformed or hostile payloads before they reach business logic.
        const parsed = v.safeParse(schema, rawBody);
        if (!parsed.success) {
            console.warn(`[Protocol] Validation rejected for ${componentId}: malformed payload.`);
            return protocolErrorResponse('MALFORMED_PAYLOAD', { details: parsed.issues });
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

        if (telemetryError) {
            console.error(`[Protocol] Telemetry registration failed: ${telemetryError.message}`);
        }

        const telemetryValidation = v.safeParse(TelemetrySchema, rawTelemetryData);
        const telemetry = telemetryValidation.success
            ? (Array.isArray(telemetryValidation.output) ? telemetryValidation.output[0] : telemetryValidation.output)
            : null;

        if (!telemetryValidation.success && rawTelemetryData !== null) {
            console.warn(`[Protocol] Telemetry response failed structural validation for ${componentId}.`);
        }

        logAudit('BOOT', 'triggered', { payload: parsed.output });

        // [DECISION LOG] Initial heartbeat signals to the global supervisor that
        // the Edge Function has started and is nominally healthy.
        await supabase.rpc('report_heartbeat', {
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
            if (telemetry?.id) {
                await supabase.rpc('update_telemetry', {
                    p_id: telemetry.id,
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
        
        if (telemetry?.id) {
            await supabase.rpc('update_telemetry', {
                p_id: telemetry.id,
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

        await supabase.rpc('report_heartbeat', {
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
            version: '14.39.0',
            data: results,
            duration_ms: Temporal.Now.instant().since(startInstant).total('milliseconds'),
            timestamp: Temporal.Now.instant().toString()
        }), { 
            status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
        });

    } catch (protocolError: unknown) {
        // [THREAT:] Unhandled exceptions within the handler or protocol lifecycle
        // are trapped here to prevent raw runtime leaks and ensure failed status reporting.
        const errorMessage = protocolError instanceof Error ? protocolError.message : String(protocolError);
        console.error(`[CRITICAL] Protocol Violation in ${componentId}: ${errorMessage}`);
        logAudit('FATAL_ERROR', 'error', { message: errorMessage });
        
        await supabase.rpc('report_heartbeat', {
            p_component_id: componentId,
            p_status: 'FAILED',
            p_message: `Fatal protocol error: ${errorMessage}`,
            p_metadata: {
                last_failure_at: Temporal.Now.instant().toString(),
                is_data_perfect: false,
                last_validation_report: {
                    error: errorMessage,
                    audit_log
                }
            }
        });

        return new Response(JSON.stringify({ 
            error: errorMessage,
            layer: 'L5_CONTROL',
            component_id: componentId
        }), { 
            status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
        });
    }
}
