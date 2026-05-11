-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
HEADHUNTER MAID EXPANSION & MAINTENANCE HARDENING
----------------------------------------------------------------------------
This migration expands the nightly maintenance logic to handle ledger bloat
and stale recruit management.

1. Implements substrate.purge_recruit_ledger() for noise reduction.
2. Implements substrate.purge_stale_recruits() for lifecycle archiving.
3. Upgrades substrate.execute_nightly_maintenance() to include these purges.
============================================================================
*/

-- 1. Implement Ledger Pruning
CREATE OR REPLACE FUNCTION substrate.purge_recruit_ledger()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count_noise integer;
    v_count_old integer;
BEGIN
    -- Delete noise (PROMOTED/BENCHED) older than 7 days
    DELETE FROM drivers.recruit_ledger
    WHERE event_type IN ('PROMOTED', 'BENCHED')
      AND created_at < now() - interval '7 days';
    
    GET DIAGNOSTICS v_count_noise = ROW_COUNT;

    -- Delete all non-critical entries older than 90 days
    DELETE FROM drivers.recruit_ledger
    WHERE event_type NOT IN ('JOINED_US', 'ACTION_INVITED', 'ACTION_DISCARDED')
      AND created_at < now() - interval '90 days';
      
    GET DIAGNOSTICS v_count_old = ROW_COUNT;

    RETURN coalesce(v_count_noise, 0) + coalesce(v_count_old, 0);
END;
$$;

-- 2. Implement Stale Recruit Archiving
CREATE OR REPLACE FUNCTION substrate.purge_stale_recruits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count integer;
BEGIN
    -- Archive recruits not scanned for 14 days
    WITH archived AS (
        UPDATE drivers.recruits
        SET status = 'ARCHIVED',
            updated_at = now()
        WHERE status IN ('ACTIVE', 'QUEUE', 'BENCHED')
          AND last_scan < now() - interval '14 days'
        RETURNING player_tag
    )
    SELECT count(*) INTO v_count FROM archived;

    RETURN v_count;
END;
$$;

-- 3. Upgrade Nightly Maintenance
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
 RETURNS void
 LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
BEGIN
    PERFORM substrate.pipeline_watchdog();

    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status            = 'RUNNING',
        last_triggered_at = EXCLUDED.last_triggered_at,
        last_message      = EXCLUDED.last_message;

    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    PERFORM substrate.purge_inactive_members();
    
    -- New smart pruning rules
    PERFORM substrate.purge_stale_battles();
    PERFORM substrate.purge_worst_recruits();
    PERFORM substrate.purge_orphan_players();
    
    -- Clinical Maid Additions
    PERFORM substrate.purge_recruit_ledger();
    PERFORM substrate.purge_stale_recruits();
    
    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Ledger pruned. Stale recruits archived. Recruitment rotated.',
        updated_at      = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';

EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MAINTENANCE_FAILURE', 'ERROR', SQLERRM);

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = SQLERRM,
        updated_at      = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';
    RAISE;
END;
$$;
