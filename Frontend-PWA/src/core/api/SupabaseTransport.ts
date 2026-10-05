// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** One stalled read must leave time for another attempt within the sync's 25s budget. */
export const SUPABASE_READ_TIMEOUT_MS = 8_000;
export const SUPABASE_READ_RETRY_DELAYS_MS = [400, 2_000, 5_000] as const;

const RETRYABLE_READ_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const BODYLESS_STATUS = new Set([204, 205, 304]);
const TRANSIENT_TRANSPORT_FAILURE = /failed to fetch|fetch failed|network|load failed|timed out/i;

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
 * are never replayed: losing their response does not mean the write failed.
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

  for (let attempt = 0; ; attempt++) {
    request.signal.throwIfAborted();
    const delayMs = SUPABASE_READ_RETRY_DELAYS_MS[attempt];
    try {
      const response = await fetchBoundedRead(request);
      if (!RETRYABLE_READ_STATUS.has(response.status) || delayMs === undefined) return response;
    } catch (failure) {
      if (request.signal.aborted || delayMs === undefined
        || !(failure instanceof Error) || !TRANSIENT_TRANSPORT_FAILURE.test(failure.message)) throw failure;
    }
    await waitForReadRetry(request.signal, delayMs!);
  }
}
