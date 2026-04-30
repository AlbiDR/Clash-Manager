-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MAINTENANCE: Prune Inactive Members
-- Deletes members who have been inactive for more than 30 days.
-- =============================================================================

CREATE OR REPLACE FUNCTION substrate.purge_inactive_members()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM drivers.members
    WHERE is_active = FALSE
      AND updated_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Pruned ' || v_count || ' inactive members (30-day threshold).');
    END IF;
END;
$$;

-- Update the nightly maintenance routine to include this purge.
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'substrate', 'drivers', 'public' AS $$
DECLARE v_start_time TIMESTAMPTZ := NOW();
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
    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Watchdog performed. All purges (including leavers) executed. Recruitment rotated.',
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
END; $$;
