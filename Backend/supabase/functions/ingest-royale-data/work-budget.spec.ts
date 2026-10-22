// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestionWorkBudget } from "./work-budget.ts";

afterEach(() => vi.useRealTimers());

describe('ingestion invocation budget', () => {
    it('closes admission before writes, keeps lifecycle finalization available, and disposes all timers', async () => {
        vi.useFakeTimers();
        const budget = new IngestionWorkBudget(120, 30, 145);
        await vi.advanceTimersByTimeAsync(90);
        expect(budget.canAdmit()).toBe(false);
        expect(budget.signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(30);
        expect(() => budget.throwIfExpired()).toThrow('work deadline');
        expect(budget.lifecycleSignal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(25);
        expect(budget.lifecycleSignal.aborted).toBe(true);
        budget.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps simultaneous invocation signals independent', async () => {
        vi.useFakeTimers();
        const first = new IngestionWorkBudget(120, 30, 145);
        await vi.advanceTimersByTimeAsync(60);
        const second = new IngestionWorkBudget(120, 30, 145);
        await vi.advanceTimersByTimeAsync(60);
        expect(first.signal.aborted).toBe(true);
        expect(second.canAdmit()).toBe(true);
        first.dispose(); second.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts work signal and throws when clock elapsed time exceeds workMs before timer callback runs', () => {
        vi.useFakeTimers();
        const budget = new IngestionWorkBudget(100, 20, 150);
        expect(() => budget.throwIfExpired()).not.toThrow();
        expect(budget.signal.aborted).toBe(false);

        vi.setSystemTime(budget.startedAt + 100);
        expect(budget.signal.aborted).toBe(false); // Timer callback hasn't fired yet
        expect(() => budget.throwIfExpired()).toThrow('Ingestion work deadline exceeded');
        expect(budget.signal.aborted).toBe(true);
        expect((budget.signal.reason as Error).message).toBe('Ingestion work deadline exceeded');
        budget.dispose();
    });

    it('evaluates canAdmit dynamically based on elapsed wall-clock time and abort signals', () => {
        vi.useFakeTimers();
        const budget = new IngestionWorkBudget(100, 20, 150);
        expect(budget.canAdmit()).toBe(true);

        vi.setSystemTime(budget.startedAt + 80);
        expect(budget.canAdmit()).toBe(false);

        budget.dispose();
    });

    it('handles reserveMs >= workMs by closing admission immediately', async () => {
        vi.useFakeTimers();
        const budget = new IngestionWorkBudget(100, 120, 150);
        await vi.advanceTimersByTimeAsync(0);
        expect(budget.canAdmit()).toBe(false);
        expect(budget.signal.aborted).toBe(false);
        budget.dispose();
    });

    it('cancels all scheduled timers on dispose and prevents post-disposal aborts', async () => {
        vi.useFakeTimers();
        const budget = new IngestionWorkBudget(100, 20, 150);
        budget.dispose();
        expect(vi.getTimerCount()).toBe(0);

        await vi.advanceTimersByTimeAsync(200);
        expect(budget.admissionSignal.aborted).toBe(false);
        expect(budget.signal.aborted).toBe(false);
        expect(budget.lifecycleSignal.aborted).toBe(false);
    });

    it('attaches explicit abort error reasons to admission, work, and lifecycle signals', async () => {
        vi.useFakeTimers();
        const budget = new IngestionWorkBudget(100, 20, 150);

        await vi.advanceTimersByTimeAsync(80);
        expect(budget.admissionSignal.aborted).toBe(true);
        expect((budget.admissionSignal.reason as Error).message).toBe('Ingestion external admission closed');

        await vi.advanceTimersByTimeAsync(20);
        expect(budget.signal.aborted).toBe(true);
        expect((budget.signal.reason as Error).message).toBe('Ingestion work deadline exceeded');

        await vi.advanceTimersByTimeAsync(50);
        expect(budget.lifecycleSignal.aborted).toBe(true);
        expect((budget.lifecycleSignal.reason as Error).message).toBe('Ingestion lifecycle deadline exceeded');

        budget.dispose();
    });
});
