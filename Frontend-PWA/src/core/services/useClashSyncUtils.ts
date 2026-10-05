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
      fetchRemote({ force: options.force, signal: requestController.signal }),
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
