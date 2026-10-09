// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { fetchRemote } from "../api/SupabaseClient";
import { FOREGROUND_POLL_INTERVAL, SOURCE_STALENESS_THRESHOLD } from "../config";
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
 * @param options.knownBlacklist - Blacklist of the last successful sync, used if this
 *   sync's blacklist read fails.
 * @returns Unvalidated raw payload resolved from Supabase fetch.
 * @throws Error if network request fails or exceeds SYNC_REQUEST_TIMEOUT_MS.
 */
export async function fetchRemoteWithTimeout(options: {
  force: boolean;
  signal?: AbortSignal;
  knownBlacklist?: readonly string[];
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
      fetchRemote({
        force: options.force,
        signal: requestController.signal,
        knownBlacklist: options.knownBlacklist,
      }),
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

/**
 * Most background sync requests that one attempt may stand for while backing off.
 *
 * @remarks
 * A backed-off client still looks once per source staleness window, so a backend
 * that recovers is noticed before the data it shows would be called stale.
 */
const BACKGROUND_BACKOFF_SPAN_LIMIT = Math.floor(SOURCE_STALENESS_THRESHOLD / FOREGROUND_POLL_INTERVAL);

/**
 * Gets how many background sync requests one attempt stands for after consecutive failures.
 *
 * @remarks
 * [DECISION LOG] THE POLL BACKS OFF ON FAILURE EVENTS, NOT A TIMER
 * A fixed poll kept sending a full sync every interval at a database that was
 * already timing out. Each consecutive failure doubles the number of background
 * requests one attempt stands for, so the foreground poll spaces out by whole
 * poll intervals, and the first success returns it to every request.
 *
 * @param failureCount - Consecutive failed sync attempts.
 * @returns Background requests per attempt; 1 when the last attempt succeeded.
 */
export function getBackgroundBackoffSpan(failureCount: number): number {
  return Math.min(2 ** failureCount, BACKGROUND_BACKOFF_SPAN_LIMIT);
}

/**
 * Failure classes recognised in a transport error, and the copy shown for each.
 *
 * @remarks
 * [DECISION LOG] TRANSLATED AT THE BOUNDARY, NOT RENDERED RAW:
 * The raw exception message went straight into the user-facing error headline,
 * so a sync failure showed the operator strings like "TypeError: Failed to
 * fetch" or "JWT expired" as though they were an explanation. None of those
 * tells anyone what happened or what to do about it.
 *
 * Matching is on the message text because the errors arrive from several
 * layers (fetch, Supabase, valibot) with no common typed shape. The order
 * matters: the first match wins, so the more specific patterns are listed
 * first.
 */
export const SYNC_FAILURE_COPY: readonly { pattern: RegExp; headline: string }[] = [
  { pattern: /network connection lost|offline/i, headline: "No network connection" },
  { pattern: /abort|timeout|timed out/i, headline: "The server took too long to answer" },
  { pattern: /jwt|401|403|unauthor|apikey|invalid api key/i, headline: "The app is not authorised to read this data" },
  { pattern: /50\d|internal server|bad gateway|unavailable/i, headline: "The server could not answer right now" },
  { pattern: /failed to fetch|network\s*error|network request failed|load failed/i, headline: "Could not reach the server" },
  { pattern: /unconfigured|no api url|not configured/i, headline: "No backend is configured yet" },
  { pattern: /validation|invalid type|expected/i, headline: "The server sent data this app could not read" },
];

/** Fallback headline when the failure matches no known class. */
export const SYNC_FAILURE_FALLBACK = "The clan data could not be refreshed";

/**
 * Converts a transport error into copy addressed to the operator.
 *
 * @param error - The error raised by the sync attempt.
 * @returns A short human-readable headline.
 */
export function describeSyncFailure(error: Error): string {
  const raw = `${error.name} ${error.message}`;
  return SYNC_FAILURE_COPY.find(({ pattern }) => pattern.test(raw))?.headline
    ?? SYNC_FAILURE_FALLBACK;
}

export function classifySyncFailure(error: Error, online: boolean) {
  const rawFailure = `${error.name} ${error.message}`;
  if (!online || /offline|network connection lost|failed to fetch|fetch failed|network\s*error|load failed/i.test(rawFailure)) {
    return "OFFLINE" as const;
  }
  if (/abort|timeout|timed out/i.test(rawFailure)) return "TIMEOUT" as const;
  if (/jwt|401|403|unauthor|apikey|invalid api key/i.test(rawFailure)) return "AUTH" as const;
  if (/validation|invalid type|expected|payload was not an array/i.test(rawFailure)) return "VALIDATION" as const;
  return "OFFLINE" as const;
}
