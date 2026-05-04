// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as v from "npm:valibot";
import { AuditEntry } from "./types.ts";

/**
 * L5 Control: Clinical Protocol Handler
 * Standardizes authorization, validation, and microscopic telemetry across all Edge Functions.
 *
 * @remarks
 * The Clinical Protocol serves as the authoritative entry point for the Supabase Binary Stack.
 * It enforces the Structural Unitary Architecture by acting as a Layer 5 Control boundary,
 * ensuring all inbound requests are authenticated, validated against Valibot schemas,
 * and microscopically tracked within the 'substrate' schema.
 */

/**
 * Configuration for the Clinical Protocol execution.
 * @template T - The validated payload type.
 */
export interface ProtocolOptions<T> {
    /** The raw inbound HTTP Request. */
    req: Request;
    /** Authenticated Supabase client for substrate persistence. */
    supabase: SupabaseClient;
    /** The internal bearer token required for authorization. */
    bearerToken: string;
    /** Unique identifier for the event type (e.g., 'INGEST_ROYALE'). */
    eventType: string;
    /** Unique identifier for the executing component (e.g., 'headhunter-scanner'). */
    componentId: string;
    /** Valibot schema for inbound payload validation. */
    schema: v.BaseSchema<any, T, any>;
    /**
     * The core business logic handler.
     * @param payload - The validated and typed request body.
     * @param logAudit - Function to record a microscopic audit entry.
     * @param heartbeat - Function to update in-flight telemetry and heartbeat status.
     * @returns The final result to be returned in the 'data' field of the response.
     */
    handler: (
        payload: T, 
        logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
        heartbeat: (stage: string, currentResults: unknown) => Promise<void>
    ) => Promise<unknown>;
}

/**
 * Orchestrates the 6-stage Clinical Protocol for Edge Functions.
 *
 * @step 1. CORS Preflight - Handles cross-origin security.
 * @step 2. Authorization Guard - Validates the Internal Bearer Token.
 * @step 3. Method & Payload Validation - Enforces POST-only and Valibot schema integrity.
 * @step 4. Governance Boot - Initializes telemetry records in the 'substrate' schema.
 * @step 5. Logic Execution - Executes the provided handler with injected telemetry tools.
 * @step 6. Governance Closure - Finalizes telemetry and heartbeat state.
 *
 * @template T - The validated payload type.
 * @param options - Protocol configuration and logic handler.
 * @returns A standardized JSON Response with success status, versioning, and telemetry.
 * @throws {Error} Standardized protocol violation errors with L5_CONTROL classification.
 */
