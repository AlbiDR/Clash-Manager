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
