// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { HubPersistenceService } from "../services/HubPersistenceService.js";
import { PayloadKernel } from "../services/PayloadKernel.js";
import { HubState, HubError } from "../types/HubTypes.js";
import { HubErrorSchema } from "../schemas.js";
import * as v from "valibot";

/**
 * ============================================================================
 * [MODULE] WORKER HUB CONTROLLER
 * ----------------------------------------------------------------------------
 * Orchestrates the data synchronization between the GAS "Dumb Store" and
 * the local Node file system. Manages the 5-minute daemon and handles
 * PWA read/write ingress.
 * ============================================================================
 */

export class WorkerHubController {
  private static memoryCache: HubState | null = null; // EPHEMERAL: intentionally resets on restart
  private static isSyncing = false; // EPHEMERAL: intentionally resets on restart
  private static timerId: NodeJS.Timeout | null = null; // EPHEMERAL: intentionally resets on restart
  private static readonly SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Bootstraps the continuous synchronization daemon.
   */
  static startSyncDaemon(gasBaseUrl: string, secret: string): void {
    if (this.timerId) return;

    console.log("[WorkerHubController] Starting 5m Sync Daemon...");
    
    // Initial fetch
    this.executeSync(gasBaseUrl, secret).catch(syncError => console.error("[WorkerHubDaemon] Initial sync failed:", syncError));

    this.timerId = setInterval(() => {
      this.executeSync(gasBaseUrl, secret).catch(syncError => console.error("[WorkerHubDaemon] Interval sync failed:", syncError));
    }, this.SYNC_INTERVAL_MS);
  }

  /**
   * Gracefully shuts down the synchronization daemon to prevent memory leaks.
   */
  static stopSyncDaemon(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      console.log("[WorkerHubController] Sync Daemon stopped.");
    }
  }

  /**
   * Single-execution synchronization flow with strict overlap protection.
   *
   * @param gasBaseUrl Base URL of the GAS deployments
   * @param secret The pre-shared Bearer token
   */
  static async executeSync(gasBaseUrl: string, secret: string): Promise<boolean> {
    if (this.isSyncing) {
      console.warn("[WorkerHubController] Sync overlapping detected. Skipping cycle.");
      return false;
    }

    this.isSyncing = true;
    try {
      const rawUrl = `${gasBaseUrl}?action=raw&token=${encodeURIComponent(secret)}`;
      const response = await fetch(rawUrl);

      if (!response.ok) {
         throw new Error(`Upstream GAS rejected connection: ${response.status}`);
      }

      const rawJson: unknown = await response.json();
      
      // [GUARD] UPSTREAM ERROR NORMALIZATION: Target B [1] Validation Boundary
      // Rationale: GAS returns structured JSON errors even on success-adjacent paths.
      // We must explicitly check and transform these into HubError objects.
      // [OCD] Standardized validation avoids "any" Plague pathogens.
      const hubErrorValidation = v.safeParse(v.object({ error: v.string() }), rawJson);
      if (hubErrorValidation.success) {
         const hubErr: HubError = {
            code: "GAS_SYNC_REJECTED",
            message: hubErrorValidation.output.error,
            layer: "GAS_API_RAW"
         };
         throw hubErr;
      }

      // 1. Transform Raw Data -> Structured HubState
      const newState: HubState = PayloadKernel.generateMatrix(rawJson);

      // 2. Optimistic internal cache updates (L1 Cache)
      this.memoryCache = newState;

      // 3. Persist State Atomically (L2 Backup)
      await HubPersistenceService.saveState(newState);
      
      console.log(`[WorkerHubController] Sync complete. V: ${newState.metadata.version}`);
      return true;

    } catch (syncError: unknown) {
      // THREAT: Silent sync failure if error is swallowed or generic 'any' is used.
      // Target B [1]: Robust error propagation for Hub synchronization using v.safeParse.
      const validation = v.safeParse(HubErrorSchema, syncError);

      if (validation.success) {
         console.error(`[WorkerHubController] Sync execution failure (${validation.output.layer}):`, validation.output.message);
      } else {
         const message = syncError instanceof Error ? syncError.message : String(syncError);
         console.error("[WorkerHubController] Sync execution failure (UNCLASSIFIED):", message);
      }
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Handles ingress for the latest PWA state request.
   * Utilizes L1 Memory Cache for 0ms disk latency.
   */
  static async getHubState(): Promise<HubState> {
    if (this.memoryCache) return this.memoryCache;

    // Cold-boot recovery
    const state = await HubPersistenceService.loadState();
    if (!state) {
      const error: HubError = {
         code: "ERR_STATE_MISSING",
         message: "HubState has not yet been synced or initialized.",
         layer: "WORKER_PERSISTENCE"
      };
      throw error;
    }
    this.memoryCache = state;
    return state;
  }
}
