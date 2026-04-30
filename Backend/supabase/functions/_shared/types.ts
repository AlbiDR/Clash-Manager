// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Shared Pipeline Types
 * Universal interfaces for telemetry, orchestration, and domain models.
 */

export interface AuditEntry {
    timestamp: string;
    stage: string;
    action: 'triggered' | 'called' | 'run' | 'terminated' | 'resulted_data' | 'integrity_checked' | 'error';
    details?: any;
}

export interface StageMetadata {
    status: PipelineStatus;
    duration_ms: number;
    audit_log: AuditEntry[];
    integrity?: {
        checked: boolean;
        passed: boolean;
        details?: string;
    };
}

export interface TelemetryMetadata {
    stage: string;
    current_duration: number;
    audit_log: AuditEntry[];
    [key: string]: any;
}

export interface IngestionResult {
    discovery: { harvested: number; duplicates: number; error?: string };
    profile: { success: boolean; error?: string };
    members: { success: boolean; error?: string };
    race: { success: boolean; error?: string };
    warlog: { success: boolean; error?: string };
    battles: { success: boolean; error?: string };
    diagnostics: { clan_tag: string; duration_ms: number };
}

export interface ScannerStats {
    discovery_targets: number;
    discovery_shadow?: number;
    discovery_tournament?: number;
    profiles_scanned: number;
    recruits_ingested: number;
    rescans_processed?: number;
    errors: string[];
}

export type PipelineStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'DEGRADED' | 'COMPLETE';
