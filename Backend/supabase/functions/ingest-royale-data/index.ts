// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { IngestionWorkBudget } from "./work-budget.ts";
import { withAbortSignal } from "../_shared/abortSignal.ts";
import { executePipeline } from "./pipeline.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { ProtocolError } from "../_shared/errors.ts";
import { normalizeTag } from "../_shared/utils.ts";
import { RoyaleTagSchema } from "../_shared/schemas.ts";
import * as v from "npm:valibot@1.5.0";

/**
 * Supabase Edge Function: ingest-royale-data
 * L5 Control Layer: Public API Entry Point
 */

// [GUARD] VALIDATION BOUNDARY: A caller-supplied CLAN_TAG must match the
// Clash Royale tag format (mirrors the DB's `clan_tag` CHECK constraint)
// before it reaches `p_clan_tag` on any ingestion RPC.
const PayloadSchema = v.object({
    CLAN_TAG: v.optional(RoyaleTagSchema)
});

Deno.serve(async (req) => {
    const budget = new IngestionWorkBudget();
    try {
        const invocationClient = new Proxy(supabase, {
            get(target, property, receiver) {
                if (property === 'rpc') return (...args: Parameters<typeof supabase.rpc>) =>
                    withAbortSignal(target.rpc(...args), budget.lifecycleSignal);
                return Reflect.get(target, property, receiver);
            },
        });
        await syncVault(invocationClient);
        budget.throwIfExpired();

        return await clinicalServe({
            req,
            supabase: invocationClient,
            bearerToken: CONFIG.INTERNAL_BEARER_TOKEN,
            eventType: 'INGESTION_CYCLE',
            componentId: 'ROYALE_DATA_INGESTOR',
            schema: PayloadSchema,
            handler: async (payload, logAudit, heartbeat) => {
                // [DECISION LOG] Normalize a caller-supplied CLAN_TAG so a case- or
                // prefix-variant tag cannot reach p_clan_tag, consistent with sibling
                // functions (sync-player-cards, fetch-player-battlelog).
                const clanTag = payload.CLAN_TAG ? normalizeTag(payload.CLAN_TAG) : CONFIG.CLAN_TAG;
                let clanSyncExecutionFailed = false;
                const pipelineAudit = (stage: string, action: Parameters<typeof logAudit>[1], details?: unknown) => {
                    if (stage === "CLAN_SYNC" && action === "error") clanSyncExecutionFailed = true;
                    logAudit(stage, action, details);
                };
                const results = await executePipeline(clanTag, pipelineAudit, heartbeat, budget);
                const requiredWriteStages = ["profile", "members", "race", "warlog"] as const;
                const incompleteRequiredWrites = requiredWriteStages.filter(
                    (stage) => results?.[stage]?.success !== true,
                );
                const failedCompletionChecks: string[] = [
                    ...incompleteRequiredWrites,
                    ...(clanSyncExecutionFailed ? ["clan-sync-execution"] : []),
                ];

                const memberProgress = results?.battles as typeof results.battles & { members_failed?: number; members_deferred?: number; cursor_ack_failed?: boolean };
                if ((memberProgress?.members_failed ?? 0) + (memberProgress?.members_deferred ?? 0) > 0) {
                    failedCompletionChecks.push("member-battle-polls");
                }
                if (memberProgress?.cursor_ack_failed) failedCompletionChecks.push("recruit-poll-checkpoint");
                if (failedCompletionChecks.length > 0) {
                    throw new ProtocolError(
                        "INTERNAL_ERROR",
                        `Required clan persistence incomplete: ${failedCompletionChecks.join(", ")}`,
                    );
                }

                return results;
            }
        });
    } catch {
        return new Response(JSON.stringify({ success: false, error: "INGESTION_DEADLINE_OR_SETUP_FAILURE" }), {
            status: 503, headers: { "Content-Type": "application/json" },
        });
    } finally { budget.dispose(); }
});
