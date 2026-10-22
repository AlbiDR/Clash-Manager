// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Attaches an AbortSignal to a Supabase PostgREST query builder when supported.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Utility (@shared)
 * - **Role:** Cancellation propagation bridge between PostgREST queries and Edge Function lifecycles.
 * - **Flexibility:** The optional `abortSignal` method shape allows unit RPC mocks (plain promises)
 *   to remain functional while production Supabase query builders receive the signal.
 *
 * @param query - The PostgREST query builder or promise-like object.
 * @param signal - Optional `AbortSignal` used to cancel the pending HTTP query.
 * @returns The original query decorated with the signal if supported, or unmodified.
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

/**
 * Throws the original abort reason if the signal is aborted, preserving typed cancellation errors.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Utility (@shared)
 * - **Role:** Immediate execution guard against stale or aborted workers.
 *
 * [DECISION LOG] Fallback to standard DOMException('The operation was aborted.', 'AbortError')
 * when `signal.reason` is undefined to maintain standard DOM error handling semantics.
 *
 * @param signal - Optional `AbortSignal` to evaluate for abortion status.
 * @throws DOMException or `signal.reason` if the signal is aborted.
 */
export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }
}

/**
 * Delays execution for a specified duration while remaining responsive to abort cancellation signals.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Utility (@shared)
 * - **Role:** Abortable asynchronous delay utility for retry backoffs and throttling loops.
 *
 * [THREAT:] Uncancellable delay loops can keep terminated Edge Function worker contexts alive,
 * exhausting worker execution limits or leaking memory.
 * [DECISION LOG] Registers an `abort` listener on the signal that clears the timer immediately
 * and rejects the promise, ensuring immediate cleanup upon task cancellation.
 *
 * @param delayMs - Time to wait in milliseconds.
 * @param signal - Optional `AbortSignal` to trigger early abort.
 * @returns A promise that resolves after `delayMs` or rejects immediately if aborted.
 */
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
