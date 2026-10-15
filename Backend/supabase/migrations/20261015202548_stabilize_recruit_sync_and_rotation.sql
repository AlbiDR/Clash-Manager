-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
SET LOCAL lock_timeout = '3s';

-- Acquire overlapping player and recruit row locks in one bytewise order.
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
    ORDER BY (val->>'player_tag') COLLATE "C"
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
    ORDER BY (val->>'player_tag') COLLATE "C"
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

-- Preserve the ranked candidate set locally without session temp-table churn.
CREATE OR REPLACE FUNCTION substrate.rotate_recruits()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    limit_val  INT;
    v_limit_text TEXT;
    v_benched  INT;
    v_promoted INT;
    v_elite_tags TEXT[];
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('RECRUIT_ROTATION', 'RUNNING', NOW(), 'Rotation cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status = 'RUNNING', last_triggered_at = EXCLUDED.last_triggered_at, last_message = EXCLUDED.last_message;

    SELECT value INTO v_limit_text
    FROM substrate.config
    WHERE key = 'MAX_ACTIVE_RECRUITS';

    IF NOT FOUND OR v_limit_text IS NULL OR v_limit_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'MAX_ACTIVE_RECRUITS must be configured as a non-negative integer'
            USING ERRCODE = '22023';
    END IF;

    BEGIN
        limit_val := v_limit_text::INT;
    EXCEPTION WHEN numeric_value_out_of_range THEN
        RAISE EXCEPTION 'MAX_ACTIVE_RECRUITS must be configured as a non-negative integer'
            USING ERRCODE = '22023';
    END;

    SELECT COALESCE(array_agg(ranked.player_tag), ARRAY[]::text[])
    INTO v_elite_tags
    FROM (
        SELECT player_tag
        FROM drivers.recruits
        WHERE status != 'ARCHIVED'
        ORDER BY raw_potential_score DESC NULLS LAST
        LIMIT limit_val
    ) AS ranked;

    WITH benched_rows AS (
        UPDATE drivers.recruits
        SET status = 'BENCHED'::drivers.recruit_status
        WHERE status = 'ACTIVE'::drivers.recruit_status
          AND NOT (player_tag = ANY(v_elite_tags))
        RETURNING player_tag
    )
    SELECT count(*) INTO v_benched FROM benched_rows;

    WITH promoted_rows AS (
        UPDATE drivers.recruits
        SET status = 'ACTIVE'::drivers.recruit_status
        WHERE player_tag = ANY(v_elite_tags)
          AND status != 'ACTIVE'::drivers.recruit_status
        RETURNING player_tag
    )
    SELECT count(*) INTO v_promoted FROM promoted_rows;

    UPDATE substrate.pipeline_heartbeat
    SET status           = 'COMPLETED',
        last_success_at  = NOW(),
        last_message     = 'Rotation successful: ' || v_promoted || ' promoted, ' || v_benched || ' benched.',
        updated_at       = NOW()
    WHERE component_id = 'RECRUIT_ROTATION';

EXCEPTION WHEN OTHERS THEN
    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = SQLERRM,
        updated_at      = NOW()
    WHERE component_id = 'RECRUIT_ROTATION';
    RAISE;
END;
$function$;

-- CREATE OR REPLACE retains ownership and ACLs; rollback restores prior bodies.

COMMIT;
