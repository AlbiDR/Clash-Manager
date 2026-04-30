-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Autonomous Headhunter Hardening
 * Phase 5: Pipeline Watchdog & Operational Resilience
 * 
 * This migration implements a self-healing watchdog for stuck pipelines,
 * refines the stale recruit re-scan prioritization, and hardens the 
 * nightly maintenance orchestrator.
 */

-- 1. CLEANUP: Explicitly purge legacy function signatures to resolve NOTICES
DROP FUNCTION IF EXISTS drivers.get_stale_recruits(pg_catalog.int4);
DROP FUNCTION IF EXISTS drivers.get_stale_recruits(integer);

-- 2. REFACTOR: public.get_stale_recruits
-- Prioritize by staleness (oldest first) then quality (RPoS)
CREATE OR REPLACE FUNCTION public.get_stale_recruits(p_limit integer DEFAULT 20)
RETURNS TABLE(player_tag text) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, drivers, substrate
AS $$
BEGIN
    RETURN QUERY
    SELECT r.player_tag
    FROM drivers.recruits r
    WHERE r.last_scan < (NOW() - INTERVAL '48 hours')
      AND r.status = 'ACTIVE'
    ORDER BY r.last_scan ASC, r.raw_potential_score DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_stale_recruits(integer) IS 'Returns ACTIVE recruits not scanned in 48h, prioritizing oldest scans and highest potential.';

-- 3. WATCHDOG: substrate.pipeline_watchdog
-- Resets pipelines that have been 'RUNNING' for more than 2 hours (likely hung)
CREATE OR REPLACE FUNCTION substrate.pipeline_watchdog()
RETURNS INTEGER AS $$
DECLARE
    v_reset_count INTEGER;
BEGIN
    UPDATE substrate.pipeline_heartbeat
    SET status = 'FAILED',
        last_failure_at = NOW(),
        last_message = 'Watchdog timeout: Pipeline exceeded 2-hour execution limit and was force-reset.',
        updated_at = NOW()
    WHERE status = 'RUNNING'
      AND last_triggered_at < (NOW() - INTERVAL '2 hours');
    
    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    IF v_reset_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('WATCHDOG_INTERVENTION', 'WARNING', 'Watchdog force-reset ' || v_reset_count || ' hung pipelines.');
    END IF;

    RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION substrate.pipeline_watchdog() IS 'Identifies and resets hung pipelines to ensure operational continuity.';

-- 4. HARDENING: substrate.execute_nightly_maintenance
-- Integrating watchdog and ensuring strict execution order.
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void AS $$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Watchdog: Rescue any hung pipelines before starting
    PERFORM substrate.pipeline_watchdog();

    -- 2. Heartbeat: Signal Start
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE 
    SET status = 'RUNNING', last_triggered_at = EXCLUDED.last_triggered_at, last_message = EXCLUDED.last_message;

    -- 3. Execute Purge Routine (Clinical Cleanup)
    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    
    -- 4. Execute Operational Routine
    PERFORM substrate.rotate_recruits();

    -- 5. Heartbeat: Signal Completion
    UPDATE substrate.pipeline_heartbeat 
    SET status = 'COMPLETED', 
        last_success_at = NOW(), 
        last_message = 'Maintenance complete. Watchdog performed. All purges executed. Recruitment rotated.',
        updated_at = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';

EXCEPTION WHEN OTHERS THEN
    -- Error Propagation to Telemetry
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MAINTENANCE_FAILURE', 'ERROR', SQLERRM);

    UPDATE substrate.pipeline_heartbeat 
    SET status = 'FAILED', 
        last_failure_at = NOW(), 
        last_message = SQLERRM,
        updated_at = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. CRON AUDIT: Ensure Watchdog runs frequently
-- We schedule a separate watchdog run every hour to catch hung jobs faster.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pipeline-watchdog') THEN
            PERFORM cron.unschedule('pipeline-watchdog');
        END IF;
        -- Run every hour at minute 5
        PERFORM cron.schedule('pipeline-watchdog', '5 * * * *', 'SELECT substrate.pipeline_watchdog()');
    END IF;
END $$;
