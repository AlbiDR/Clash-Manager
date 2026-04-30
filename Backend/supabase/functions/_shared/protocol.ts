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
        logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void,
        heartbeat: (stage: string, currentResults: any) => Promise<void>
    ) => Promise<any>;
}

export async function clinicalServe<T>(options: ProtocolOptions<T>) {
    const { req, supabase, bearerToken, eventType, componentId, schema, handler } = options;
    const startTime = Date.now();
    const audit_log: AuditEntry[] = [];

    const logAudit = (stage: string, action: AuditEntry['action'], details?: any) => {
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

        const heartbeat = async (stage: string, currentResults: any) => {
            logAudit(stage, 'terminated', { status: 'IN_PROGRESS' });
            if (telemetry?.id) {
                await supabase.schema('substrate').from('governance_telemetry')
                    .update({ 
                        metadata: { 
                            ...currentResults, 
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
        const isDataPerfect = integrityChecks.length > 0 && integrityChecks.every(c => c.details?.passed === true);
        const validationReport = {
            stages_called: audit_log_final.filter(a => a.action === 'called').map(a => a.stage),
            stages_run: audit_log_final.filter(a => a.action === 'run').map(a => a.stage),
            integrity_checks: integrityChecks.map(c => ({ stage: c.stage, passed: c.details?.passed })),
            total_duration: Date.now() - startTime
        };
        
        if (telemetry?.id) {
            await supabase.schema('substrate').from('governance_telemetry')
                .update({ 
                    status: 'SUCCESS', 
                    metadata: { 
                        ...results, 
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

    } catch (err: any) {
        console.error(`[CRITICAL] Protocol Violation in ${componentId}: ${err.message}`);
        logAudit('FATAL_ERROR', 'error', { message: err.message });
        
        await supabase.schema('substrate').from('pipeline_heartbeat').upsert({
            component_id: componentId,
            status: 'FAILED',
            last_failure_at: new Date().toISOString(),
            last_message: `Fatal protocol error: ${err.message}`,
            is_data_perfect: false,
            last_validation_report: {
                error: err.message,
                audit_log
            }
        });

        return new Response(JSON.stringify({ 
            error: err.message, 
            layer: 'L5_CONTROL',
            component_id: componentId
        }), { 
            status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
        });
    }
}
