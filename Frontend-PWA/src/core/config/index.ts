// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * CORE CONFIGURATION (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralized business thresholds and operational constants.
 * Following ADR Section II, these derive from the substrate to prevent
 * "Magic Number" drift across the monorepo.
 * ----------------------------------------------------------------------------
 */

/**
 * Authoritative TTL (Time-To-Live) for clan data staleness.
 * Marks data as 'STALE' if older than 30 minutes to prompt background refresh.
 *
 * @remarks
 * [DECISION LOG] CACHE DURATION:
 * A 30-minute window balances data freshness with API rate limit conservation
 * and device battery preservation.
 */
export const DATA_STALENESS_THRESHOLD = 1000 * 60 * 30; // 30 minutes

/**
 * Logical representation of staleness in minutes for UI and status resolution.
 */
export const DATA_STALENESS_MINUTES = 30;

/**
 * Threshold for triggering a background refresh on app visibility change.
 * If the app has been hidden for more than 30 minutes, a fresh sync is initiated.
 *
 * @remarks
 * [THREAT:] POLLING OVERHEAD:
 * Excessive background syncs on every visibility change would cause battery drain
 * and unnecessary network traffic.
 *
 * [DECISION LOG] COOLDOWN PERIOD:
 * Aggressive refresh only occurs after significant idle time (30m), ensuring
 * that returning users see fresh data without taxing the system on every tab switch.
 */
export const VISIBILITY_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes

/**
 * Interval for polling Supabase while the app stays open and foregrounded.
 *
 * @remarks
 * [THREAT:] UNBOUNDED SESSION STALENESS:
 * The visibility-change refresh only fires after VISIBILITY_REFRESH_THRESHOLD
 * of being backgrounded. A tab left open and foregrounded continuously (never
 * backgrounded, never re-navigated) previously never refetched again after its
 * initial load, so roster data (member list, last-seen timestamps) could drift
 * arbitrarily far from the backend regardless of how fresh the backend was.
 *
 * [DECISION LOG] FOREGROUND POLL:
 * 5 minutes matches the roster's practical freshness needs while staying well
 * under the 30-minute backend ingest cadence multiple times over.
 */
export const FOREGROUND_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Default score threshold used for recruitment prioritization and batch selection.
 *
 * @remarks
 * [DECISION LOG] ELITE BASELINE:
 * 75% matches the "Elite" recruiter definition established in ADR Section VII,
 * acting as the default filter for high-potential targets.
 */
export const DEFAULT_SCORE_THRESHOLD = 75;

/**
 * Standardized score increments for the UI Selection Bar.
 * Used by the ScoreThresholdSelector molecule to ensure consistent filtering.
 */
export const SCORE_SELECTION_STEPS = [15, 30, 45, 60, 75, 90, 100];

/**
 * Default crown target for new Clan Voyage events.
 *
 * @remarks
 * [DECISION LOG] TARGET BASELINE:
 * 1600 crowns represents a conservative starting point for small clans,
 * derived from the average activity seen in tier-1 test clans.
 */
export const VOYAGE_DEFAULT_TARGET = 1600;

/**
 * Hard upper bound for Clan Voyage crown targets.
 *
 * @remarks
 * [DECISION LOG] NUMERIC CAP:
 * Prevents numeric overflow and UI distortion in progress charts.
 */
export const VOYAGE_MAX_TARGET = 9999;

/**
 * CORE TIMING CONSTANTS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes UI/UX stability delays and orchestration timeouts.
 */

/**
 * Delay to avoid clashing with initial render/font loading in headless environments.
 *
 * @remarks
 * [DECISION LOG] STABILITY WINDOW:
 * A 1.5s delay ensures that web fonts and base layout are stabilized before
 * the app concludes its initial loading state, preventing cumulative layout shift (CLS).
 */
export const UI_STABILITY_DELAY = 1500;

/**
 * Minimum interval between badge updates to prevent API flooding.
 *
 * @remarks
 * [THREAT:] OS RATE LIMITING:
 * Some platforms (especially Android/iOS via PWA wrappers) may rate-limit or
 * ignore rapid, consecutive updates to the application badge.
 */
export const BADGE_UPDATE_DEBOUNCE = 1500;

/**
 * Base delay for exponential backoff during failed badge updates.
 *
 * @remarks
 * [DECISION LOG] RETRY BACKOFF:
 * 800ms provides a sufficient window for transient network recovery without
 * introducing perceptible lag in the background update lifecycle.
 */
export const BADGE_RETRY_BASE_DELAY = 800;

export type BlitzSpeed = "fast" | "medium" | "slow";

