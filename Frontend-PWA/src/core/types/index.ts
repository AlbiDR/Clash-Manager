// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * TypeScript interfaces for Clash Royale Manager
 */

/**
 * Interface for the Native Android JSBridge.
 *
 * @remarks
 * Formalizes the contract for communication between the PWA and the native
 * Android wrapper (TWA).
 */
export interface AndroidBridge {
  /** Opens a URL using the native Android ACTION_VIEW intent. */
  openExternalUrl(url: string): void;
  /** Directs the native app to open a specific player profile in Clash Royale. */
  openPlayerProfile(id: string): void;
  /** Retrieves persisted Blitz Mode calibration coordinates as a JSON string. */
  getCoordinates(): string;
  /** Persists Blitz Mode calibration coordinates to native storage. */
  saveCoordinates(ix: number, iy: number, cx: number, cy: number): void;
  /** Directs the native app to open the System Accessibility Settings. */
  openAccessibilitySettings(): void;
  /** Checks if the native accessibility service is currently active. */
  isAccessibilityActive(): boolean;
}

/**
 * Extended Window interface to include the Native Android Bridge.
 */
export interface WindowWithBridge extends Window {
  AndroidBridge?: AndroidBridge;
}

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
 * Shared UI State for the Global FAB (Floating Action Button).
 *
 * @remarks
 * Formalizes the contract for the management button used in Console views.
 */
export interface ConsoleFabState {
  /** Indicates if the FAB should be rendered. */
  visible: boolean;
  /** The primary text label displayed on the button. */
  label: string;
  /** Indicates if a background operation is currently in progress. */
  isProcessing: boolean;
  /** Indicates if the system is preparing a "Blasting" operation (batch sync). */
  isBlasting: boolean;
  /** The current number of items selected in the batch. */
  selectionCount: number;
  /** Indicates if "Blitz Mode" (high-speed processing) is enabled. */
  blitzEnabled: boolean;
  /** Indicates if a leaderboard harvest operation is currently active. */
  isHarvesting?: boolean;
  /** The active harvester mode (local or global). */
  activeHarvester?: "global" | "local" | null;
  /** Optional icon override for the dismiss/close button. */
  dismissIcon?: string;
}

/**
 * Standardized events contract for the ConsoleLayout component.
 *
 * @remarks
 * Eliminates 'any' pathogens from the event stream by defining the
 * authoritative set of interactions supported by the orchestration layer.
 *
 * @typeParam T - The type of items being managed in the console.
 */
export interface ConsoleLayoutEvents<T = any> {
  /** Triggers a manual data refresh. */
  refresh: () => void | Promise<void>;
  /** Updates the active search filter. */
  "update:search": (query: string) => void;
  /** Changes the active sorting strategy. */
  "update:sort": (sort: string) => void;
  /** Selects all currently filtered items. */
  "select-all": () => void;
  /** Resets the current batch selection. */
  "clear-selection": () => void;
  /** Selects items based on a numeric score threshold. */
  "select-score": (threshold: number, mode: "ge" | "le", customScoreGetter?: (item: T) => number) => void;
  /** Triggered when the management FAB is dismissed. */
  "fab-dismiss": () => void;
  /** Allows for feature-specific event extensions. */
  [key: string]: ((...args: any[]) => void | Promise<void>) | undefined | any;
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
interface HubInfo {
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
