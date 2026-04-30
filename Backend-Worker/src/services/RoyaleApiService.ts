// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { KeyService } from "../KeyService";
import { Network } from "./Network";
import type { FetchResult } from "../types";

/**
 * ============================================================================
 * [SERVICE] ROYALE API TRANSPORT
 * ----------------------------------------------------------------------------
 * Handles low-level network orchestration for the Royale API, including
 * key rotation, exponential backoff, and quota tracking.
 * ============================================================================
 */

export class RoyaleApiService {
  private static readonly DEFAULT_TIMEOUT_MS = parseInt(process.env["WORKER_TIMEOUT_SEC"] ?? "45", 10) * 1000;
  private static readonly DEFAULT_RETRIES = parseInt(process.env["WORKER_RETRIES"] ?? "2", 10);

  /**
   * Executes a global fetch operation with a built-in AbortSignal timeout.
   *
   * @param targetEndpoint - The destination Royale API endpoint.
   * @param requestConfiguration - Standard fetch RequestInit options.
   * @param timeoutDurationMs - Duration in milliseconds before the request is aborted.
   * @returns The upstream fetch response.
   */
  static async timeoutFetch(
    targetEndpoint: string,
    requestConfiguration: Record<string, unknown> = {},
    timeoutDurationMs: number = this.DEFAULT_TIMEOUT_MS,
  ): Promise<globalThis.Response> {
    return fetch(targetEndpoint, {
      ...requestConfiguration,
      signal: AbortSignal.timeout(timeoutDurationMs),
    } as RequestInit);
  }

  /**
   * Orchestrates a network request with high-resiliency features:
   * 1. **Key Rotation:** Automatically selects a healthy key from the provided pool.
   * 2. **Jittered Backoff:** Retries failed requests (5xx, 429) with exponential delay.
   * 3. **Quota Tracking:** Increments the global `Network` quota counter on every attempt.
   *
   * @param targetEndpoint - The destination Royale API endpoint.
   * @param requestConfiguration - Initial fetch options (method, headers).
   * @param maxRetryAttempts - Maximum number of retry attempts.
   * @param keyManager - KeyService instance for rotation; defaults to the global pool if provided elsewhere.
   * @returns A structured FetchResult containing the status code and parsed JSON or raw text.
   */
  static async fetchWithRotatedRetries<T = unknown>(
    targetEndpoint: string,
    requestConfiguration: Record<string, unknown>,
    maxRetryAttempts: number = this.DEFAULT_RETRIES,
    keyManager: KeyService,
  ): Promise<FetchResult<T>> {
    let currentAttempt = 0;
    let lastOperationError: Error | null = null;
    let lastUsedKey: string = "None";

    while (currentAttempt <= maxRetryAttempts) {
      const activeApiKey = keyManager.getHealthyKey();
      if (!activeApiKey) {
        return { code: 429, content: "ERR_QUOTA_EMPTY" as T, keyUsed: "None" };
      }
      lastUsedKey = activeApiKey;

      const fetchOptions = {
        ...requestConfiguration,
        headers: {
          ...(requestConfiguration["headers"] as Record<string, string> || {}),
          "Authorization": `Bearer ${activeApiKey}`
        }
      };

      try {
        const apiResponse = await this.timeoutFetch(targetEndpoint, fetchOptions);

        // THREAT: Royale API Quota Exhaustion.
        // Track all Royale API attempts to prevent quota guard trips.
        Network.addQuotaUsage(1);

        const responseStatusCode = apiResponse.status;
        const rawApiResponseText = await apiResponse.text();

        if (responseStatusCode === 200) {
          keyManager.reportSuccess(activeApiKey);
          const maskedKey = `${activeApiKey.substring(0, 10)}...${activeApiKey.slice(-4)}`;
          try {
            return {
              code: responseStatusCode,
              content: JSON.parse(rawApiResponseText) as T,
              keyUsed: maskedKey,
            };
          } catch {
            return {
              code: responseStatusCode,
              content: rawApiResponseText as T,
              keyUsed: maskedKey,
            };
          }
        }

        // Handle Failures
        keyManager.reportFailure(activeApiKey, responseStatusCode);

        if (responseStatusCode === 404) return { code: responseStatusCode, content: rawApiResponseText as T };
        if (responseStatusCode === 403) throw new Error("auth_denied");
        if (responseStatusCode === 429) throw new Error("rate_limit");

        throw new Error(`upstream_status_${responseStatusCode}`);

      } catch (operationError) {
        lastOperationError = operationError instanceof Error ? operationError : new Error(String(operationError));
        currentAttempt++;

        if (currentAttempt <= maxRetryAttempts) {
          const backoffDelayMs = Math.min(10000, (500 * Math.pow(2, currentAttempt)) + (Math.random() * 1000));
          console.warn(`[RoyaleApiService] Rotate-Retry ${currentAttempt}/${maxRetryAttempts} for ${targetEndpoint.slice(-20)}. Backoff: ${Math.round(backoffDelayMs)}ms. Reason: ${lastOperationError.message}`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelayMs));
        }
      }
    }

    const finalMaskedKey = lastUsedKey !== "None"
      ? `${lastUsedKey.substring(0, 10)}...${lastUsedKey.slice(-4)}`
      : "None";

    return {
      code: 520,
      content: `Fetch exhausted: ${lastOperationError?.message ?? "unknown"}` as T,
      keyUsed: finalMaskedKey,
    };
  }
}
