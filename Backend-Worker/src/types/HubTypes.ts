// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [TYPES] WORKER HUB TYPES
 * ----------------------------------------------------------------------------
 * Structural definitions for the Worker-Led Data Hub state and error contracts.
 * ============================================================================
 */

export interface HubError {
  code: string;
  message: string;
  layer: 'WORKER_HUB' | 'WORKER_PAYLOAD_KERNEL' | 'WORKER_PERSISTENCE' | 'GAS_API_RAW';
}

export interface HubState {
  metadata: {
    timestamp: string;
    status: 'healthy' | 'degraded' | 'offline';
    version: string;
    source: string;
  };
  data: {
    roster: unknown[][];
    headhunter: unknown[][];
  };
}
