// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import {
    INGESTION_WORK_BUDGET_MS,
    INGESTION_CHECKPOINT_RESERVE_MS,
    INGESTION_LIFECYCLE_BUDGET_MS,
} from "../_shared/config.ts";
import { throwIfAborted } from "../_shared/abortSignal.ts";

/**
 * Invocation-wide I/O work budget manager for the `ingest-royale-data` Edge Function.
 *
 * Manages multi-stage execution deadlines, external stage admission bounds,
 * and lifecycle timeouts to guarantee clean write flushes before execution termination.
 *
 * @remarks
 * Satisfies ADR Section IV: Timeout Bounds & Failure Isolation. Enforces strict
 * time budgets across multi-stage ingestion tasks to prevent dangling DB transactions
 * and unhandled edge gateway terminations.
 */
export class IngestionWorkBudget {
    private readonly lifecycle = new AbortController();

    /** AbortSignal triggered when the entire invocation lifecycle budget expires. */
    readonly lifecycleSignal: AbortSignal = this.lifecycle.signal;

    private readonly work = new AbortController();
    private readonly admission = new AbortController();
    private readonly timers: ReturnType<typeof setTimeout>[];

    /** AbortSignal triggered when the active ingestion work budget expires. */
    readonly signal: AbortSignal = this.work.signal;

    /** AbortSignal triggered when external stage admission closes (checkpoint reserve window). */
    readonly admissionSignal: AbortSignal = this.admission.signal;

    /** Timestamp (ms) recorded at instance construction. */
    readonly startedAt: number = Date.now();

    /**
     * Initializes an invocation work budget controller.
     *
     * @param workMs - Active work budget window in milliseconds (default: `INGESTION_WORK_BUDGET_MS`).
     * @param reserveMs - Reserved checkpoint window for flushing writes in milliseconds (default: `INGESTION_CHECKPOINT_RESERVE_MS`).
     * @param lifecycleMs - Maximum overall invocation lifecycle window in milliseconds (default: `INGESTION_LIFECYCLE_BUDGET_MS`).
     */
    constructor(
        private readonly workMs = INGESTION_WORK_BUDGET_MS,
        private readonly reserveMs = INGESTION_CHECKPOINT_RESERVE_MS,
        lifecycleMs = INGESTION_LIFECYCLE_BUDGET_MS,
    ) {
        // [THREAT:] Unbounded edge function execution can lead to unhandled 504 gateway timeouts.
        // [DECISION LOG] Schedule tiered timeout controllers: lifecycle, admission closure, and work deadline.
        this.timers = [
            setTimeout(
                () => this.lifecycle.abort(new Error("Ingestion lifecycle deadline exceeded")),
                lifecycleMs,
            ),
            setTimeout(
                () => this.admission.abort(new Error("Ingestion external admission closed")),
                Math.max(0, workMs - reserveMs),
            ),
            setTimeout(
                () => this.work.abort(new Error("Ingestion work deadline exceeded")),
                workMs,
            ),
        ];
    }

    /**
     * Verifies if the active work budget has expired and throws if aborted.
     *
     * @remarks
     * Side Effects: Aborts `this.work` controller if elapsed time exceeds `workMs`.
     * @throws {DOMException|Error} Throws the abort cause error if the work signal is aborted.
     */
    throwIfExpired(): void {
        // [DECISION LOG] Explicitly abort the work signal when wall-clock time exceeds budget limit before checking signal status.
        if (Date.now() - this.startedAt >= this.workMs && !this.signal.aborted) {
            this.work.abort(new Error("Ingestion work deadline exceeded"));
        }
        throwIfAborted(this.signal);
    }

    /**
     * Evaluates whether a new pipeline stage can be admitted within the remaining time window.
     *
     * @returns `true` if sufficient time remains before reserve threshold and no abort signal is set; `false` otherwise.
     */
    canAdmit(): boolean {
        // [DECISION LOG] Refuse stage admission if elapsed time breaches the work budget minus reserve window, or if any signal is aborted.
        return (
            Date.now() - this.startedAt < this.workMs - this.reserveMs &&
            !this.signal.aborted &&
            !this.admissionSignal.aborted
        );
    }

    /**
     * Clears all active timeout handles to prevent memory leaks and dangling timer callbacks.
     *
     * @remarks
     * Side Effects: Invokes `clearTimeout` for every scheduled timer in `this.timers`.
     */
    dispose(): void {
        this.timers.forEach(clearTimeout);
    }
}
