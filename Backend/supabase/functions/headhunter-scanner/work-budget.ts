// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { SCANNER_CHECKPOINT_RESERVE_MS, SCANNER_WORK_BUDGET_MS } from '../_shared/config.ts';

export class ScannerWorkBudgetExceededError extends Error {
    constructor(budgetMs: number = SCANNER_WORK_BUDGET_MS) {
        super(`Head-hunter scanner work budget expired after ${budgetMs} ms`);
        this.name = 'ScannerWorkBudgetExceededError';
    }
}

export class ScannerAdmissionDeadlineExceededError extends Error {
    constructor() {
        super('Head-hunter scanner stopped external work to reserve its database checkpoint window');
        this.name = 'ScannerAdmissionDeadlineExceededError';
    }
}

/** One invocation-scoped hard deadline plus an earlier external-work cutoff. */
export class ScannerWorkBudget {
    private readonly controller = new AbortController();
    private readonly admissionController = new AbortController();
    private readonly hardTimer: ReturnType<typeof setTimeout>;
    private readonly admissionTimer: ReturnType<typeof setTimeout>;
    readonly signal = this.controller.signal;
    readonly admissionSignal = this.admissionController.signal;

    constructor(
        private readonly budgetMs: number = SCANNER_WORK_BUDGET_MS,
        private readonly checkpointReserveMs: number = SCANNER_CHECKPOINT_RESERVE_MS,
    ) {
        this.admissionTimer = setTimeout(() => {
            this.admissionController.abort(new ScannerAdmissionDeadlineExceededError());
        }, Math.max(0, this.budgetMs - this.checkpointReserveMs));
        this.hardTimer = setTimeout(() => {
            this.controller.abort(new ScannerWorkBudgetExceededError(this.budgetMs));
        }, this.budgetMs);
    }

    throwIfExpired(): void {
        if (this.signal.aborted) {
            throw this.signal.reason ?? new ScannerWorkBudgetExceededError(this.budgetMs);
        }
    }

    throwIfAdmissionClosed(): void {
        if (this.admissionSignal.aborted) {
            throw this.admissionSignal.reason ?? new ScannerAdmissionDeadlineExceededError();
        }
    }

    throwIfStopped(): void {
        this.throwIfExpired();
        this.throwIfAdmissionClosed();
    }

    dispose(): void {
        clearTimeout(this.admissionTimer);
        clearTimeout(this.hardTimer);
    }
}
