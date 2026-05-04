// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import pLimit from "npm:p-limit";

/**
 * L1 Core: Native Muscle Engine
 * High-concurrency batch processor for Supabase Edge Functions.
 * Replaces the legacy Render backend worker.
 */

const keys: string[] = (() => {
  const rawArgs = Deno.env.get("ROYALE_API_KEYS") || "";
  try {
    const parsed = JSON.parse(rawArgs);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return rawArgs.split(",").map((k: string) => k.trim()).filter(Boolean);
  }
})();

console.log(`[Native-Muscle] Key Farm initialized with ${keys.length} autonomous keys.`);

if (keys.length === 0) {
  console.warn("[CRITICAL] No ROYALE_API_KEYS found in environment. Fetching will fail.");
}

/**
 * Executes an HTTP GET request with automatic key rotation and IP-bypass proxying.
 */
export async function fetchWithRotation(endpoint: string, maxRetries: number = 3): Promise<Response> {
  const startIndex = Math.floor(Math.random() * keys.length);
  
  for (let i = 0; i < keys.length; i++) {
    const targetIndex = (startIndex + i) % keys.length;
    let key = keys[targetIndex].trim().replace(/^"|"$/g, "");
    
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(`https://proxy.royaleapi.dev/v1${endpoint}`, {
          headers: { 
            Authorization: `Bearer ${key}`,
            "Accept": "application/json"
          }
        });
        
        if (res.status === 403 || res.status === 429) {
          console.warn(`[Native-Muscle] Key [${targetIndex}] throttled/forbidden (${res.status}). Rotating to next...`);
          break; // Break inner loop to rotate key
        }

        if (res.status >= 500 && res.status <= 599) {
          if (attempt === maxRetries) break; // Exhausted retries, rotate key just in case
          console.warn(`[Native-Muscle] API Error (${res.status}) on key [${targetIndex}]. Retrying ${attempt + 1}/${maxRetries}...`);
          attempt++;
          const backoffMs = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        
        return res;
      } catch (fetchError: unknown) {
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.warn(`[Native-Muscle] Fetch failed for key [${targetIndex}]: ${errorMessage}`);
        if (attempt === maxRetries) {
          if (i === keys.length - 1) throw fetchError;
          break; // Break inner loop to rotate key
        }
        attempt++;
        const backoffMs = Math.pow(2, attempt) * 500;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  
  throw new Error(`[Native-Muscle] All ${keys.length} keys exhausted or rejected by proxy.`);
}

/**
 * Executes a batch of tasks with a strict concurrency limit.
 * Uses `p-limit` to maximize throughput without exceeding memory/compute limits.
 * 
 * @param tasks An array of async functions to execute.
 * @param concurrency Limit of concurrent executions. Default is 20.
 */
export async function processBatch<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number = 20
): Promise<T[]> {
    const limit = pLimit(concurrency);
    return Promise.all(tasks.map(task => limit(task)));
}
