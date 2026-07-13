// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Authoritative type definitions for the Clan Voyage feature.
 *
 * @remarks
 * **Architectural Context:**
 * Following the structural unitary architecture (ADR Section II), core domain
 * types are housed in @core/types to eliminate cross-layer coupling.
 * This module re-exports those types to provide a stable interface for
 * Voyage feature components.
 */

export type {
  VoyageStatus,
  VoyageSummary,
  T2TInput
} from "@core/types";
