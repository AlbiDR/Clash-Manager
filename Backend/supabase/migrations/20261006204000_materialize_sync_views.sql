-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

-- Every app sync read features.roster_view and features.headhunter_view, which
-- are computed on demand: about 1 s of server time per roster read (mean
-- 980 ms, worst 5.3 s on 2026-10-06) and 470 ms per headhunter read, paid on
-- every poll of every client although the data only changes when a pipeline
-- run completes. Under load the read outran the 6 s anon statement timeout, so
-- the app reported "the server took too long" and a cold start stayed empty.
-- The live views stay the single definition and keep serving pgTAP and
-- diagnostics; the app reads these snapshots of them, refreshed CONCURRENTLY
-- (hence the unique indexes) when the component that changes their inputs
-- reports COMPLETED. A refresh that cannot finish is recorded in telemetry and
-- never fails the completing run.

INSERT INTO substrate.config (key, value, description) VALUES
    ('MATERIALIZED_REFRESH_LOCK_TIMEOUT', '5s',
     'How long a snapshot refresh waits for its lock before stepping aside. Another refresh of the same relation holding the lock is already producing fresher rows, so waiting longer only delays the completing pipeline run.')
ON CONFLICT (key) DO NOTHING;

CREATE MATERIALIZED VIEW IF NOT EXISTS features.roster_materialized AS
SELECT * FROM features.roster_view
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS roster_materialized_player_tag_key
    ON features.roster_materialized (player_tag);

CREATE MATERIALIZED VIEW IF NOT EXISTS features.headhunter_materialized AS
SELECT * FROM features.headhunter_view
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS headhunter_materialized_player_tag_key
    ON features.headhunter_materialized (player_tag);

GRANT SELECT ON features.roster_materialized TO anon, authenticated, service_role;
GRANT SELECT ON features.headhunter_materialized TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW features.roster_materialized IS
    'Snapshot of features.roster_view read by the PWA sync. Refreshed by '
    'substrate.on_pipeline_completed when the ingestor or nightly maintenance '
    'completes. Columns are fixed at creation: a migration that changes the '
    'column set of roster_view must drop and recreate this snapshot.';

COMMENT ON MATERIALIZED VIEW features.headhunter_materialized IS
    'Snapshot of features.headhunter_view read by the PWA sync and the service '
    'worker badge. Refreshed by substrate.on_pipeline_completed when the '
    'scanner, recruit rotation, ingestor or nightly maintenance completes. '
    'Columns are fixed at creation, as for roster_materialized.';

CREATE OR REPLACE FUNCTION substrate.refresh_materialized_view(p_relation regclass)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_lock_timeout text;
BEGIN
    SELECT value INTO v_lock_timeout
    FROM substrate.config
    WHERE key = 'MATERIALIZED_REFRESH_LOCK_TIMEOUT';

    -- Transaction-local, so the caller's own lock budget is restored on exit.
    PERFORM set_config('lock_timeout', COALESCE(v_lock_timeout, '5s'), true);
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %s', p_relation);
    RETURN true;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MATERIALIZED_REFRESH', 'ERROR',
            p_relation::text || ' refresh failed: ' || SQLERRM);
    RETURN false;
END;
$function$;

COMMENT ON FUNCTION substrate.refresh_materialized_view(regclass) IS
    'Refreshes one snapshot CONCURRENTLY under the configured lock timeout. '
    'Returns false and records a MATERIALIZED_REFRESH telemetry row instead of '
    'raising, so a completing pipeline run never fails on its snapshot.';

CREATE OR REPLACE FUNCTION substrate.on_pipeline_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    -- The ingestor and nightly maintenance change members, scoring inputs and
    -- recruits; the scanner and rotation change recruits only. PING and the
    -- Blitz proxy complete many times an hour and touch neither snapshot.
    IF NEW.component_id IN ('ROYALE_DATA_INGESTOR', 'NIGHTLY_MAINTENANCE') THEN
        PERFORM substrate.refresh_materialized_view('features.roster_materialized'::regclass);
    END IF;

    IF NEW.component_id IN ('ROYALE_DATA_INGESTOR', 'NIGHTLY_MAINTENANCE',
                            'HEADHUNTER_SCANNER', 'RECRUIT_ROTATION') THEN
        PERFORM substrate.refresh_materialized_view('features.headhunter_materialized'::regclass);
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION substrate.on_pipeline_completed() IS
    'Row trigger on substrate.pipeline_heartbeat. When a component reports '
    'COMPLETED, refreshes the snapshots whose inputs that component changes.';

DROP TRIGGER IF EXISTS tr_pipeline_completed_refresh ON substrate.pipeline_heartbeat;
CREATE TRIGGER tr_pipeline_completed_refresh
    AFTER INSERT OR UPDATE OF status ON substrate.pipeline_heartbeat
    FOR EACH ROW
    WHEN (NEW.status = 'COMPLETED')
    EXECUTE FUNCTION substrate.on_pipeline_completed();

REVOKE EXECUTE ON FUNCTION substrate.refresh_materialized_view(regclass)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION substrate.on_pipeline_completed()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION substrate.refresh_materialized_view(regclass)
    TO service_role;

COMMIT;
