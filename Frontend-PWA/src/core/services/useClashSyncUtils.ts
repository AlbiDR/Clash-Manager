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

/** Short recovery delay before the one bounded transient transport retry. */
export const SYNC_RETRY_DELAY_MS = 400;

const TRANSIENT_SYNC_FAILURE = /failed to fetch|network(?:\s+request)?(?:\s+error|\s+failed)?|load failed|\b408\b|\b429\b|\b50\d\b|bad gateway|service unavailable/i;
const UNDICI_TRANSIENT_FETCH_FAILURE = /\bfetch failed\b/i;

function isTransientSyncFailure(syncFailure: unknown): boolean {
  if (!(syncFailure instanceof Error)) return false;
  return TRANSIENT_SYNC_FAILURE.test(`${syncFailure.name} ${syncFailure.message}`)
    || (syncFailure.name === "TypeError" && UNDICI_TRANSIENT_FETCH_FAILURE.test(syncFailure.message));
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(finish, SYNC_RETRY_DELAY_MS);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function fetchRemoteWithTransientRetry(
  force: boolean,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    return await fetchRemote({ force, signal });
  } catch (firstFailure: unknown) {
    if (signal.aborted || !isTransientSyncFailure(firstFailure)) throw firstFailure;
    await waitForRetry(signal);
    return fetchRemote({ force, signal });
  }
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
