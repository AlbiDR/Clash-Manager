// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Attach an AbortSignal to a Supabase PostgREST query builder when supported.
 * The optional method shape keeps unit RPC mocks (plain promises) usable while
 * production builders receive the signal through supabase-js's abortSignal().
 */
export function withAbortSignal<T extends PromiseLike<unknown>>(
    query: T,
    signal?: AbortSignal,
): T {
    if (!signal) return query;

    const abortableQuery = query as T & {
        abortSignal?: (abortSignal: AbortSignal) => PromiseLike<unknown>;
    };
    if (typeof abortableQuery.abortSignal !== 'function') return query;

    return abortableQuery.abortSignal(signal) as T;
}

/** Throw the original abort reason, preserving typed cancellation errors. */
export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }
}

/** Wait between retries without keeping a cancelled invocation alive. */
export async function waitWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
    });
}
