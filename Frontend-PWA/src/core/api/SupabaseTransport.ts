// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/** One stalled read must leave time for another attempt within the sync's 25s budget. */
export const SUPABASE_READ_TIMEOUT_MS = 8_000;

/** Retries after a read's first attempt: the length of the fixed schedule this replaced. */
export const SUPABASE_READ_RETRY_LIMIT = 3;

/**
 * Upper bound of the first retry's wait.
 *
 * @remarks
 * [DECISION LOG] JITTERED EXPONENTIAL BACKOFF, SCALED TO THE READ TIMEOUT
 * The fixed 400/2000/5000 ms schedule sent every client that failed together
 * back at the same instant, which is the moment a recovering database can least
 * afford. Each retry now waits a uniformly random time inside a window that
 * doubles per retry. The base is the read timeout halved once per retry, so the
 * windows of every retry together stay shorter than one read is allowed to take.
 */
export const SUPABASE_READ_BACKOFF_BASE_MS = SUPABASE_READ_TIMEOUT_MS / 2 ** SUPABASE_READ_RETRY_LIMIT;

/**
 * SQLSTATE query_canceled: the server's statement_timeout ended the read.
 *
 * @remarks
 * [DECISION LOG] A TIMED-OUT READ IS NEVER RETRIED
 * The server cancels a statement only after spending its whole statement
 * budget on it. Retrying runs the same expensive read again on an instance
 * that has just proved it cannot finish it, so one sync used to execute it up
 * to four times and feed the stall it was waiting out. Detected by the
 * PostgREST error code, whatever HTTP status the gateway maps it to.
 */
const STATEMENT_TIMEOUT_SQLSTATE = "57014";

const RETRYABLE_READ_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const BODYLESS_STATUS = new Set([204, 205, 304]);
const TRANSIENT_TRANSPORT_FAILURE = /failed to fetch|fetch failed|network|load failed|timed out/i;
const PostgrestErrorSchema = v.object({ code: v.string() });

/**
 * Draws the wait before a retry from its backoff window (full jitter).
 *
 * @param retryIndex - Zero-based index of the retry about to be made.
 * @returns Milliseconds to wait, in [0, SUPABASE_READ_BACKOFF_BASE_MS * 2^retryIndex).
 */
export function getRetryDelayMs(retryIndex: number): number {
  return Math.random() * SUPABASE_READ_BACKOFF_BASE_MS * 2 ** retryIndex;
}

/**
 * Reads the PostgREST error code from a buffered response, if it carries one.
 *
 * @param response - A response whose body has already been read into memory.
 * @returns The error code, or null when the body is not a PostgREST error.
 */
async function getPostgrestErrorCode(response: Response): Promise<string | null> {
  try {
    const errorValidation = v.safeParse(PostgrestErrorSchema, await response.clone().json());
    return errorValidation.success ? errorValidation.output.code : null;
  } catch {
    return null;
  }
}

async function waitForReadRetry(signal: AbortSignal | null, delayMs: number): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Bound each HTTP read, including its body, and immediately respect caller cancellation. */
async function fetchBoundedRead(request: Request): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortFromCaller: () => void = () => {};
  try {
    return await Promise.race([
      (async () => {
        request.signal.throwIfAborted();
        const response = await fetch(request, { signal: controller.signal });
        // PostgREST consumes the body after fetch resolves. Keep it in the same
        // deadline so a stalled body cannot bypass the transport timeout.
        const body = await response.arrayBuffer();
        return new Response(BODYLESS_STATUS.has(response.status) ? null : body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      })(),
      new Promise<never>((_, reject) => {
        abortFromCaller = () => {
          controller.abort(request.signal.reason);
          reject(request.signal.reason);
        };
        if (request.signal.aborted) abortFromCaller();
        else request.signal.addEventListener("abort", abortFromCaller, { once: true });
        timer = setTimeout(() => {
          const failure = new Error("Database read timed out");
          controller.abort(failure);
          reject(failure);
        }, SUPABASE_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * Fresh Supabase transport. Retry individual idempotent REST reads so a failing
 * roster does not repeatedly download healthy recruits and metadata. Mutations
 * are never replayed: losing their response does not mean the write failed,
 * and neither are reads the server cancelled for its statement timeout.
 */
export async function fetchSupabaseFresh(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const request = new Request(input, { ...init, cache: "no-store" });
  request.headers.set("Cache-Control", "no-cache");
  request.headers.set("Pragma", "no-cache");

  if (request.method !== "GET" || !new URL(request.url).pathname.startsWith("/rest/v1/")) {
    return fetch(request);
  }

  for (let retryIndex = 0; ; retryIndex++) {
    request.signal.throwIfAborted();
    const retriesRemain = retryIndex < SUPABASE_READ_RETRY_LIMIT;
    try {
      const response = await fetchBoundedRead(request);
      if (!retriesRemain || !RETRYABLE_READ_STATUS.has(response.status)
        || await getPostgrestErrorCode(response) === STATEMENT_TIMEOUT_SQLSTATE) return response;
    } catch (failure) {
      if (request.signal.aborted || !retriesRemain
        || !(failure instanceof Error) || !TRANSIENT_TRANSPORT_FAILURE.test(failure.message)) throw failure;
    }
    await waitForReadRetry(request.signal, getRetryDelayMs(retryIndex));
  }
}
