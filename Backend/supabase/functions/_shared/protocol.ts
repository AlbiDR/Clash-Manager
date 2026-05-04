// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as v from "npm:valibot";
import { AuditEntry } from "./types.ts";

/**
 * L5 Control: Clinical Protocol Handler
 * Standardizes authorization, validation, and microscopic telemetry across all Edge Functions.
 */

export interface ProtocolOptions<T> {
    req: Request;
    supabase: SupabaseClient;
    bearerToken: string;
    eventType: string;
    componentId: string;
    schema: v.BaseSchema<any, T, any>;
    handler: (
        payload: T, 
        logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
        heartbeat: (stage: string, currentResults: unknown) => Promise<void>
    ) => Promise<unknown>;
}

export async function clinicalServe<T>(options: ProtocolOptions<T>) {
    const { req, supabase, bearerToken, eventType, componentId, schema, handler } = options;
    const startTime = Date.now();
    const audit_log: AuditEntry[] = [];

    /**
     * [DECISION LOG] Microscopic Telemetry
     * Rationale: Standardizes audit logging across all pipeline stages,
     * ensuring that details are captured as unknown to prevent pathogen spread.
     */
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
        const authHeader = req.headers.get("Authorization");
        const expectedToken = `Bearer ${bearerToken}`;
        if (!bearerToken || authHeader !== expectedToken) {
            console.error(`[Protocol] Unauthorized access attempt blocked for ${componentId}.`);
            return new Response(JSON.stringify({ error: "Unauthorized" }), { 
                status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
            });
        }

        // 3. Method & Payload Validation
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

        // 4. Governance: Initial Heartbeat & Telemetry Boot
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

        /**
         * [DECISION LOG] Persistence Recovery & Health
         * Rationale: Provides in-flight telemetry updates to the substrate.
         * THREAT: Payload inflation or malformed results could corrupt telemetry.
         * Type narrowing ensures only object-like results are spread.
         */
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

        // 5. Logic Execution
        const results = await handler(parsed.output, logAudit, heartbeat);

        // 6. Governance: Completion & Telemetry Closure
        const audit_log_final = [...audit_log, { 
            timestamp: new Date().toISOString(), 
            stage: 'COMPLETE', 
            action: 'terminated' as const, 
            details: { status: 'SUCCESS' } 
        }];

        const integrityChecks = audit_log_final.filter(a => a.action === 'integrity_checked');

        /**
         * [GUARD] INTEGRITY AGGREGATION
         * Rationale: Collects integrity state from all stages.
         * Narrowing 'details' to ensure safe access to the 'passed' flag.
         */
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
        /**
         * [GUARD] FATAL PROTOCOL ERROR HANDLING
         * THREAT: Silent failure or unhandled exceptions in Edge Functions.
         * Rationale: Ensures that every failure is logged to both console and substrate,
         * while returning a standardized error response to the client.
         */
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
