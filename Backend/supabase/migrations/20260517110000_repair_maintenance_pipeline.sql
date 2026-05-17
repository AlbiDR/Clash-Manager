-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
REPAIR MAINTENANCE PIPELINE & RAW LOG PURGING
----------------------------------------------------------------------------
This migration addresses two critical janitor pipeline regressions:

1. Modifies substrate.purge_raw_logs() to remove the defunct reference to
   substrate.raw_scout_logs, enabling successful 24-hour log rotation.
2. Restores the full suite of L2 domain pruning rules (stale battles,
   worst recruits, orphan players, recruit ledger, stale recruits) to
   substrate.execute_nightly_maintenance(), ensuring long-term quota health.
============================================================================
*/

-- 1. Repair L0 Raw Log Purging
CREATE OR REPLACE FUNCTION substrate.purge_raw_logs(p_retention_hours integer DEFAULT 24)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    DELETE FROM substrate.raw_clan_profile WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_clan_members WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_river_race   WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_war_log      WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('SYSTEM_PURGE', 'SUCCESS',
            'Raw logs older than ' || p_retention_hours || ' hours successfully evicted.');
END; $function$;

-- 2. Restore Omitted Smart Pruning Rules to Nightly Maintenance
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
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

    -- L0 Substrate Purges
    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    PERFORM substrate.finalize_expired_voyages();
    
    -- L2 Domain Purges (Restored from May 3 / May 16 omissions)
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_inactive_members();
    PERFORM substrate.purge_stale_battles();
    PERFORM substrate.purge_worst_recruits();
    PERFORM substrate.purge_orphan_players();
    PERFORM substrate.purge_recruit_ledger();
    PERFORM substrate.purge_stale_recruits();
    
    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Raw logs, ledgers, stale battles, and orphans pruned. Voyages finalized.',
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
END; $function$;
