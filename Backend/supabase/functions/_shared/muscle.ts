// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import pLimit from "npm:p-limit";
import * as v from "npm:valibot@1.4.2";
import { KeyPoolSchema } from "./schemas.ts";

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

// EPHEMERAL: intentionally resets on cold start
let activeKeys: string[] = [];

/**
 * Explicitly sets the API keys for the rotation engine.
 *
 * @remarks
 * Accepting both `string` and `string[]` ensures compatibility with both
 * raw Vault secret strings (comma-separated or JSON) and pre-parsed arrays.
 *
 * @param keys - A single string (comma-separated or JSON array) or an array of API keys.
 */
export function setKeys(keys: unknown): void {
  // [THREAT:] Unvalidated key configurations can lead to silent sync failures.
  // [DECISION LOG] Utilizing KeyPoolSchema for clinical normalization of keys.
  activeKeys = v.parse(KeyPoolSchema, keys);
}

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
  if (activeKeys.length > INITIAL_INDEX) {
    return activeKeys;
  }
  const rawArgs = Deno.env.get("ROYALE_API_KEYS") || "";
  return v.parse(KeyPoolSchema, rawArgs);
}

console.log(`[Native-Muscle] Key Farm online. Keys will be resolved lazily per request.`);


/**
 * Executes an HTTP GET request with automatic key rotation and IP-bypass proxying.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Utility (@shared)
 * - **Role:** Resilient hardware broker for the Royale API.
 * - **Resilience:** Implements exponential backoff and transparent key rotation to
 *   maximize uptime against rate-limiting (429) or IP-based throttling.
 *
 * [DECISION LOG] Keys are resolved lazily inside this function to ensure that updates
 * from the Supabase Vault (via syncVault) are reflected even after module cold-starts.
 *
 * @param endpoint - The Royale API endpoint path (e.g., "/clans/TAG").
 * @param maxRetries - Maximum retry attempts per key before rotation. Defaults to 3.
 * @returns A standard Fetch `Response` object.
 * @throws Error if all keys in the rotation pool are exhausted or rejected by the proxy.
 */
export async function fetchWithRotation(endpoint: string, maxRetries: number = DEFAULT_MAX_RETRIES): Promise<Response> {
  const keys = getKeys();
  const startIndex = Math.floor(Math.random() * keys.length);
  
  // [THREAT:] Prevents IP or token-based banning by distributing requests across a pool of API keys.
  // [DECISION LOG] Key rotation is implemented via a random offset (startIndex) followed by a linear
  // probe to ensure all keys are tried before declaring failure.
  for (let rotationIndex = INITIAL_INDEX; rotationIndex < keys.length; rotationIndex++) {
    const targetIndex = (startIndex + rotationIndex) % keys.length;
    let key = keys[targetIndex].trim().replace(/^"|"$/g, "");
    
    let retryAttempt = INITIAL_INDEX;
    while (retryAttempt <= maxRetries) {
      try {
        const apiResponse = await fetch(`https://proxy.royaleapi.dev/v1${endpoint}`, {
          headers: { 
            Authorization: `Bearer ${key}`,
            "Accept": "application/json"
          }
        });
        
        if (apiResponse.status === HTTP_STATUS_FORBIDDEN || apiResponse.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
          console.warn(`[Native-Muscle] Key [${targetIndex}] throttled/forbidden (${apiResponse.status}). Rotating to next...`);
          break; // Break inner loop to rotate key
        }

        if (apiResponse.status >= HTTP_SERVER_ERROR_MIN && apiResponse.status <= HTTP_SERVER_ERROR_MAX) {
          if (retryAttempt === maxRetries) break; // Exhausted retries, rotate key just in case
          console.warn(`[Native-Muscle] API Error (${apiResponse.status}) on key [${targetIndex}]. Retrying ${retryAttempt + 1}/${maxRetries}...`);
          retryAttempt++;
          // [DECISION LOG] Exponential backoff (2^retryAttempt * 500ms) to allow Royale API
          // or proxy nodes time to recover from transient failures.
          const backoffMs = Math.pow(BACKOFF_EXPONENT_BASE, retryAttempt) * BACKOFF_MULTIPLIER_MS;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        
        return apiResponse;
      } catch (fetchError: unknown) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.warn(`[Native-Muscle] Fetch failed for key [${targetIndex}]: ${errorMessage}`);
        if (retryAttempt === maxRetries) {
          if (rotationIndex === keys.length - ARRAY_LAST_INDEX_OFFSET) throw fetchError;
          break; // Break inner loop to rotate key
        }
        retryAttempt++;
        // [THREAT:] Prevents hammering the proxy/API during transient network failures.
        const backoffMs = Math.pow(BACKOFF_EXPONENT_BASE, retryAttempt) * BACKOFF_MULTIPLIER_MS;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  throw new Error(`[Native-Muscle] All ${keys.length} keys exhausted or rejected by proxy.`);
}

const DEFAULT_CONCURRENCY = 20;

/**
 * Executes a batch of tasks with a strict concurrency limit.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Utility (@shared)
 * - **Role:** High-concurrency orchestration for Supabase Edge Functions.
 * - **Optimization:** Uses `p-limit` to maximize throughput while staying within
 *   Edge Function memory and CPU constraints (preventing Error 546).
 *
 * @param tasks - An array of asynchronous functions to execute.
 * @param concurrency - The maximum number of concurrent executions. Defaults to 20.
 * @returns A promise that resolves to an array of results from the executed tasks.
 */
export async function processBatch<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<T[]> {
    const limit = pLimit(concurrency);
    return Promise.all(tasks.map(task => limit(task)));
}
