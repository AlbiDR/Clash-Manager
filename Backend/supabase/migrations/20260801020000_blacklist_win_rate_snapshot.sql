-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260801020000_blacklist_win_rate_snapshot.sql
--
-- Includes win_rate in the snapshot JSONB payload written to
-- drivers.recruit_blacklist at eviction time.
--
-- Root cause (documented in win-rate-recalculation-SSOT.md Section 2.3,
-- Sub-cause C):
-- The snapshot column in drivers.recruit_blacklist is documented as "Full JSONB
-- snapshot of player stats for historical review." However, win_rate was never
-- included in the snapshot payload by any of the blacklist write paths, because
-- it was added to drivers.recruits (migration 20260726170000) after the
-- original blacklist functions were written. Three functions write to
-- drivers.recruit_blacklist:
--
--   1. public.report_dead_recruit(p_player_tag)
--      Evicts 404 ghost profiles. Reads from drivers.recruits + drivers.players.
--
--   2. drivers.dismiss_recruit(p_tag, p_days_to_ban)
--      Single-tag manual dismissal. Reads from drivers.recruits.
--
--   3. features.dismiss_recruits(items jsonb)
--      Bulk dismissal from the frontend. Receives raw_potential_score in the
--      payload but not win_rate (the frontend does not send it).
--
-- Fix strategy:
-- No schema change to drivers.recruit_blacklist is required. The snapshot
-- column already accepts arbitrary JSONB (DEFAULT '{}'::jsonb). This migration
-- adds win_rate to the snapshot payload in the two functions that read from
-- drivers.recruits at eviction time (report_dead_recruit and dismiss_recruit).
-- features.dismiss_recruits receives only id, name, and raw_potential_score
-- from the frontend JSON payload; it cannot include win_rate without a frontend
-- change. That path is left as-is -- the snapshot is a best-effort audit trail,
-- not a required field.
--
-- Decision D5 (SSOT): No schema change. The snapshot JSONB is the correct
-- vehicle -- adding a win_rate column would require all downstream readers and
-- the headhunter_view benchmarking_context to be updated.
-- =============================================================================


-- =============================================================================
-- Phase 4a: public.report_dead_recruit
--
-- Adds win_rate to the DECLARE block and reads it from drivers.recruits in the
-- same SELECT that already reads raw_potential_score. Adds it to the snapshot
-- payload in the INSERT (and the ON CONFLICT DO UPDATE SET clause so that a
-- repeated ghost eviction of the same tag also carries the latest win_rate).
-- =============================================================================

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


-- =============================================================================
-- Phase 4b: drivers.dismiss_recruit
--
-- Adds win_rate to the DECLARE block and reads it from drivers.recruits in
-- the existing SELECT. Adds it to the snapshot payload in the INSERT.
-- The ON CONFLICT clause only updates expires_at and created_at (existing
-- behavior): a repeated manual dismissal is a re-ban, not a profile refresh,
-- so the snapshot from the original dismissal is preserved via the ||
-- merge-update pattern.
-- =============================================================================

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
