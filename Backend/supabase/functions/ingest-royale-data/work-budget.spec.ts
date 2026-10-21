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
});
