// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { fetchRemote } from "../api/SupabaseClient";
import type { WebAppData } from "../types";

/** Timeout in milliseconds for remote sync network fetch operations. */
export const SYNC_REQUEST_TIMEOUT_MS = 15000;

/**
 * Initializes a default, empty WebAppData state object.
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
 * Satisfies ADR Section I (Core Services) network resilience guidelines.
 *
 * @param options - Transport parameters including force refresh flag.
 * @returns Unvalidated raw payload resolved from Supabase fetch.
 * @throws Error if network request fails or exceeds SYNC_REQUEST_TIMEOUT_MS.
 */
export async function fetchRemoteWithTimeout(options: { force: boolean }): Promise<unknown> {
  const requestController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    // [THREAT:] Unbounded network requests can cause UI hanging or memory leaks.
    // [DECISION LOG] Race network fetch against a SYNC_REQUEST_TIMEOUT_MS timeout timer
    // and explicitly signal cancellation via AbortController on timeout trigger.
    return await Promise.race([
      fetchRemote({ ...options, signal: requestController.signal }),
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
  }
}

/**
 * Safely coercively normalizes unknown sync thrown errors to Error instances.
 *
 * @param syncFailure - Raw caught error or rejection reason.
 * @returns Normalized Error object.
 */
export function normalizeSyncError(syncFailure: unknown): Error {
  return syncFailure instanceof Error ? syncFailure : new Error("Sync failed");
}
