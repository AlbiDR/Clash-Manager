-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530198000_implement_manual_baseline_hybrid_tracking
 * ------------------------------------------------------------------
 * Purpose: Transition manual overrides to a hybrid baseline model.
 * Instead of overrides being either strictly additive to all history (causing
 * double-counting) or completely frozen (preventing live updates), manual
 * overrides are treated as a corrected starting point (baseline).
 * Subsequent battles played after the override was set are aggregated on top.
 */

-- 1. Add manual_crowns_at to track when the manual baseline was set.
ALTER TABLE drivers.clan_voyage_contributions
ADD COLUMN IF NOT EXISTS manual_crowns_at TIMESTAMP WITH TIME ZONE;

-- 2. For the active voyage, initialize existing manual overrides' baseline timestamps
--    to when the TSV was processed (2026-05-30 17:00:00+00).
UPDATE drivers.clan_voyage_contributions
SET manual_crowns_at = '2026-05-30 17:00:00+00'::timestamptz
WHERE voyage_id = 4 AND manual_crowns IS NOT NULL;

-- 3. Update set_voyage_manual_crowns to record the baseline timestamp.
CREATE OR REPLACE FUNCTION drivers.set_voyage_manual_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    v_id      BIGINT;
    v_target  INTEGER;
    v_name    TEXT;
    v_now     TIMESTAMP WITH TIME ZONE := now();
BEGIN
    SELECT id, target_crowns
    INTO v_id, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'No ACTIVE clan voyage found.'
        );
    END IF;

    IF p_crowns < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'crowns must be non-negative.'
        );
    END IF;

    SELECT player_name INTO v_name
    FROM drivers.members
    WHERE player_tag = p_player_tag
    LIMIT 1;

    INSERT INTO drivers.clan_voyage_contributions
        (voyage_id, player_tag, player_name, manual_crowns, manual_crowns_at, crowns, voyage_crown_pct)
    VALUES (
        v_id,
        p_player_tag,
        v_name,
        p_crowns,
        v_now,
        p_crowns,
        LEAST(ROUND((p_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    )
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        manual_crowns    = EXCLUDED.manual_crowns,
        manual_crowns_at = EXCLUDED.manual_crowns_at,
        crowns           = EXCLUDED.crowns,
        voyage_crown_pct = EXCLUDED.voyage_crown_pct,
        updated_at       = v_now;

    PERFORM drivers.refresh_voyage_contributions();

    RETURN jsonb_build_object(
        'success',    true,
        'voyage_id',  v_id,
        'player_tag', p_player_tag,
        'crowns',     p_crowns
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Rework refresh_voyage_contributions to accumulate battles on top of baseline manual_crowns.
CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'drivers', 'public'
 AS $function$
DECLARE
    v_id         BIGINT;
    v_start      TIMESTAMPTZ;
    v_end        TIMESTAMPTZ;
    v_target     INTEGER;
    v_window_end TIMESTAMPTZ;
BEGIN
    SELECT id, start_at, end_at, target_crowns
    INTO v_id, v_start, v_end, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;

    v_window_end := COALESCE(v_end, now());

    -- 1. Remove ghost records
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND COALESCE(manual_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    -- 2. For players WITH manual overrides:
    --    Their crowns = manual_crowns + SUM(team_crowns) played AFTER manual_crowns_at.
    --    We pre-populate contributions table for roster members who are not yet inserted.
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_pct)
    SELECT
        v_id,
        m.player_tag,
        m.player_name,
        0,
        0.0
    FROM drivers.members m
    WHERE m.player_tag NOT IN (
        SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_id
    )
    ON CONFLICT (voyage_id, player_tag) DO NOTHING;

    -- 3. Calculate and update the correct live scores.
    --    We perform this in a clean UPDATE pass that handles both players with and without overrides.
    UPDATE drivers.clan_voyage_contributions c
    SET
        crowns = COALESCE(c.manual_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns)
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
              AND (
                  -- If there's a manual override, only count subsequent battles
                  (c.manual_crowns IS NOT NULL AND b.battle_time > c.manual_crowns_at)
                  OR
                  -- Otherwise, count everything since voyage start
                  (c.manual_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    -- 4. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET voyage_crown_pct = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;
