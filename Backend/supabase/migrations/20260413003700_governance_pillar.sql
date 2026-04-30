-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Pillar XI: Infrastructure Oversight (Governance)
-- Centralizes system health and resource monitoring.

CREATE TABLE IF NOT EXISTS substrate.governance_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE substrate.governance_telemetry IS 'Infrastructure audit log for ingestion health and resource monitoring.';

-- Governance Reporting View
-- CLINICAL RESET: Mandatory drop to allow column evolution
DROP VIEW IF EXISTS features.governance_report CASCADE;

CREATE VIEW features.governance_report AS
WITH ingestion_stats AS (
    SELECT 
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '24 hours') as attempts_24h,
        MAX(ingested_at) as last_ingestion
    FROM substrate.raw_river_race
),
heritage_stats AS (
    SELECT 
        COUNT(*) as total_heritage_records,
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours') as snapshots_24h
    FROM drivers.heritage_ledger
),
storage_stats AS (
    -- Estimating total database size (Supabase Free Tier is 500MB)
    SELECT 
        pg_database_size(current_database()) as database_size_bytes,
        pg_size_pretty(pg_database_size(current_database())) as database_size_friendly
)
SELECT 
    i.*,
    h.*,
    s.*,
    CASE 
        WHEN s.database_size_bytes > 450 * 1024 * 1024 THEN 'CRITICAL_STORAGE'
        WHEN s.database_size_bytes > 400 * 1024 * 1024 THEN 'WARNING_STORAGE'
        ELSE 'HEALTHY'
    END as storage_status
FROM ingestion_stats i, heritage_stats h, storage_stats s;

COMMENT ON VIEW features.governance_report IS 'System health dashboard summary for the PWA.';
