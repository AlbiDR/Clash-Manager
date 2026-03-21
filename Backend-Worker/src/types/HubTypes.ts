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
  layer: 'WORKER_HUB';
}

export interface HubState {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'offline';
  data: Record<string, unknown>; // Will be refined with specific matrix types later
}
