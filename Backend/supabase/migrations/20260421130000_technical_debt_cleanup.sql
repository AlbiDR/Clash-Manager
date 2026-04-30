-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Technical Debt Cleanup & Infrastructure Hardening
 * Phase 3: Lean Pruning & Security Audit
 */

-- 1. CLEANUP: PURGE REDUNDANT LOGIC
-- These functions have been superseded by centralized logic in substrate schema.
DROP FUNCTION IF EXISTS drivers.purge_clanned_recruits();
DROP FUNCTION IF EXISTS substrate.purge_stale_raw_logs(integer);

-- 2. ENHANCE: CENTRALIZED PURGE LOGIC
-- Unify raw log purging with configurable retention and telemetry.
CREATE OR REPLACE FUNCTION substrate.purge_raw_logs(p_retention_hours int DEFAULT 24)
RETURNS void AS $$
BEGIN
    DELETE FROM substrate.raw_clan_profile WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_clan_members WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_river_race WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_war_log WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_scout_logs WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('SYSTEM_PURGE', 'SUCCESS', 'Raw logs older than ' || p_retention_hours || ' hours successfully evicted.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. SECURITY: RLS HARDENING
-- Ensure the last remaining table has RLS enabled.
ALTER TABLE substrate.pipeline_heartbeat ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Heartbeat Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Read Access' AND tablename = 'pipeline_heartbeat') THEN
        CREATE POLICY "Authenticated Read Access" ON substrate.pipeline_heartbeat FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service Role Full Access' AND tablename = 'pipeline_heartbeat') THEN
        CREATE POLICY "Service Role Full Access" ON substrate.pipeline_heartbeat FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. INTEGRITY: TAG VALIDATION REGEX
-- Enforce the authoritative Royale API tag format across the stack.
ALTER TABLE drivers.clans DROP CONSTRAINT IF EXISTS check_clan_tag_format;
ALTER TABLE drivers.clans ADD CONSTRAINT check_clan_tag_format CHECK (clan_tag ~* '^#[0289CGJLPQRUVY]+$');

ALTER TABLE drivers.members DROP CONSTRAINT IF EXISTS check_player_tag_format;
ALTER TABLE drivers.members ADD CONSTRAINT check_player_tag_format CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$');

ALTER TABLE drivers.recruits DROP CONSTRAINT IF EXISTS check_player_tag_format;
ALTER TABLE drivers.recruits ADD CONSTRAINT check_player_tag_format CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$');

ALTER TABLE drivers.war_activity DROP CONSTRAINT IF EXISTS check_player_tag_format;
ALTER TABLE drivers.war_activity ADD CONSTRAINT check_player_tag_format CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$');

ALTER TABLE drivers.war_history DROP CONSTRAINT IF EXISTS check_player_tag_format;
ALTER TABLE drivers.war_history ADD CONSTRAINT check_player_tag_format CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$');

ALTER TABLE drivers.player_battles DROP CONSTRAINT IF EXISTS check_player_tag_format;
ALTER TABLE drivers.player_battles ADD CONSTRAINT check_player_tag_format CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$');

ALTER TABLE drivers.recruit_blacklist DROP CONSTRAINT IF EXISTS check_player_tag_format;
ALTER TABLE drivers.recruit_blacklist ADD CONSTRAINT check_player_tag_format CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$');

-- 5. PERFORMANCE: MISSION-CRITICAL INDICES
CREATE INDEX IF NOT EXISTS idx_members_player_tag ON drivers.members(player_tag);
CREATE INDEX IF NOT EXISTS idx_war_activity_player_tag_week ON drivers.war_activity(player_tag, week_id);
CREATE INDEX IF NOT EXISTS idx_player_battles_player_tag ON drivers.player_battles(player_tag);
CREATE INDEX IF NOT EXISTS idx_recruits_player_tag ON drivers.recruits(player_tag);

-- 6. DOCUMENTATION: SCHEMA DOCSTRINGS
COMMENT ON TABLE substrate.pipeline_heartbeat IS 'L0 Substrate: High-fidelity registry for tracking pipeline health and execution status.';
COMMENT ON COLUMN substrate.pipeline_heartbeat.status IS 'Current operational state of the component (IDLE, RUNNING, COMPLETED, FAILED).';

COMMENT ON TABLE substrate.governance_telemetry IS 'L0 Substrate: Central audit log for system events and error propagation.';
COMMENT ON TABLE substrate.raw_scout_logs IS 'L0 Substrate: Raw JSON buffer for player discovery. Shredded into drivers.recruits.';

COMMENT ON TABLE drivers.members IS 'L2 Drivers: The live consolidated roster of all tracked clan members.';
COMMENT ON TABLE drivers.recruits IS 'L2 Drivers: The active recruitment queue for the headhunter pipeline.';
COMMENT ON TABLE drivers.recruit_ledger IS 'L2 Drivers: Event-sourced history of recruit transitions and scoring shifts.';

-- 7. CRON FIX: AUTHORIZATION & TIMEOUT REPAIR
-- We redefine the jobs to include the apikey header and increase the timeout to 60s.
-- This satisfies the gateway requirements and prevents premature timeouts during heavy scans.

DO $$
BEGIN
    PERFORM cron.unschedule('headhunter-scanner-cron');
    PERFORM cron.unschedule('ingest-royale-data-cron');
EXCEPTION WHEN OTHERS THEN
    -- Ignore if they don't exist
END $$;

-- Schedule Headhunter Scanner (Every 30 minutes, staggered to 15 and 45)
SELECT cron.schedule(
    'headhunter-scanner-cron',
    '15,45 * * * *',
    $sql$
    SELECT net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/headhunter-scanner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y2t0YW1sb3lrc3ppbndidHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDQ4MDMsImV4cCI6MjA4OTg4MDgwM30.hLybwvsfXsVre7pVtGL6-gIXZrp_EW7vVHFe-6HkLYE',
            'Authorization', 'Bearer {{INTERNAL_BEARER_TOKEN}}'
        ),
        body := '{"tournaments": ["AUTO"]}'::jsonb,
        timeout_milliseconds := 60000
    );
    $sql$
);

-- Schedule Ingest Royale Data (Every 30 minutes, at 0 and 30)
SELECT cron.schedule(
    'ingest-royale-data-cron',
    '0,30 * * * *',
    $sql$
    SELECT net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/ingest-royale-data',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y2t0YW1sb3lrc3ppbndidHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDQ4MDMsImV4cCI6MjA4OTg4MDgwM30.hLybwvsfXsVre7pVtGL6-gIXZrp_EW7vVHFe-6HkLYE',
            'Authorization', 'Bearer {{INTERNAL_BEARER_TOKEN}}'
        ),
        timeout_milliseconds := 60000
    );
    $sql$
);
