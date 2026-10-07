-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE TABLE substrate.sync_snapshot_state (
    snapshot_name text PRIMARY KEY
        CHECK (snapshot_name IN ('roster', 'headhunter')),
    generation bigint NOT NULL DEFAULT 0
        CHECK (generation >= 0),
    refreshed_at timestamp with time zone
);

INSERT INTO substrate.sync_snapshot_state (snapshot_name, generation, refreshed_at)
VALUES ('roster', 0, NULL), ('headhunter', 0, NULL);

ALTER TABLE substrate.sync_snapshot_state ENABLE ROW LEVEL SECURITY;

-- Keep the metadata private. The public endpoint below is the only client read
-- path; its owner can read this table, while client roles have no table access.
REVOKE ALL ON TABLE substrate.sync_snapshot_state FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA features TO anon;

CREATE FUNCTION features.sync_snapshot_marker()
RETURNS TABLE (
    snapshot_name text,
    generation bigint,
    refreshed_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_database_role text := current_setting('role', true);
    v_jwt jsonb := auth.jwt();
BEGIN
    -- PostgREST selects this database role from the verified request context.
    -- Publishable-key requests without an Auth session have no JWT, so the
    -- active anon role is authoritative; if claims exist, reject conflicts.
    IF v_database_role IS DISTINCT FROM 'anon'
       OR (v_jwt IS NOT NULL AND v_jwt ? 'role'
           AND v_jwt ->> 'role' IS DISTINCT FROM 'anon') THEN
        RAISE EXCEPTION 'sync snapshot marker requires the anon request role'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT snapshot_state.snapshot_name,
           snapshot_state.generation,
           snapshot_state.refreshed_at
    FROM substrate.sync_snapshot_state AS snapshot_state
    ORDER BY snapshot_state.snapshot_name;
END;
$function$;

REVOKE ALL ON FUNCTION features.sync_snapshot_marker() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION features.sync_snapshot_marker() TO anon;

COMMENT ON TABLE substrate.sync_snapshot_state IS
    'Private source of truth for successful materialized roster and headhunter refresh generations.';

COMMENT ON FUNCTION features.sync_snapshot_marker() IS
    'Read-only GET-compatible public RPC returning roster and headhunter snapshot-content markers. Requires the server-selected anon request role and rejects conflicting JWT role claims; this is distinct from pipeline heartbeat freshness and live blacklist or voyage changes.';

CREATE OR REPLACE FUNCTION substrate.refresh_materialized_view(p_relation regclass)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_lock_timeout text;
    v_snapshot_name text;
BEGIN
    SELECT value INTO v_lock_timeout
    FROM substrate.config
    WHERE key = 'MATERIALIZED_REFRESH_LOCK_TIMEOUT';

    IF p_relation = 'features.roster_materialized'::regclass THEN
        v_snapshot_name := 'roster';
    ELSIF p_relation = 'features.headhunter_materialized'::regclass THEN
        v_snapshot_name := 'headhunter';
    END IF;

    -- Transaction-local, so the caller's own lock budget is restored on exit.
    PERFORM set_config('lock_timeout', COALESCE(v_lock_timeout, '5s'), true);
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %s', p_relation);

    IF v_snapshot_name IS NOT NULL THEN
        UPDATE substrate.sync_snapshot_state
        SET generation = generation + 1,
            refreshed_at = clock_timestamp()
        WHERE snapshot_name = v_snapshot_name;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'sync snapshot marker row is missing for %', v_snapshot_name;
        END IF;
    END IF;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MATERIALIZED_REFRESH', 'ERROR',
            p_relation::text || ' refresh failed: ' || SQLERRM);
    RETURN false;
END;
$function$;

COMMENT ON FUNCTION substrate.refresh_materialized_view(regclass) IS
    'Refreshes one snapshot CONCURRENTLY under the configured lock timeout. Advances its contents marker in the same transaction only after refresh succeeds. Returns false and records MATERIALIZED_REFRESH telemetry on error.';

REVOKE EXECUTE ON FUNCTION substrate.refresh_materialized_view(regclass)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION substrate.refresh_materialized_view(regclass)
    TO service_role;

COMMIT;