export const BLITZ_SPEED_DELAYS: Record<BlitzSpeed, number> = {
  fast: 850,
  medium: 6000,
  slow: 12000,
};

export const BLITZ_SPEED_DEFAULT: BlitzSpeed = "fast";

/**
 * Default throttle for manual deep-link clicks.
 *
 * @remarks
 * [DECISION LOG] HUMAN EMULATION:
 * 850ms mimics a fast human interaction speed, staying within acceptable
 * OS-level deep-link polling limits while remaining responsive.
 */
export const BLITZ_THROTTLE_DEFAULT = 850;


/**
 * Safety delay for automated blitz to ensure stable deep-link resolution.
 *
 * @remarks
 * [DECISION LOG] RESOLUTION STABILITY:
 * 4s allows the native OS to process the deep-link and for the target app
 * to reach a stable rendering state before the automated sequencer proceeds.
 */
export const BLITZ_SAFETY_DELAY = 4000;

/**
 * Reset timer for auto-advance after manual interaction in Blitz Mode.
 *
 * @remarks
 * [DECISION LOG] INTERACTION COOLDOWN:
 * A 2s pause ensures that manual user actions are not immediately overridden
 * by the automated sequencer, allowing for human-in-the-loop adjustments.
 */
export const BLITZ_RECOVERY_DELAY = 2000;

/**
 * Delay before concluding the Blitz sequence.
 *
 * @remarks
 * [DECISION LOG] SEQUENCE TERMINATION:
 * A 1.5s terminal delay provides visual closure for the user before the
 * Blitz overlay or status indicator is dismissed.
 */
export const BLITZ_COMPLETION_DELAY = 1500;

/**
 * Micro-delay for processing the internal batch queue.
 *
 * @remarks
 * [DECISION LOG] BATCH PACING:
 * 150ms provides enough breathing room for the JS main thread to process
 * DOM updates between rapid queue shifts.
 */
export const BLITZ_BATCH_SHIFT_DELAY = 150;

/**
 * Non-blocking timeout for blocked IndexedDB deletions.
 *
 * @remarks
 * [THREAT:] DATABASE LOCKS:
 * In multi-tab environments, an IndexedDB instance may be locked by another
 * context, preventing deletion of legacy or maintenance data.
 *
 * [DECISION LOG] NON-BLOCKING EVICTION:
 * A 1.5s timeout ensures maintenance tasks do not hang the UI thread if
 * a resource is contested.
 */
export const STORAGE_DELETE_TIMEOUT = 1500;

/**
 * Notification tag used to deduplicate and manage recruit push notifications.
 * Must be kept in sync with the PWA manifest shortcut and sw.ts routing.
 */
export const NOTIFICATION_TAG_RECRUIT = "com.app.RECRUIT_UPDATES";

/**
 * Shortcut ID referenced in push notification payloads for native deep linking
 * into the headhunter route via the PWA app shortcut.
 */
export const NOTIFICATION_SHORTCUT_ID = "recruit_shortcut_id";

/**
 * AUTHORITATIVE STORAGE CONSTANTS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes IndexedDB configuration to ensure consistency
 * between the main UI thread and the Service Worker substrate.
 */

/** Primary database name for local persistence. */
export const STORAGE_DB_NAME = "clash_manager_v14";
/** Standard object store name for key-value pairs. */
export const STORAGE_STORE_NAME = "keyval";
/** Current IndexedDB schema version. */
export const STORAGE_DB_VERSION = 1;

/** Legacy database name for migration logic. */
export const STORAGE_LEGACY_DB_NAME = "clash_manager_db";
/** Legacy object store name for migration logic. */
export const STORAGE_LEGACY_STORE_NAME = "key_val_store";

/** Registry of all deprecated database names to be purged during maintenance. */
export const STORAGE_DEPRECATED_DB_NAMES = [
  "clash_manager_db",
  "clash_manager",
  "clash-manager",
  "clash_manager_v1",
  "clash_manager_v2",
  "clash_manager_v3",
  "clash_manager_v4",
  "clash_manager_v5",
  "clash_manager_v6",
  "clash_manager_v7",
  "clash_manager_v8",
  "clash_manager_v9",
  "clash_manager_v10",
  "clash_manager_v11",
  "clash_manager_v12",
  "clash_manager_v13"
];

/** Cooldown duration for backend manual updates in seconds. */
export const BACKEND_REFRESH_COOLDOWN_SECONDS = 60;

/** Cooldown interval timer step in milliseconds. */
export const BACKEND_REFRESH_COOLDOWN_INTERVAL = 1000;

/** Hard safety limit on total simulation iterations in the laboratory engine. */
export const SIMULATION_MAX_ITERATIONS = 5000;