export async function clinicalServe<T>(options: ProtocolOptions<T>) {
    const { req, supabase, bearerToken, eventType, componentId, schema, handler } = options;
    const startTime = Date.now();
    const audit_log: AuditEntry[] = [];

    // [DECISION LOG] Microscopic Telemetry
    // Rationale: Standardizes audit logging across all pipeline stages,
    // ensuring that details are captured as unknown to prevent pathogen spread.
    const logAudit = (stage: string, action: AuditEntry['action'], details?: unknown) => {
        audit_log.push({ timestamp: new Date().toISOString(), stage, action, details });
    };

    // [DECISION LOG] Stage 1: CORS Preflight
    // Rationale: Prevents browser blocking for authenticated cross-origin requests.
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
        // [DECISION LOG] Stage 2: Authorization Guard
        // THREAT: Unauthorized substrate access or external intrusion.
        // Rationale: Enforces a strict Zero-Trust boundary at the control surface.
        const authHeader = req.headers.get("Authorization");
        const expectedToken = `Bearer ${bearerToken}`;
        if (!bearerToken || authHeader !== expectedToken) {
            console.error(`[Protocol] Unauthorized access attempt blocked for ${componentId}.`);
            return new Response(JSON.stringify({ error: "Unauthorized" }), { 
                status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        // [DECISION LOG] Stage 3: Method & Payload Validation
        // THREAT: Pathogen injection via malformed or malicious request bodies.
        // Rationale: Ensures transactional integrity by rejecting requests before logic execution.
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
                status: 405, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        const rawBody = await req.json().catch(() => ({}));
        const parsed = v.safeParse(schema, rawBody);
        if (!parsed.success) {
            console.warn(`[Protocol] Validation rejected for ${componentId}: malformed payload.`);
            return new Response(JSON.stringify({ error: "Malformed Payload", details: parsed.issues }), { 
                status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        // [DECISION LOG] Stage 4: Governance: Initial Heartbeat & Telemetry Boot
        // Rationale: Establishes a "black box" recording of the execution lifecycle
        // before business logic begins, enabling recovery and auditability.
        const { data: telemetry } = await supabase.schema('substrate').from('governance_telemetry').insert({
            event_type: eventType,
            status: 'IN_PROGRESS',
            metadata: { stage: 'BOOT', payload: parsed.output }
        }).select('id').single();

        logAudit('BOOT', 'triggered', { payload: parsed.output });

        await supabase.schema('substrate').from('pipeline_heartbeat').upsert({
            component_id: componentId,
            status: 'RUNNING',
            last_triggered_at: new Date().toISOString(),
            last_message: `Protocol execution initiated for ${componentId}.`
        });

        // [DECISION LOG] Persistence Recovery & Health
        // Rationale: Provides in-flight telemetry updates to the substrate.
        // THREAT: Payload inflation or malformed results could corrupt telemetry.
        // Type narrowing ensures only object-like results are spread.
        const heartbeat = async (stage: string, currentResults: unknown) => {
            logAudit(stage, 'terminated', { status: 'IN_PROGRESS' });
            if (telemetry?.id) {
                const resultsObject = typeof currentResults === 'object' && currentResults !== null ? currentResults : { results: currentResults };
                await supabase.schema('substrate').from('governance_telemetry')
                    .update({ 
                        metadata: { 
                            ...resultsObject,
                            stage, 
                            current_duration: Date.now() - startTime,
                            audit_log
                        } 
                    })
                    .eq('id', telemetry.id);
            }
        };

        // [DECISION LOG] Stage 5: Logic Execution
        // Rationale: Executes the core task while providing native telemetry hooks (logAudit, heartbeat).
        const results = await handler(parsed.output, logAudit, heartbeat);

        // [DECISION LOG] Stage 6: Governance: Completion & Telemetry Closure
        // Rationale: Finalizes the transaction by aggregating integrity checks and
        // updating the 'substrate' state with duration and completion metadata.
        const audit_log_final = [...audit_log, { 
            timestamp: new Date().toISOString(), 
            stage: 'COMPLETE', 
            action: 'terminated' as const, 
            details: { status: 'SUCCESS' } 
        }];

        const integrityChecks = audit_log_final.filter(a => a.action === 'integrity_checked');

        // [GUARD] INTEGRITY AGGREGATION
        // Rationale: Collects integrity state from all stages.
        // Narrowing 'details' to ensure safe access to the 'passed' flag.
        const isDataPerfect = integrityChecks.length > 0 && integrityChecks.every(c => {
            const d = c.details as Record<string, unknown> | undefined;
            return d?.passed === true;
        });

        const validationReport = {
            stages_called: audit_log_final.filter(a => a.action === 'called').map(a => a.stage),
            stages_run: audit_log_final.filter(a => a.action === 'run').map(a => a.stage),
            integrity_checks: integrityChecks.map(c => {
                const d = c.details as Record<string, unknown> | undefined;
                return { stage: c.stage, passed: d?.passed };
            }),
            total_duration: Date.now() - startTime
        };
        
        if (telemetry?.id) {
            const resultsObject = typeof results === 'object' && results !== null ? results : { results };
            await supabase.schema('substrate').from('governance_telemetry')
                .update({ 
                    status: 'SUCCESS', 
                    metadata: { 
                        ...resultsObject,
                        stage: 'COMPLETE', 
                        current_duration: Date.now() - startTime,
                        audit_log: audit_log_final,
                        is_data_perfect: isDataPerfect,
                        validation_report: validationReport
                    } 
                })
                .eq('id', telemetry.id);
        }

        await supabase.schema('substrate').from('pipeline_heartbeat').upsert({
            component_id: componentId,
            status: 'COMPLETED',
            last_success_at: new Date().toISOString(),
            last_message: `Protocol execution completed. Data perfection: ${isDataPerfect}`,
            last_validation_report: validationReport,
            is_data_perfect: isDataPerfect
        });

        return new Response(JSON.stringify({
            success: true,
            version: '2.4.0-clinical',
            data: results,
            duration_ms: Date.now() - startTime,
            timestamp: new Date().toISOString()
        }), { 
            status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
        });

    } catch (protocolViolationError: unknown) {
        // [GUARD] FATAL PROTOCOL ERROR HANDLING
        // THREAT: Silent failure or unhandled exceptions in Edge Functions.
        // Rationale: Ensures that every failure is logged to both console and substrate,
        // while returning a standardized error response to the client.
        const errorMessage = protocolViolationError instanceof Error ? protocolViolationError.message : String(protocolViolationError);
        console.error(`[CRITICAL] Protocol Violation in ${componentId}: ${errorMessage}`);
        logAudit('FATAL_ERROR', 'error', { message: errorMessage });
        
        await supabase.schema('substrate').from('pipeline_heartbeat').upsert({
            component_id: componentId,
            status: 'FAILED',
            last_failure_at: new Date().toISOString(),
            last_message: `Fatal protocol error: ${errorMessage}`,
            is_data_perfect: false,
            last_validation_report: {
                error: errorMessage,
                audit_log
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
