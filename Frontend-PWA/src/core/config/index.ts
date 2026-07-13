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
 */
export const DATA_STALENESS_THRESHOLD = 1000 * 60 * 30; // 30 minutes

/**
 * Logical representation of staleness in minutes for UI and status resolution.
 */
export const DATA_STALENESS_MINUTES = 30;

/**
 * Threshold for triggering a background refresh on app visibility change.
 * If the app has been hidden for more than 30 minutes, a fresh sync is initiated.
 */
export const VISIBILITY_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes

/**
 * Default score threshold used for recruitment prioritization and batch selection.
 */
export const DEFAULT_SCORE_THRESHOLD = 75;

/**
 * Standardized score increments for the UI Selection Bar.
 */
export const SCORE_SELECTION_STEPS = [15, 30, 45, 60, 75, 90, 100];

/**
 * Default crown target for new Clan Voyage events.
 */
export const VOYAGE_DEFAULT_TARGET = 1600;

/**
 * Hard upper bound for Clan Voyage crown targets.
 */
export const VOYAGE_MAX_TARGET = 9999;

/**
 * CORE TIMING CONSTANTS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes UI/UX stability delays and orchestration timeouts.
 */

/** Delay to avoid clashing with initial render/font loading in headless environments. */
export const UI_STABILITY_DELAY = 1500;
/** Minimum interval between badge updates to prevent API flooding. */
export const BADGE_UPDATE_DEBOUNCE = 1500;
/** Base delay for exponential backoff during failed badge updates. */
export const BADGE_RETRY_BASE_DELAY = 800;
/** Default throttle for manual deep-link clicks. */
export const BLITZ_THROTTLE_DEFAULT = 850;
/** Safety delay for automated blitz to ensure stable deep-link resolution. */
export const BLITZ_SAFETY_DELAY = 4000;
/** Reset timer for auto-advance after manual interaction in Blitz Mode. */
export const BLITZ_RECOVERY_DELAY = 2000;
/** Delay before concluding the Blitz sequence. */
export const BLITZ_COMPLETION_DELAY = 1500;
/** Micro-delay for processing the internal batch queue. */
export const BLITZ_BATCH_SHIFT_DELAY = 150;
/** Non-blocking timeout for blocked IndexedDB deletions. */
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
