-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Headhunter Pipeline Hardening & Maintenance Consolidation
 * Phase 4: Operational Integrity & Nomenclature Alignment
 * 
 * This migration fixes regressions in the nightly maintenance cycle,
 * aligns procedural logic with the new Domain_Role nomenclature (player_tag, player_name),
 * and ensures robust telemetry for all maintenance operations.
 */

-- 1. REFACTOR: drivers.purge_expired_blacklist
-- Alignment: expires_at, player_tag
CREATE OR REPLACE FUNCTION drivers.purge_expired_blacklist()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM drivers.recruit_blacklist
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('BLACKLIST_PURGE', 'SUCCESS', 'Evicted ' || v_deleted_count || ' expired entries from recruit blacklist.');
    END IF;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION drivers.purge_expired_blacklist() IS 'Purges expired entries from the recruit blacklist and logs to telemetry.';

-- 2. REFACTOR: substrate.purge_clanned_recruits
-- Alignment: player_tag, player_name, JOINED_US event
CREATE OR REPLACE FUNCTION substrate.purge_clanned_recruits()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_rec   RECORD;
BEGIN
    FOR v_rec IN
        SELECT r.player_tag, r.player_name, r.raw_potential_score
        FROM   drivers.recruits r
        INNER JOIN drivers.members m ON m.player_tag = r.player_tag
    LOOP
        -- Narrative event: recruit graduated to membership
        INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
        VALUES (
            v_rec.player_tag,
            v_rec.player_name,
            'JOINED_US',
            v_rec.raw_potential_score,
            v_rec.raw_potential_score,
            'Recruit joined the clan; auto-purged from headhunter queue.'
        );

        DELETE FROM drivers.recruits WHERE player_tag = v_rec.player_tag;
        v_count := v_count + 1;
    END LOOP;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('RECRUIT_PURGE', 'SUCCESS', v_count || ' recruits graduated to members and were purged from the queue.');
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION substrate.purge_clanned_recruits() IS 'Removes recruits who have joined the clan, writing a JOINED_US event to the ledger.';

-- 3. REFACTOR: substrate.purge_stale_heritage
-- Alignment: last_seen_at (30-day horizon)
DROP FUNCTION IF EXISTS substrate.purge_stale_heritage() CASCADE;
CREATE OR REPLACE FUNCTION substrate.purge_stale_heritage()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM drivers.heritage_ledger
    WHERE last_seen_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('HERITAGE_PURGE', 'SUCCESS', 'Purged ' || v_count || ' stale heritage records (30-day horizon).');
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION substrate.purge_stale_heritage() IS 'Clinical cleanup of the heritage ledger with telemetry logging.';

-- 4. CONSOLIDATE: substrate.execute_nightly_maintenance
-- Orchestrates all maintenance tasks and updates the unified heartbeat.
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void AS $$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Heartbeat: Signal Start
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE 
    SET status = 'RUNNING', last_triggered_at = EXCLUDED.last_triggered_at, last_message = EXCLUDED.last_message;

    -- 2. Execute Purge Routine
    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    
    -- 3. Execute Operational Routine
    PERFORM substrate.rotate_recruits();

    -- 4. Heartbeat: Signal Completion
    UPDATE substrate.pipeline_heartbeat 
    SET status = 'COMPLETED', 
        last_success_at = NOW(), 
        last_message = 'Maintenance complete. Raw logs, telemetry, discovery, and heritage purged. Recruitment rotated.',
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

COMMENT ON FUNCTION substrate.execute_nightly_maintenance() IS 'The authoritative orchestrator for all nightly system maintenance tasks.';

-- 5. CRON AUDIT: Ensure Nightly Schedule
-- Schedules the maintenance for 03:00 UTC every day.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule existing if it exists
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-maintenance') THEN
            PERFORM cron.unschedule('nightly-maintenance');
        END IF;
        -- Re-schedule with explicit UTC timing
        PERFORM cron.schedule('nightly-maintenance', '0 3 * * *', 'SELECT substrate.execute_nightly_maintenance()');
    END IF;
END $$;
