// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { fetchRemote } from "../api/SupabaseClient";
import type { WebAppData } from "../types";

/**
 * Timeout in milliseconds for remote sync network fetch operations (25 seconds).
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** ADR Section IV (Resilience). Prevents hanging network requests.
 */
// Keep this aligned with the API handshake budget. A Supabase project can be
// reachable yet need more than fifteen seconds to wake a cold data path; the
// old shorter sync budget therefore converted recoverable cold starts into
// misleading foreground failures.
export const SYNC_REQUEST_TIMEOUT_MS = 25_000;

/**
 * Backoff delays (ms) for the bounded transient transport retry sequence.
 *
 * @remarks
 * [FIX] STORM-LENGTH CONTENTION: a single 400ms retry recovers an isolated
 * blip, but free-tier resource contention sometimes runs as a multi-second
 * storm (observed: 8 statement-timeouts across ~27s in one burst). Three
 * escalating attempts give a request landing at the start of a storm a real
 * chance to land again once it clears, while the total (400+2000+5000=7.4s
 * of waiting, plus request time) stays well inside SYNC_REQUEST_TIMEOUT_MS.
 */
export const SYNC_RETRY_DELAYS_MS = [400, 2_000, 5_000];

// [FIX] STATEMENT TIMEOUT: the free-tier backend occasionally can't service
// even a fast, healthy query within Postgres's own statement_timeout during
// brief resource contention -- the query itself normally completes in well
// under a second. That surfaces as "canceling statement due to statement
// timeout", not any of the transport-level patterns below, so it fell
// through as a hard failure with zero retry. It is exactly as transient as
// the other entries here.
// [THREAT:] Free-tier resource contention or transient transport disruptions causing intermittent fetch failures.
// [DECISION LOG] Categorize transient network and statement-timeout failures using broad regex patterns
// so the transient retry loop can safely recover without throwing unnecessary foreground sync errors.
const TRANSIENT_SYNC_FAILURE = /failed to fetch|network(?:\s+request)?(?:\s+error|\s+failed)?|load failed|\b408\b|\b429\b|\b50\d\b|bad gateway|service unavailable|statement timeout/i;
const UNDICI_TRANSIENT_FETCH_FAILURE = /\bfetch failed\b/i;

/**
 * Checks whether an error represents a recoverable transient transport failure.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** Satisfies ADR Section IV: Resilience. Differentiates transient network/timeout error signatures from hard authorization or schema validation failures.
 *
 * @param syncFailure - The caught exception or rejection reason.
 * @returns True if the failure is classified as transient and eligible for backoff retry.
 */
function isTransientSyncFailure(syncFailure: unknown): boolean {
  if (!(syncFailure instanceof Error)) return false;
  return TRANSIENT_SYNC_FAILURE.test(`${syncFailure.name} ${syncFailure.message}`)
    || (syncFailure.name === "TypeError" && UNDICI_TRANSIENT_FETCH_FAILURE.test(syncFailure.message));
}

/**
 * Delays execution for a backoff duration while listening for caller abort signals.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** Satisfies ADR Section IV: Resilience. Attaches one-time event listeners on the AbortSignal to immediately cancel retry delays when requested.
 *
 * @param signal - AbortSignalAuthority used for cancellation.
 * @param delayMs - Time in milliseconds to wait before resolving.
 * @returns A promise that resolves when delayMs elapses or rejects when signal aborts.
 */
function waitForRetry(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const finish = () => {
      // [DECISION LOG] Explicitly detach abort listener upon completion to prevent listener memory leaks.
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    // [THREAT:] Unbounded event listener accumulation during repeated retry cycles.
    // [DECISION LOG] Use once: true to automatically cleanup abort listener if invoked before timeout.
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Executes remote fetch with bounded transient retry backoff attempts.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** Satisfies ADR Section IV: Resilience. Executes up to 3 retry attempts over escalations [400ms, 2000ms, 5000ms].
 *
 * @param force - If true, requests cache bypass at the Supabase transport layer.
 * @param signal - AbortSignal authority for request cancellation.
 * @returns Raw payload from fetchRemote on success.
 * @throws The last encountered failure if retries exhaust or non-transient error occurs.
 */
async function fetchRemoteWithTransientRetry(
  force: boolean,
  signal: AbortSignal,
): Promise<unknown> {
  let lastFailure: unknown;
  for (let attempt = 0; attempt <= SYNC_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetchRemote({ force, signal });
    } catch (failure: unknown) {
      lastFailure = failure;
      const delayMs = SYNC_RETRY_DELAYS_MS[attempt];
      // [THREAT:] Retrying non-transient errors (e.g. 401 Unauthorized or schema mismatches) wastes request budget.
      // [DECISION LOG] Immediately rethrow if signal is aborted, delay is undefined, or error is non-transient.
      if (signal.aborted || delayMs === undefined || !isTransientSyncFailure(failure)) throw failure;
      await waitForRetry(signal, delayMs);
    }
  }
  throw lastFailure;
}

/**
 * Initializes a default, empty WebAppData state object.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** ADR Section I (Core Services). Provides null-safe factory for initial WebAppData.
 *
 * @returns An empty WebAppData DTO matching structural schema constraints.
 */
export function createEmptyWebAppData(): WebAppData {
  return {
    lb: [],
    hh: [],
    timestamp: 0,
    blacklist: [],
  };
}

/**
 * Fetches remote data from Supabase bounded by an explicit request timeout.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** ADR Section I (Core Services) & ADR Section IV (Resilience).
 *   Enforces bounded execution time on remote queries.
 *
 * @param options - Transport parameters including force refresh flag.
 * @param options.force - If true, requests cache bypass at the Supabase transport layer.
 * @returns Unvalidated raw payload resolved from Supabase fetch.
 * @throws Error if network request fails or exceeds SYNC_REQUEST_TIMEOUT_MS.
 */
export async function fetchRemoteWithTimeout(options: {
  force: boolean;
  signal?: AbortSignal;
}): Promise<unknown> {
  const requestController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortFromCaller = () => {
    requestController.abort(options.signal?.reason);
  };
  try {
    if (options.signal?.aborted) {
      abortFromCaller();
    } else {
      options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    // [THREAT:] Unbounded network requests can cause UI hanging or memory leaks.
    // [DECISION LOG] Race network fetch against a SYNC_REQUEST_TIMEOUT_MS timeout timer
    // and explicitly signal cancellation via AbortController on timeout trigger.
    return await Promise.race([
      fetchRemoteWithTransientRetry(options.force, requestController.signal),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error("Sync timed out");
          reject(timeoutError);
          requestController.abort(timeoutError);
        }, SYNC_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * Safely coercively normalizes unknown sync thrown errors to Error instances.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service Utility (@core).
 * - **Satisfaction:** ADR Section IV (Resilience). Ensures typed Error instances for caller error handling.
 *
 * @param syncFailure - Raw caught error or rejection reason.
 * @returns Normalized Error object.
 */
export function normalizeSyncError(syncFailure: unknown): Error {
  return syncFailure instanceof Error ? syncFailure : new Error("Sync failed");
}
