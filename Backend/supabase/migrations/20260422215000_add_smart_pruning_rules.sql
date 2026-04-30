-- 1. Create purge_stale_battles
CREATE OR REPLACE FUNCTION substrate.purge_stale_battles()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM drivers.player_battles WHERE battle_time < NOW() - INTERVAL '1 month';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Pruned ' || v_count || ' stale player battles (1-month threshold).');
    END IF;
    
    RETURN v_count;
END;
$$;

-- 2. Create purge_worst_recruits
CREATE OR REPLACE FUNCTION substrate.purge_worst_recruits()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH to_delete AS (
        SELECT player_tag 
        FROM drivers.recruits
        WHERE status != 'ARCHIVED'
        ORDER BY raw_potential_score DESC NULLS LAST
        OFFSET 500
    )
    DELETE FROM drivers.recruits
    WHERE player_tag IN (SELECT player_tag FROM to_delete);
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    -- Cleanup orphaned ledger entries
    DELETE FROM drivers.recruit_ledger
    WHERE player_tag NOT IN (SELECT player_tag FROM drivers.recruits)
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Evicted ' || v_count || ' recruits to enforce the 500 max cap limit.');
    END IF;

    RETURN v_count;
END;
$$;

-- 3. Create purge_orphan_players
CREATE OR REPLACE FUNCTION substrate.purge_orphan_players()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM drivers.players p 
    WHERE NOT EXISTS (SELECT 1 FROM drivers.members m WHERE m.player_tag = p.player_tag) 
      AND NOT EXISTS (SELECT 1 FROM drivers.recruits r WHERE r.player_tag = p.player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.player_battles b WHERE b.player_tag = p.player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.war_activity wa WHERE wa.player_tag = p.player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.war_history wh WHERE wh.player_tag = p.player_tag);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Purged ' || v_count || ' orphaned players.');
    END IF;

    RETURN v_count;
END;
$$;

-- 4. Update execute_nightly_maintenance
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
    
    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Watchdog performed. All purges (including leavers, recruits, battles, and orphans) executed. Recruitment rotated.',
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
