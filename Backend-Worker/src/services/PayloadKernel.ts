// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { HubState, HubError } from "../types/HubTypes.js";
import { GasRawFeedSchema } from "../schemas.js";

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
  static generateMatrix(rawPayload: unknown): HubState {
    // THREAT: Malformed matrix data from GAS causing downstream PWA crashes.
    // Target B [1]: Enforce strict validation boundary for raw feed ingress.
    const result = v.safeParse(GasRawFeedSchema, rawPayload);

    if (!result.success) {
       console.error("[PayloadKernel] Matrix validation failed:", result.issues);
       throw {
           code: "ERR_MATRIX_CORRUPTED",
           message: "Upstream (GAS) returned malformed or unvalidated table data.",
           layer: "WORKER_PAYLOAD_KERNEL"
       } as HubError;
    }

    const { roster, headhunter } = result.output.tables;

    // Phase 1 MVP Transformation: Directly pass the data structure.
    // In future iterations, field-level compression (e.g., removing redundant
    // meta columns or mapping to smaller keys) happens here.
    const compiledAt = new Date().toISOString();
    const fetchedAt = result.output.timestamp;

    return {
      metadata: {
        timestamp: compiledAt,
        lastCompiled: compiledAt,
        lastFetched: fetchedAt,
        status: "healthy",
        version: "10.1.4",
        source: "RENDER_WORKER"
      },
      data: {
        roster,
        headhunter
      }
    };
  }
}
