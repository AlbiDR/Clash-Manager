-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR




CREATE OR REPLACE FUNCTION public.report_dead_recruit(p_player_tag text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_player_name TEXT;
    v_raw_score   NUMERIC;
    v_win_rate    NUMERIC;
BEGIN
    SELECT
        COALESCE(r.player_name, p.player_name, 'Unknown'),
        COALESCE(r.raw_potential_score, 0.0),
        COALESCE(r.win_rate, 0.0)
    INTO v_player_name, v_raw_score, v_win_rate
    FROM drivers.players p
    LEFT JOIN drivers.recruits r ON r.player_tag = p.player_tag
    WHERE p.player_tag = p_player_tag;

    INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
    VALUES (
        p_player_tag,
        COALESCE(v_player_name, 'Unknown'),
        'GHOST_DETECTED',
        COALESCE(v_raw_score, 0.0),
        0.0,
        'Player profile returned 404 (Not Found). Universal registry eviction and blacklisting initiated.'
    );

    INSERT INTO drivers.recruit_blacklist (player_tag, player_name, raw_potential_score, reason, expires_at, snapshot)
    VALUES (
        p_player_tag,
        COALESCE(v_player_name, 'Ghost'),
        COALESCE(v_raw_score, 0.0),
        'GHOST_404',
        NOW() + INTERVAL '7 days',
        jsonb_build_object('win_rate', COALESCE(v_win_rate, 0.0))
    )
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + INTERVAL '7 days',
        reason     = 'GHOST_404',
        snapshot   = drivers.recruit_blacklist.snapshot || jsonb_build_object('win_rate', COALESCE(v_win_rate, 0.0));

    DELETE FROM drivers.players WHERE player_tag = p_player_tag;

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('GHOST_EVICTION', 'INFO', 'Universal eviction of ghost player: ' || p_player_tag);
END; $function$;



CREATE OR REPLACE FUNCTION drivers.dismiss_recruit(p_tag text, p_days_to_ban integer DEFAULT 30)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_recruit RECORD;
BEGIN
    SELECT * INTO v_recruit FROM drivers.recruits WHERE player_tag = p_tag;

    INSERT INTO drivers.recruit_blacklist (
        player_tag,
        player_name,
        raw_potential_score,
        reason,
        expires_at,
        snapshot
    )
    VALUES (
        p_tag,
        v_recruit.player_name,
        COALESCE(v_recruit.raw_potential_score, 0.0),
        'DISMISSED',
        NOW() + (p_days_to_ban || ' days')::INTERVAL,
        jsonb_build_object('win_rate', COALESCE(v_recruit.win_rate, 0.0))
    )
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + (p_days_to_ban || ' days')::INTERVAL,
        created_at = NOW();

    DELETE FROM drivers.recruits WHERE player_tag = p_tag;
END;
$function$;
