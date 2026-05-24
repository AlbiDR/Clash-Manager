// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as v from "npm:valibot";
import { AuditEntry } from "./types.ts";

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
    /** The expected shared internal bearer token for service-to-service auth. */
    bearerToken: string;
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
    const startTime = Date.now();
    const audit_log: AuditEntry[] = [];

    const logAudit = (stage: string, action: AuditEntry['action'], details?: unknown) => {
        audit_log.push({ timestamp: new Date().toISOString(), stage, action, details });
    };

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
        // [DECISION LOG] Uses a shared internal bearer token for service-to-service auth.
        const authHeader = req.headers.get("Authorization");
        const expectedToken = `Bearer ${bearerToken}`;
        if (!bearerToken || authHeader !== expectedToken) {
            console.error(`[Protocol] Unauthorized access attempt blocked for ${componentId}.`);
            return new Response(JSON.stringify({ error: "Unauthorized" }), { 
                status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        // 3. Method & Payload Validation
        // [THREAT:] Rejects malformed, malicious, or non-POST payloads at the L5 boundary.
        // [DECISION LOG] Strictly enforces POST to simplify the protocol's state machine.
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
                status: 405, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        const rawBody = await req.json().catch(() => ({}));
        // [GUARD] VALIDATION BOUNDARY: Satisfies ADR Section III.
        // Rejects malformed or hostile payloads before they reach business logic.
        const parsed = v.safeParse(schema, rawBody);
        if (!parsed.success) {
            console.warn(`[Protocol] Validation rejected for ${componentId}: malformed payload.`);
            return new Response(JSON.stringify({ error: "Malformed Payload", details: parsed.issues }), { 
                status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        // 4. Governance: Initial Heartbeat & Telemetry Boot
        // [DECISION LOG] Telemetry is initiated at the BOOT stage to track the full
        // lifecycle of the request, including duration and audit logs.
        const { data: telemetryData } = await supabase.rpc('report_telemetry', {
            p_event_type: eventType,
            p_status: 'IN_PROGRESS',
            p_metadata: { stage: 'BOOT', payload: parsed.output }
        });
        const telemetry = telemetryData && Array.isArray(telemetryData) ? telemetryData[0] : telemetryData;

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
                        current_duration: Date.now() - startTime,
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
            timestamp: new Date().toISOString(), 
            stage: 'COMPLETE', 
            action: 'terminated' as const, 
            details: { status: 'SUCCESS' } 
        }];

        const integrityChecks = audit_log_final.filter(entry => entry.action === 'integrity_checked');
        const isDataPerfect = integrityChecks.length > 0 && integrityChecks.every(check => {
            const details = check.details as Record<string, unknown> | undefined;
            return typeof details === 'object' && details !== null && details.passed === true;
        });

        const validationReport = {
            stages_called: audit_log_final.filter(entry => entry.action === 'called').map(entry => entry.stage),
            stages_run: audit_log_final.filter(entry => entry.action === 'run').map(entry => entry.stage),
            integrity_checks: integrityChecks.map(check => {
                const details = check.details as Record<string, unknown> | undefined;
                return { stage: check.stage, passed: details?.passed === true };
            }),
            total_duration: Date.now() - startTime
        };
        
        if (telemetry?.id) {
            await supabase.rpc('update_telemetry', {
                p_id: telemetry.id,
                p_status: 'SUCCESS',
                p_metadata: { 
                    ...(typeof results === 'object' && results !== null ? results : { results }),
                    stage: 'COMPLETE', 
                    current_duration: Date.now() - startTime,
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
                last_success_at: new Date().toISOString(),
                last_validation_report: validationReport,
                is_data_perfect: isDataPerfect
            }
        });

        return new Response(JSON.stringify({
            success: true,
            version: '14.0.0-clinical',
            data: results,
            duration_ms: Date.now() - startTime,
            timestamp: new Date().toISOString()
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
                last_failure_at: new Date().toISOString(),
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
