// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * TypeScript interfaces for Clash Royale Manager
 */

// API Response Envelope
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: { code: string; message: string };
}


// Member in Leaderboard
export interface LeaderboardMember {
  id: string; // Player tag without #
  n: string; // Name
  t: number; // Trophies
  
  // STRICT NOMENCLATURE
  performanceScore: number; // Normalized % (0-100)
  performanceRawScore: number;  // Unbounded Calculation (e.g. 52102)

  dt?: number; // Score Trend (Raw Score Delta)
  d: {
    role: string;
    days: number;
    avg: number;
    seen?: string | null; // Made optional
    rate?: string | null; // Made optional
    wfame?: number;
    hist: string;
    v_hist?: string;
  };
}

// Recruit in Headhunter
export interface Recruit {
  id: string; // Player tag without #
  n: string; // Name
  t: number; // Trophies
  
  // STRICT NOMENCLATURE
  potentialScore: number; // Normalized % (0-100)
  potentialRawScore: number; // Unbounded Calculation (e.g. 52102)
  longevity: number; // Minutes since discovery
  longevityLabel: string; // Human-readable duration (e.g. "2h 15m")
  tenureDays?: number; // Previous heritage tenure
  tenureLabel?: string; // Formatted heritage tenure (e.g. "1y 2mo")

  d: {
    don: number; // Donations
    war: number; // War Wins
    ago: string; // Found Date ISO
    cards?: number; // Cards Won (optional)
  };
  lastScan?: number; // Timestamp of last API validation
}

// Web App Data payload
export interface WebAppData {
  readonly lb: readonly LeaderboardMember[];
  readonly hh: readonly Recruit[];
  readonly playerTag?: string; // Player tag without # to highlight
  readonly timestamp: number;
  readonly dataSource?: "SUPABASE";
  readonly remoteTimestamp?: number;
  readonly lastCompiled?: number;
  readonly lastFetched?: number;
  readonly lastSync?: number;
  readonly blacklist?: readonly string[];
}


// Ping response
export interface PingResponse {
  version?: string;
  status: string;
  message?: string;
  latency?: number;
}

// Momentum / Trend Calculation Result
export interface MomentumInfo {
  val: string;
  dir: "up" | "down";
  raw: number;
}

// Dismissal tuple
export interface DismissalRequest {
  id: string;
  score: number;
}

// Dismiss response
export interface DismissResponse {
  success: boolean;
  count?: number;
  message?: string;
}

/**
 * Shared UI State for Console Cards
 *
 * @remarks
 * Standardizes the metadata returned by the console controller for various list-based
 * feature cards (e.g., MemberCard, RecruitCard).
 */
export interface ConsoleCardMetadata {
  /** UI State: Controls the expansion of detailed statistics and charts. */
  expanded: boolean;
  /** UI State: Indicates if the card is in the batch selection queue. */
  selected: boolean;
  /** UI State: Toggles between interaction modes (Expansion vs. Selection). */
  selectionMode: boolean;
  /** Optional: Indicates if the item is currently tagged (e.g., target player). */
  isTagged?: boolean;
  /** UI State: Indicates if the card's data is being refreshed in the background. */
  appIsRefreshing?: boolean;
}

/**
 * Standardized provenance metadata from the Layer 1 ClashDataStore.
 */
export interface HubInfo {
  /** The authoritative source of the current dataset. */
  source: "SUPABASE" | "WORKER" | "GAS";
  /** Human-readable age of the data at the source. */
  hubAge: string | null;
  /** Standardized diagnostic code for sync failures. */
  diagnosis?: "TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null;
}

/**
 * Authoritative type definitions for the Clan Voyage feature.
 * Relocated to Layer 1 (@core) to satisfy structural isolation rules.
 */

export type VoyageStatus = "IDLE" | "PENDING" | "ACTIVE" | "COMPLETED";

interface VoyageEvent {
  id: number;
  clan_tag: string;
  status: VoyageStatus;
  target_crowns: number;
  start_at: string; // ISO-8601
  end_at: string | null;   // ISO-8601, null when scheduled and PENDING
  activated_by: string | null;
  is_victory: boolean | null;
}

export interface VoyageContribution {
  player_tag: string;
  player_name?: string;
  total_voyage_crowns: number;
  percentage_voyage_crowns: number;
  performance_score?: number;
}

export interface VoyageSummary {
  event: VoyageEvent;
  contributions: VoyageContribution[];
  total_voyage_crowns: number;
  progress_ratio: number; // 0.0 - 1.0
}

/**
 * Raw output shape of the `features.voyage_summary` view.
 *
 * @remarks
 * The view deliberately omits per-player contributions (those are fetched
 * from the separate `voyage_contributions` view). The store assembles the
 * full {@link VoyageSummary} by merging both sources.
 */
export type VoyageViewSummary = Omit<VoyageSummary, "contributions">;

/** T2T (Time-to-Timestamp) input structure from the activation form. */
export interface T2TInput {
  days: number;
  hours: number;
  minutes: number;
}
