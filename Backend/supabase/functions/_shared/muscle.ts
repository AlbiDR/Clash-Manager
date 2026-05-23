// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import pLimit from "npm:p-limit";

/**
 * L1 Core: Native Muscle Engine
 * High-concurrency batch processor for Supabase Edge Functions.
 * Replaces the legacy Render backend worker.
 */

const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_MULTIPLIER_MS = 500;
const BACKOFF_EXPONENT_BASE = 2;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_SERVER_ERROR_MAX = 599;
const ARRAY_LAST_INDEX_OFFSET = 1;
const INITIAL_INDEX = 0;

/**
 * Lazily resolves API keys on every invocation so that keys loaded from the
 * Vault after cold-start are always picked up. The top-level IIFE approach
 * captured an empty array before syncVault() had a chance to run.
 *
 * [DECISION LOG] Keys must never be frozen at module-init time because Edge
 * Function cold-starts execute module-level code before the request handler
 * runs syncVault(). Reading Deno.env inside fetchWithRotation ensures the
 * post-Vault value is always used.
 */
function getKeys(): string[] {
  const rawArgs = Deno.env.get("ROYALE_API_KEYS") || "";
  try {
    const parsed = JSON.parse(rawArgs);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return rawArgs.split(",").map((k: string) => k.trim()).filter(Boolean);
  }
}

console.log(`[Native-Muscle] Key Farm online. Keys will be resolved lazily per request.`);


/**
 * Executes an HTTP GET request with automatic key rotation and IP-bypass proxying.
 */
export async function fetchWithRotation(endpoint: string, maxRetries: number = DEFAULT_MAX_RETRIES): Promise<Response> {
  const keys = getKeys();
  const startIndex = Math.floor(Math.random() * keys.length);
  
  for (let i = INITIAL_INDEX; i < keys.length; i++) {
    const targetIndex = (startIndex + i) % keys.length;
    let key = keys[targetIndex].trim().replace(/^"|"$/g, "");
    
    let attempt = INITIAL_INDEX;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(`https://proxy.royaleapi.dev/v1${endpoint}`, {
          headers: { 
            Authorization: `Bearer ${key}`,
            "Accept": "application/json"
          }
        });
        
        if (res.status === HTTP_STATUS_FORBIDDEN || res.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
          console.warn(`[Native-Muscle] Key [${targetIndex}] throttled/forbidden (${res.status}). Rotating to next...`);
          break; // Break inner loop to rotate key
        }

        if (res.status >= HTTP_SERVER_ERROR_MIN && res.status <= HTTP_SERVER_ERROR_MAX) {
          if (attempt === maxRetries) break; // Exhausted retries, rotate key just in case
          console.warn(`[Native-Muscle] API Error (${res.status}) on key [${targetIndex}]. Retrying ${attempt + 1}/${maxRetries}...`);
          attempt++;
          const backoffMs = Math.pow(BACKOFF_EXPONENT_BASE, attempt) * BACKOFF_MULTIPLIER_MS;
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        
        return res;
      } catch (fetchError: unknown) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.warn(`[Native-Muscle] Fetch failed for key [${targetIndex}]: ${errorMessage}`);
        if (attempt === maxRetries) {
          if (i === keys.length - ARRAY_LAST_INDEX_OFFSET) throw fetchError;
          break; // Break inner loop to rotate key
        }
        attempt++;
        const backoffMs = Math.pow(BACKOFF_EXPONENT_BASE, attempt) * BACKOFF_MULTIPLIER_MS;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  
  throw new Error(`[Native-Muscle] All ${keys.length} keys exhausted or rejected by proxy.`);
}

const DEFAULT_CONCURRENCY = 20;

/**
 * Executes a batch of tasks with a strict concurrency limit.
 * Uses `p-limit` to maximize throughput without exceeding memory/compute limits.
 * 
 * @param tasks An array of async functions to execute.
 * @param concurrency Limit of concurrent executions. Default is 20.
 */
export async function processBatch<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number = DEFAULT_CONCURRENCY
): Promise<T[]> {
    const limit = pLimit(concurrency);
    return Promise.all(tasks.map(task => limit(task)));
}
