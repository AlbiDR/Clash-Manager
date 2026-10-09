// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, expect, it, vi } from 'vitest';
import { throwIfAborted, withAbortSignal } from '../abortSignal.ts';

describe('shared AbortSignal helpers', () => {
    it('attaches a signal to an abortable Supabase query builder', () => {
        const signal = new AbortController().signal;
        const request = {
            abortSignal: vi.fn(function (this: unknown) { return this; }),
            then: vi.fn(),
        };

        expect(withAbortSignal(request, signal)).toBe(request);
        expect(request.abortSignal).toHaveBeenCalledWith(signal);
    });

    it('preserves plain promise RPC mocks that do not expose abortSignal()', () => {
        const request = Promise.resolve({ data: null, error: null });

        expect(withAbortSignal(request, new AbortController().signal)).toBe(request);
    });

    it('throws the original cancellation reason', () => {
        const controller = new AbortController();
        const cancellation = new Error('budget expired');
        controller.abort(cancellation);

        expect(() => throwIfAborted(controller.signal)).toThrow(cancellation);
    });
});
