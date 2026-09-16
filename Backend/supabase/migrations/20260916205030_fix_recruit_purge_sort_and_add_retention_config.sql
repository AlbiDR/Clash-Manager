-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Fix inverted sort in purge_worst_recruits() (was deleting the best-scoring
-- bench candidates and keeping the worst); externalize governance_telemetry
-- retention to config and cut it from 30 to 7 days (it is the largest table
-- in the database, driven mostly by every purge job logging into it); add a
-- retention purge for member_snapshots, which previously had none and grew
-- unbounded. Rationale in the commit message.

BEGIN;

-- 1. Fix inverted sort in purge_worst_recruits(): ORDER BY ... ASC NULLS FIRST
--    OFFSET 500 skipped the 500 worst scores and deleted everything after them,
--    i.e. the best-scoring candidates. Flip to DESC NULLS LAST, matching the
--    direction rotate_recruits() already uses for the same score column.
CREATE OR REPLACE FUNCTION substrate.purge_worst_recruits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- First, aggressively purge corrupted entries (score 0) older than 12h
    DELETE FROM drivers.recruits
    WHERE raw_potential_score = 0
      AND found_date < NOW() - INTERVAL '12 hours';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Second, enforce the 500-recruit cap by score, excluding protected statuses
    WITH to_delete AS (
        SELECT player_tag
        FROM drivers.recruits
        WHERE status NOT IN ('INVITED', 'ACTIVE') -- Protect high-value leads
        ORDER BY raw_potential_score DESC NULLS LAST
        OFFSET 500 -- Keep top 500
    )
    DELETE FROM drivers.recruits
    WHERE player_tag IN (SELECT player_tag FROM to_delete);

    DECLARE
        v_cap_count INTEGER;
    BEGIN
        GET DIAGNOSTICS v_cap_count = ROW_COUNT;
        v_count := v_count + v_cap_count;
    END;

    -- Cleanup orphaned ledger entries
    DELETE FROM drivers.recruit_ledger
    WHERE player_tag NOT IN (SELECT player_tag FROM drivers.recruits)
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Purged ' || v_count || ' recruits (corrupted or low-score) to maintain pipeline health.');
    END IF;

    RETURN v_count;
END;
$function$;

-- 2. Externalize governance_telemetry retention to config (was hardcoded 30
--    days), and cut the default to 7 days.
INSERT INTO substrate.config (key, value, description) VALUES
    ('GOVERNANCE_TELEMETRY_KEEP_DAYS', '7',
     'Days of governance_telemetry retained before purge. Every purge/maintenance job logs into this table, so it is the primary driver of its size.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION substrate.purge_governance_telemetry()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_keep_days integer;
BEGIN
    v_keep_days := COALESCE(substrate.config_int('GOVERNANCE_TELEMETRY_KEEP_DAYS'), 7);
    DELETE FROM substrate.governance_telemetry
    WHERE created_at < (now() - (v_keep_days || ' days')::interval);
END;
$function$;

-- 3. New: member_snapshots had no retention at all and grows forever (one row
--    per member per day). Add a config-driven 90-day purge.
INSERT INTO substrate.config (key, value, description) VALUES
    ('MEMBER_SNAPSHOTS_KEEP_DAYS', '90',
     'Days of drivers.member_snapshots (daily per-member telemetry) retained before purge. Previously had no retention and grew unbounded.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION substrate.purge_stale_member_snapshots()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_keep_days integer;
    v_count integer;
BEGIN
    v_keep_days := COALESCE(substrate.config_int('MEMBER_SNAPSHOTS_KEEP_DAYS'), 90);

    DELETE FROM drivers.member_snapshots
    WHERE snapshot_date < (now() - (v_keep_days || ' days')::interval)::date;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Pruned ' || v_count || ' stale member snapshots (' || v_keep_days || '-day threshold).');
    END IF;

    RETURN v_count;
END;
$function$;

-- 4. Wire the new snapshot purge into the nightly maintenance cycle.
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

    -- Consolidate voyage history before player purges fire so that
    -- contribution data is safely archived before cascade deletes run.
    PERFORM drivers.consolidate_voyage_history();

    -- L2 Domain Purges
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_inactive_members();
    PERFORM substrate.purge_stale_battles();
    PERFORM substrate.purge_stale_member_snapshots();
    PERFORM substrate.purge_worst_recruits();
    PERFORM substrate.purge_orphan_players();

    -- Safety-net: log any history rows that survived beyond the cascade.
    PERFORM drivers.purge_stale_voyage_history();

    PERFORM substrate.purge_recruit_ledger();
    PERFORM substrate.purge_stale_recruits();

    PERFORM substrate.rotate_recruits();

    -- L3 Control-plane hygiene. Fold before prune, same ordering discipline as
    -- consolidate_voyage_history() above. Isolated so it cannot abort the rest.
    BEGIN
        PERFORM substrate.fold_cron_history();
        PERFORM substrate.purge_cron_history();
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('SYSTEM_PURGE', 'ERROR', 'Cron history maintenance failed: ' || SQLERRM);
    END;

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Raw logs, ledgers, stale battles, snapshots, orphans, voyage and cron history pruned. Voyages finalized.',
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
$function$;

COMMIT;
