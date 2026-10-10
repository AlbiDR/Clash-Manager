// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ScannerWorkBudget,
    ScannerWorkBudgetExceededError,
    ScannerAdmissionDeadlineExceededError
} from './work-budget.ts';
import { SCANNER_CHECKPOINT_RESERVE_MS, SCANNER_WORK_BUDGET_MS } from '../_shared/config.ts';

describe('ScannerWorkBudget', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Custom Errors', () => {
        it('ScannerWorkBudgetExceededError formats default message and sets name', () => {
            const err = new ScannerWorkBudgetExceededError();
            expect(err.name).toBe('ScannerWorkBudgetExceededError');
            expect(err.message).toBe(`Head-hunter scanner work budget expired after ${SCANNER_WORK_BUDGET_MS} ms`);
        });

        it('ScannerWorkBudgetExceededError respects custom budgetMs in message', () => {
            const err = new ScannerWorkBudgetExceededError(5000);
            expect(err.message).toBe('Head-hunter scanner work budget expired after 5000 ms');
        });

        it('ScannerAdmissionDeadlineExceededError formats message and sets name', () => {
            const err = new ScannerAdmissionDeadlineExceededError();
            expect(err.name).toBe('ScannerAdmissionDeadlineExceededError');
            expect(err.message).toBe('Head-hunter scanner stopped external work to reserve its database checkpoint window');
        });
    });

    describe('Constructor & Signals Initialization', () => {
        it('initializes non-aborted signals by default', () => {
            const budget = new ScannerWorkBudget(1000, 200);
            expect(budget.signal.aborted).toBe(false);
            expect(budget.admissionSignal.aborted).toBe(false);
            expect(() => budget.throwIfExpired()).not.toThrow();
            expect(() => budget.throwIfAdmissionClosed()).not.toThrow();
            expect(() => budget.throwIfStopped()).not.toThrow();
            budget.dispose();
        });

        it('handles non-positive cutoff window gracefully without underflow', () => {
            // When budgetMs <= checkpointReserveMs, admission cutoff fires at 0 ms
            const budget = new ScannerWorkBudget(100, 200);
            expect(budget.admissionSignal.aborted).toBe(false);
            vi.advanceTimersByTime(0);
            expect(budget.admissionSignal.aborted).toBe(true);
            expect(() => budget.throwIfAdmissionClosed()).toThrow(ScannerAdmissionDeadlineExceededError);
            budget.dispose();
        });
    });

    describe('Admission Cutoff & Work Budget Expiration', () => {
        it('aborts admissionSignal when admission cutoff time is reached', () => {
            const budgetMs = 1000;
            const checkpointReserveMs = 300;
            const admissionCutoff = budgetMs - checkpointReserveMs; // 700 ms

            const budget = new ScannerWorkBudget(budgetMs, checkpointReserveMs);

            vi.advanceTimersByTime(admissionCutoff - 1);
            expect(budget.admissionSignal.aborted).toBe(false);
            expect(budget.signal.aborted).toBe(false);

            vi.advanceTimersByTime(1);
            expect(budget.admissionSignal.aborted).toBe(true);
            expect(budget.signal.aborted).toBe(false);

            expect(() => budget.throwIfAdmissionClosed()).toThrow(ScannerAdmissionDeadlineExceededError);
            expect(() => budget.throwIfExpired()).not.toThrow();

            budget.dispose();
        });

        it('aborts signal when total budgetMs is reached', () => {
            const budgetMs = 1000;
            const checkpointReserveMs = 300;

            const budget = new ScannerWorkBudget(budgetMs, checkpointReserveMs);

            vi.advanceTimersByTime(budgetMs - 1);
            expect(budget.signal.aborted).toBe(false);

            vi.advanceTimersByTime(1);
            expect(budget.signal.aborted).toBe(true);

            expect(() => budget.throwIfExpired()).toThrow(ScannerWorkBudgetExceededError);

            budget.dispose();
        });

        it('throwIfStopped checks expired first, then admission closed', () => {
            const budgetMs = 1000;
            const checkpointReserveMs = 300;

            const budget = new ScannerWorkBudget(budgetMs, checkpointReserveMs);

            // 1. Before cutoff
            expect(() => budget.throwIfStopped()).not.toThrow();

            // 2. After admission cutoff but before total budget expiration
            vi.advanceTimersByTime(700);
            expect(() => budget.throwIfStopped()).toThrow(ScannerAdmissionDeadlineExceededError);

            // 3. After total budget expiration -> throwIfExpired runs first and throws ScannerWorkBudgetExceededError
            vi.advanceTimersByTime(300);
            expect(() => budget.throwIfStopped()).toThrow(ScannerWorkBudgetExceededError);

            budget.dispose();
        });
    });

    describe('Dispose', () => {
        it('clears pending timers and prevents subsequent aborts', () => {
            const budget = new ScannerWorkBudget(1000, 300);

            budget.dispose();

            vi.advanceTimersByTime(2000);

            expect(budget.admissionSignal.aborted).toBe(false);
            expect(budget.signal.aborted).toBe(false);
            expect(() => budget.throwIfStopped()).not.toThrow();
        });
    });
});
