// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { INGESTION_WORK_BUDGET_MS, INGESTION_CHECKPOINT_RESERVE_MS, INGESTION_LIFECYCLE_BUDGET_MS } from "../_shared/config.ts";
import { throwIfAborted } from "../_shared/abortSignal.ts";

/** Invocation-wide I/O deadline, including Vault setup, with time to flush writes. */
export class IngestionWorkBudget {
    private readonly lifecycle = new AbortController();
    readonly lifecycleSignal = this.lifecycle.signal;
    private readonly work = new AbortController();
    private readonly admission = new AbortController();
    private readonly timers: ReturnType<typeof setTimeout>[];
    readonly signal = this.work.signal;
    readonly admissionSignal = this.admission.signal;
    readonly startedAt = Date.now();
    constructor(private readonly workMs = INGESTION_WORK_BUDGET_MS, private readonly reserveMs = INGESTION_CHECKPOINT_RESERVE_MS, lifecycleMs = INGESTION_LIFECYCLE_BUDGET_MS) {
        this.timers = [
            setTimeout(() => this.lifecycle.abort(new Error("Ingestion lifecycle deadline exceeded")), lifecycleMs),
            setTimeout(() => this.admission.abort(new Error("Ingestion external admission closed")), Math.max(0, workMs - reserveMs)),
            setTimeout(() => this.work.abort(new Error("Ingestion work deadline exceeded")), workMs),
        ];
    }
    throwIfExpired(): void {
        if (Date.now() - this.startedAt >= this.workMs && !this.signal.aborted) this.work.abort(new Error("Ingestion work deadline exceeded"));
        throwIfAborted(this.signal);
    }
    canAdmit(): boolean { return Date.now() - this.startedAt < this.workMs - this.reserveMs && !this.signal.aborted && !this.admissionSignal.aborted; }
    dispose(): void { this.timers.forEach(clearTimeout); }
}
