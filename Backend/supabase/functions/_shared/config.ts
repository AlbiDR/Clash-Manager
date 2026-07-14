// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Shared Scanner Configuration (@shared)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Centralized business thresholds, batch limits, and discovery
 * parameters used across the 'headhunter-scanner' and 'ingest-royale-data'
 * pipelines.
 *
 * ARCHITECTURE:
 *    - Constants: Direct, immutable business rules derived from the ADR.
 * ============================================================================
 */

/**
 * PROFILER: Maximum number of candidate tags to profile in a single run.
 * Prevents memory exhaustion and execution timeouts in Edge Functions.
 */
export const PROFILER_BATCH_CEILING = 1000;

/**
 * PROFILER: Time window for filtering recently scanned recruits.
 * Prevents redundant API calls for recruits scanned in the last 30 minutes.
 */
export const RECENT_SCAN_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * RESCAN: Maximum number of stale recruits to re-scan in a single run.
 */
export const RESCAN_BATCH_LIMIT = 250;

/**
 * SHADOW SCOUT: Number of opponent tags to harvest from recent battle logs.
 */
export const SHADOW_DISCOVERY_LIMIT = 75;

/**
 * NATIVE DISCOVERY: Keyword substrate for broad-scanning open tournaments.
 */
export const DISCOVERY_KEYWORDS = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int"];

/**
 * BATCH PROCESSING: Standard concurrency levels.
 */
export const CONCURRENCY_PROFILER = 40;
export const CONCURRENCY_RESCAN = 10;
export const CONCURRENCY_DISCOVERY_KEYWORDS = 3;
export const CONCURRENCY_DISCOVERY_TOURNAMENTS = 5;

/**
 * HARVESTER: Maximum number of country searches attempted concurrently during
 * International harvest.
 */
export const MAX_HARVEST_EPOCHS = 15;

/**
 * HARVESTER: Major country IDs for global harvest fallback during early-season
 * Path of Legends unpopulation.
 */
export const TOP_COUNTRY_IDS = [
  "57000120", // United States
  "57000095", // Spain
  "57000038", // Brazil
  "57000117", // Japan
  "57000085", // France
  "57000091", // Germany
];

/**
 * HARVESTER: Target player floors for discovery results.
 */
export const TARGET_HARVEST_FLOOR = 80;
export const MIN_LOCAL_POL_FLOOR = 10;
