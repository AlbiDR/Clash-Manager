// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "./client.ts";
import { withAbortSignal } from "../_shared/abortSignal.ts";
import { normalizeTag } from "../_shared/utils.ts";
import { INGESTION_WRITE_BATCH_SIZE } from "../_shared/config.ts";
import type { IngestionWorkBudget } from "./work-budget.ts";

type Lead = { tag: string; name: string; trophies: number };

/** Serial bounded writes release payloads as they land; seen tags preserve invocation deduplication. */
export class RecruitWriter {
    private readonly seen = new Set<string>();
    private pending: Lead[] = [];
    private chain: Promise<void> = Promise.resolve();
    harvested = 0;
    duplicates = 0;
    error: string | undefined;
    constructor(private readonly source: 'SHADOW' | 'TOURNAMENT_AUTO', private readonly budget?: IngestionWorkBudget) {}
    add(leads: Lead[]): Promise<void> {
        const operation = this.chain.then(async () => {
            for (const lead of leads) {
                const tag = normalizeTag(lead.tag);
                if (this.seen.has(tag)) { this.duplicates++; continue; }
                this.seen.add(tag);
                this.pending.push({ ...lead, tag });
                if (this.pending.length === INGESTION_WRITE_BATCH_SIZE) await this.flushPending();
            }
        });
        // A rejected write must not strand independently accepted callers.
        this.chain = operation.catch(() => {});
        return operation;
    }
    async finish(): Promise<void> { await this.chain; await this.flushPending(); }
    private async flushPending(): Promise<void> {
        if (!this.pending.length) return;
        this.budget?.throwIfExpired();
        const batch = this.pending.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
        this.pending = [];
        const players = batch.map(lead => ({ player_tag: lead.tag, player_name: lead.name,
            ...(this.source === 'SHADOW' ? { trophies: 0 } : {}) }));
        const recruits = batch.map(lead => ({ player_tag: lead.tag, player_name: lead.name,
            trophies: lead.trophies, source: this.source, status: 'ACTIVE' }));
        const registry = await withAbortSignal(supabase.rpc('sync_players', { p_players: players }), this.budget?.signal);
        if (registry.error) { this.error = `${this.source === "SHADOW" ? "Player Registry Sync Failure" : "Player Registry Batch Sync Failure"}: ${registry.error.message}`; return; }
        const result = await withAbortSignal(supabase.rpc('sync_recruits', { p_recruits: recruits }), this.budget?.signal);
        if (result.error) { this.error = `${this.source === "SHADOW" ? "Shadow Lead Batch Upsert Failure" : "Recruit Registry Batch Sync Failure"}: ${result.error.message}`; return; }
        this.harvested += batch.length;
    }
}
