-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
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
        drivers.recruits.status IS DISTINCT FROM EXCLUDED.status OR
        drivers.recruits.last_scan < NOW() - INTERVAL '15 minutes';
END;
$function$;
