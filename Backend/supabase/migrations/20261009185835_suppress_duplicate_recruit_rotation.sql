-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

CREATE TABLE substrate.recruit_sync_rotation_guard (
    backend_pid integer NOT NULL,
    transaction_id xid8 NOT NULL,
    nesting_depth integer NOT NULL CHECK (nesting_depth > 0),
    PRIMARY KEY (backend_pid, transaction_id)
);
ALTER TABLE substrate.recruit_sync_rotation_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE substrate.recruit_sync_rotation_guard
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION substrate.tr_fn_rotate_recruits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM substrate.recruit_sync_rotation_guard AS guard
        WHERE guard.backend_pid = pg_backend_pid()
          AND guard.transaction_id = pg_current_xact_id()
    ) THEN
        RETURN NULL;
    END IF;

    IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
    PERFORM substrate.rotate_recruits();
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_changed_rows bigint;
    v_guard_depth integer;
BEGIN
    INSERT INTO substrate.recruit_sync_rotation_guard
        (backend_pid, transaction_id, nesting_depth)
    VALUES (pg_backend_pid(), pg_current_xact_id(), 1)
    ON CONFLICT (backend_pid, transaction_id) DO UPDATE
    SET nesting_depth = substrate.recruit_sync_rotation_guard.nesting_depth + 1
    RETURNING nesting_depth INTO v_guard_depth;

    INSERT INTO drivers.players (player_tag, player_name)
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name = EXCLUDED.player_name,
        updated_at = NOW();

    INSERT INTO drivers.recruits (
        player_tag,
        player_name,
        trophies,
        donations,
        war_wins,
        win_rate,
        cards,
        raw_potential_score,
        score_composition,
        source,
        status,
        last_scan
    )
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT,
        COALESCE((val->>'trophies')::INTEGER, 0),
        COALESCE((val->>'donations')::INTEGER, 0),
        COALESCE((val->>'war_wins')::INTEGER, 0),
        COALESCE((val->>'win_rate')::NUMERIC, 0.0),
        COALESCE((val->>'cards')::INTEGER, 0),
        (val->>'raw_potential_score')::NUMERIC,
        NULLIF(val->'score_composition', 'null'::jsonb),
        COALESCE(NULLIF((val->>'source')::TEXT, ''), 'TOURNAMENT'),
        COALESCE((val->>'status')::drivers.recruit_status, 'ACTIVE'::drivers.recruit_status),
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    WHERE (val->>'raw_potential_score') IS NOT NULL
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name         = EXCLUDED.player_name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        war_wins            = EXCLUDED.war_wins,
        win_rate            = EXCLUDED.win_rate,
        cards               = EXCLUDED.cards,
        raw_potential_score = EXCLUDED.raw_potential_score,
        score_composition   = EXCLUDED.score_composition,
        source              = drivers.recruits.source,
        status              = EXCLUDED.status,
        last_scan           = NOW()
    WHERE
        drivers.recruits.trophies IS DISTINCT FROM EXCLUDED.trophies OR
        drivers.recruits.donations IS DISTINCT FROM EXCLUDED.donations OR
        drivers.recruits.war_wins IS DISTINCT FROM EXCLUDED.war_wins OR
        drivers.recruits.win_rate IS DISTINCT FROM EXCLUDED.win_rate OR
        drivers.recruits.cards IS DISTINCT FROM EXCLUDED.cards OR
        drivers.recruits.raw_potential_score IS DISTINCT FROM EXCLUDED.raw_potential_score OR
        drivers.recruits.score_composition IS DISTINCT FROM EXCLUDED.score_composition OR
        drivers.recruits.status IS DISTINCT FROM EXCLUDED.status OR
        drivers.recruits.last_scan < NOW() - INTERVAL '15 minutes';

    GET DIAGNOSTICS v_changed_rows = ROW_COUNT;

    IF v_changed_rows > 0 THEN
        PERFORM substrate.rotate_recruits();
    END IF;

    IF v_guard_depth = 1 THEN
        DELETE FROM substrate.recruit_sync_rotation_guard
        WHERE backend_pid = pg_backend_pid()
          AND transaction_id = pg_current_xact_id();
    ELSE
        UPDATE substrate.recruit_sync_rotation_guard
        SET nesting_depth = v_guard_depth - 1
        WHERE backend_pid = pg_backend_pid()
          AND transaction_id = pg_current_xact_id();
    END IF;
END;
$function$;

COMMIT;
