// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Authoritative type definitions for the Clan Voyage feature.
 * All components and composables in this module MUST use these types.
 */

export type VoyageStatus = "IDLE" | "PENDING" | "ACTIVE" | "COMPLETED";

export interface VoyageEvent {
  id: number;
  clan_tag: string;
  status: VoyageStatus;
  target_crowns: number;
  start_at: string;  // ISO-8601
  end_at: string;    // ISO-8601
  activated_by: string | null;
  is_victory: boolean | null;
}

export interface VoyageContribution {
  player_tag: string;
  player_name?: string;
  crowns: number;
  voyage_crown_pct: number;
  performance_score?: number;
}

export interface VoyageSummary {
  event: VoyageEvent;
  contributions: VoyageContribution[];
  total_crowns: number;
  progress_ratio: number; // 0.0 – 1.0
}

/** T2T (Time-to-Timestamp) input structure from the activation form. */
export interface T2TInput {
  days: number;
  hours: number;
  minutes: number;
}
