// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { HubState, HubError } from "../types/HubTypes.js";

/**
 * ============================================================================
 * [MODULE] PAYLOAD KERNEL (WORKER HUB EDITION)
 * ----------------------------------------------------------------------------
 * Autonomous data aggregation engine. Ingests raw untransformed matrices
 * from the GAS dumb store, applies business rules, and compresses them into
 * the final HubState format for the PWA.
 * ============================================================================
 */

export class PayloadKernel {
  /**
   * Transforms raw GAS table exports into the strictly typed HubState matrix.
   * 
   * @param rawPayload - Untrusted, unverified raw data from GAS.
   * @returns A strongly typed, compressed HubState payload ready for PWA delivery.
   */
  static generateMatrix(rawPayload: any): HubState {
    if (!rawPayload || !rawPayload.tables) {
       console.error("[PayloadKernel] Invalid or missing tables from raw feed");
       throw {
           code: "ERR_MATRIX_CORRUPTED",
           message: "Upstream (GAS) returned malformed or missing tables.",
           layer: "WORKER_PAYLOAD_KERNEL"
       } as HubError;
    }

    const { roster, headhunter } = rawPayload.tables;

    // Phase 1 MVP Transformation: Directly pass the data structure.
    // In future iterations, field-level compression (e.g., removing redundant
    // meta columns or mapping to smaller keys) happens here.
    return {
      metadata: {
        timestamp: new Date().toISOString(),
        status: "healthy",
        version: "v1_hub",
        source: "RENDER_WORKER"
      },
      data: {
        roster: Array.isArray(roster) ? roster : [],
        headhunter: Array.isArray(headhunter) ? headhunter : []
      }
    };
  }
}
