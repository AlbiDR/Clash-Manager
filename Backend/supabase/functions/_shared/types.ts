// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Shared Pipeline Types
 * Universal interfaces for telemetry, orchestration, and domain models.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture.
 * These types act as the backbone for the Hexa-Stage pipeline, ensuring
 * that telemetry and ingestion results are consistent across all stages.
 */

/**
 * Represents a single audit log entry for pipeline tracking.
 */
export interface AuditEntry {
  /** ISO timestamp of the event. */
  timestamp: string;
  /** The specific pipeline stage (S1-S6) where the event occurred. */
  stage: string;
  /** The semantic action performed. */
  action:
    | "triggered"
    | "called"
    | "run"
    | "terminated"
    | "resulted_data"
    | "integrity_checked"
    | "error";
  /** Optional payload containing event-specific metadata. */
  details?: unknown;
}

/**
 * Standardized result structure for the 'ingest-royale-data' pipeline.
 *
 * @remarks
 * Each property represents the outcome of a specific functional stage within the
 * unified ingestion engine.
 */
export interface IngestionResult {
  /** Outcome of the discovery stage (finding new players). */
  discovery: { harvested: number; duplicates: number; error?: string };
  /** Outcome of profile synchronization. */
  profile: { success: boolean; error?: string };
  /** Outcome of member roster updates. */
  members: { success: boolean; error?: string };
  /** Outcome of race/river race state updates. */
  race: { success: boolean; error?: string };
  /** Outcome of war log ingestion. */
  warlog: { success: boolean; error?: string };
  /** Outcome of battle history ingestion. */
  battles: { success: boolean; error?: string };
  /** Technical diagnostics for the ingestion run. */
  diagnostics: { clan_tag: string; duration_ms: number };
}

/**
 * Performance and discovery statistics for the 'headhunter-scanner' engine.
 */
export interface ScannerStats {
  /** Number of target players identified for scanning. */
  discovery_targets: number;
  /** Number of shadow/hidden targets discovered. */
  discovery_shadow?: number;
  /** Number of players discovered via tournament scanning. */
  discovery_tournament?: number;
  /** Total number of profiles successfully scanned. */
  profiles_scanned: number;
  /** Total number of recruits updated or created in the database. */
  recruits_ingested: number;
  /** Number of entirely new recruits found during this run. */
  new_recruits?: number;
  /** Number of new recruits meeting active threshold criteria. */
  new_recruits_active?: number;
  /** Number of new recruits relegated to the bench. */
  new_recruits_benched?: number;
  /** Number of new recruits entering the Top 50 performance tier. */
  new_recruits_top50?: number;
  /** Number of existing recruits whose data was refreshed. */
  refreshed_recruits?: number;
  /** Distribution of ingested recruits by discovery source. */
  ingested_by_source?: Record<string, number>;
  /** Highest Recruiter Point of Satisfaction (RPoS) found in the batch. */
  highest_rpos?: number;
  /** Lowest Recruiter Point of Satisfaction (RPoS) found in the batch. */
  lowest_rpos?: number;
  /** Total number of stale recruits processed for re-scanning. */
  rescans_processed?: number;
  /** Number of 'dead' or inactive recruits removed from the index. */
  ghosts_purged?: number;
  /** Collection of non-fatal error messages encountered during scanning. */
  errors: string[];
}
