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
 *
 * ⚠️ HARD NATIVE DEPENDENCY - DO NOT BREAK THIS CONTRACT.
 * These methods are implemented by a custom Java layer
 * (`MainActivity$AndroidBridge` + `BlitzService` + `ClashManagerAccessibilityService`)
 * authored in `APK/src/com/albidr/clashmanager/` and compiled into
 * `APK/android/classes.dex` by `build-apk.sh`.
 * The release is built with `pnpm apk:check`, NOT `bubblewrap build` (which
 * produces a generic TWA that strips this bridge).
 * Renaming a method here requires a matching change in that native layer, or the
 * Blitz / accessibility / external-link features silently break on device.
 * `verify-apk-integrity.mjs` asserts every method below survives a build.
 */
export interface AndroidBridge {
  /** Opens a URL using the native Android ACTION_VIEW intent. */
  openExternalUrl(url: string): void;
  /**
   * Downloads a file natively via Android DownloadManager.
   * Preferred over openExternalUrl for binary assets (APK files) because
   * DownloadManager fetches the file in the background, saves it to the
   * Downloads folder, shows a system notification, and then opens Android's
   * installer for user-confirmed in-place update.
   */
  downloadApkFile(url: string, filename: string, sha256?: string): void;
  /** Returns the installed native APK versionName, e.g. "14.43.4". */
  getAppVersionName?(): string;
  /** Returns the installed native APK versionCode, e.g. 18500 for 14.45.0. */
  getAppVersionCode?(): number;
  /** Returns the installed native APK CI build number, e.g. 179. */
  getBuildNumber?(): number;
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
  /** Checks if the app has draw-over-other-apps overlay permission. */
  hasOverlayPermission(): boolean;
  /** Checks if Android allows this app to request user-confirmed APK installs. */
  canRequestPackageInstalls?(): boolean;
  /** Opens the per-app Android install-unknown-apps settings screen. */
  openPackageInstallSettings?(): void;
  /**
   * Initiates a Blitz Mode sequence for the provided list of player tags.
   *
   * @param payload - JSON-encoded array of player tags.
   * @param delayMs - Milliseconds to wait for each profile to render before
   *   the invite/close taps fire, per the user's Blitz Speed setting.
   */
  startBlitz(payload: string, delayMs: number): void;
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
    winRate: number; // Recent win rate over the member's rolling battle log
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
    winRate?: number; // Win Rate ratio, 0-1+ (optional)
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
  momentumLabel: string;
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
  /** Optional deep-link URL for the FAB's primary action (e.g. Blitz Mode target). */
  actionHref?: string;
  /** Indicates if a background operation is currently in progress. */
  isProcessing: boolean;
  /** Indicates if the system is preparing a "Blasting" operation (batch sync). */
  isBlasting: boolean;
  /** The current number of items selected in the batch. */
  selectionCount: number;
  /** Indicates if "Blitz Mode" (high-speed processing) is enabled. */
  blitzEnabled: boolean;
  /**
   * Indicates if the Global/Local Harvest actions are wired up for this view.
   * Harvest scouts external clanless players from the Clash Royale leaderboard,
   * which only makes sense for a recruiting view (Headhunter) — not for Roster,
   * which manages existing clan members. Distinct from `blitzEnabled` because
   * both views share the same Blitz FAB but only one supports Harvest.
   */
  harvestEnabled?: boolean;
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
 * Represents the unified health status of the connectivity hub.
 */
export interface HubHealth {
  /** Visual classification for UI styling (color/icon). */
  type: "success" | "warning" | "error" | "loading";
  /** Short, human-readable status label. */
  label: string;
  /** Percentage indicating data reliability (0-100). */
  confidence: number;
  /** Detailed technical diagnosis or error message. */
  diagnosis?: string;
}

/**
 * Authoritative metadata regarding the origin and age of the current data.
 */
export interface HubMetadata {
  /** The identified backend source (e.g., "SUPABASE", "LOCAL"). */
  source: string;
  /** Human-readable age of the data (e.g., "5m ago"). */
  age: string | null;
  /** Data age in minutes for logical thresholding. */
  ageMinutes: number;
  /** Formatted time when the remote dataset was last compiled. */
  lastCompiled: string | null;
  /** Formatted time when the backend last fetched raw API data. */
  lastFetched: string | null;
  /** Flag indicating if the data has exceeded the staleness threshold. */
  isStale: boolean;
}

/**
 * UI-focused metadata for the connectivity hub.
 */
export interface ConsoleRemoteInfo {
  /** The identified backend source (e.g., "SUPABASE", "LOCAL"). */
  source: string;
  /** Human-readable age of the data (e.g., "5m ago"). */
  dataAge: string | null;
  /** Detailed technical diagnosis or error message. */
  diagnosis?: string | null;
  /** Formatted time when the remote dataset was last compiled. */
  lastCompiled?: string | null;
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
