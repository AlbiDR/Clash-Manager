// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Normalized failure raised by Layer 1 network transports.
 *
 * @remarks
 * **Architectural Context:**
 * - Layer: Layer 1 (@core)
 * - ADR Reference: Satisfies ADR Section IV: Layer 1 Core Services and Section III: Validation Boundaries.
 *   Provides unified error classification across RPCs, REST, and Edge Function endpoints.
 */
export class NetworkError extends Error {
  /**
   * Initializes a new NetworkError instance.
   *
   * @param message - Descriptive human-readable error summary.
   */
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";

    // [DECISION LOG] PROTOTYPE CHAIN RESTORATION
    // Rationale: ES5/ES6 transpilation targets break native Error instanceof checks when subclassing Error.
    // Explicitly setting the prototype restores instanceof functionality in Vitest and production runtimes.
    // [THREAT:] Unhandled transport failure propagation causing silent UI crashes if instanceof checks fail.
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
