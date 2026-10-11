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

    it('returns query unchanged when signal is undefined', () => {
        const request = { then: vi.fn() };
        expect(withAbortSignal(request, undefined)).toBe(request);
    });

    it('returns query unchanged when abortSignal property is not a function', () => {
        const signal = new AbortController().signal;
        const request = { abortSignal: 'invalid-method', then: vi.fn() };
        expect(withAbortSignal(request as any, signal)).toBe(request);
    });

    it('preserves plain promise RPC mocks that do not expose abortSignal()', () => {
        const request = Promise.resolve({ data: null, error: null });

        expect(withAbortSignal(request, new AbortController().signal)).toBe(request);
    });

    it('does nothing when throwIfAborted is called with undefined signal', () => {
        expect(() => throwIfAborted(undefined)).not.toThrow();
    });

    it('does nothing when throwIfAborted is called with an active (unaborted) signal', () => {
        const controller = new AbortController();
        expect(() => throwIfAborted(controller.signal)).not.toThrow();
    });

    it('throws standard fallback DOMException when signal.aborted is true but reason is undefined', () => {
        const mockSignal = { aborted: true, reason: undefined } as unknown as AbortSignal;

        let caughtError: unknown;
        try {
            throwIfAborted(mockSignal);
        } catch (err) {
            caughtError = err;
        }

        expect(caughtError).toBeInstanceOf(DOMException);
        expect((caughtError as DOMException).name).toBe('AbortError');
        expect((caughtError as DOMException).message).toBe('The operation was aborted.');
    });

    it('throws the original cancellation reason when signal is aborted with reason', () => {
        const controller = new AbortController();
        const cancellation = new Error('budget expired');
        controller.abort(cancellation);

        expect(() => throwIfAborted(controller.signal)).toThrow(cancellation);
    });
});
