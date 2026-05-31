-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Rename Nomenclature for Voyage Crowns
 *
 * Rationale:
 *   - Change `manual_crowns` -> `total_crowns`
 *   - Change `manual_crowns_at` -> `total_crowns_at`
 *   - Change `voyage_crown_pct` -> `voyage_crown_percentage`
 *   - Rename the proxy RPC to `set_voyage_total_crowns`
 */

BEGIN;

-- 1. Drop dependent views that use explicit aliases/names
DROP VIEW IF EXISTS features.voyage_contributions;

-- 2. Rename the columns
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN manual_crowns TO total_crowns;
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN manual_crowns_at TO total_crowns_at;
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN voyage_crown_pct TO voyage_crown_percentage;

-- 3. Recreate the voyage_contributions view
CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT 
    c.player_tag,
    s.name AS player_name,
    c.crowns,
    c.voyage_crown_percentage,
    s.performance_score
FROM drivers.clan_voyage_contributions c
JOIN features.scoring_view s ON s.player_tag = c.player_tag
WHERE c.voyage_id = (SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1);

GRANT SELECT ON features.voyage_contributions TO authenticated, anon, service_role;

-- 4. Recreate refresh_voyage_contributions
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
      AND COALESCE(total_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    -- 2. For players WITH manual overrides:
    --    Their crowns = total_crowns + SUM(team_crowns) played AFTER total_crowns_at.
    --    We pre-populate contributions table for roster members who are not yet inserted.
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_percentage)
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
        crowns = COALESCE(c.total_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns)
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
              AND (
                  -- If there's a manual override, only count subsequent battles
                  (c.total_crowns IS NOT NULL AND b.battle_time > c.total_crowns_at)
                  OR
                  -- Otherwise, count everything since voyage start
                  (c.total_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    -- 4. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET voyage_crown_percentage = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;

-- 5. Create new RPC drivers.set_voyage_total_crowns
CREATE OR REPLACE FUNCTION drivers.set_voyage_total_crowns(
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
        (voyage_id, player_tag, player_name, total_crowns, total_crowns_at, crowns, voyage_crown_percentage)
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
        total_crowns    = EXCLUDED.total_crowns,
        total_crowns_at = EXCLUDED.total_crowns_at,
        crowns           = EXCLUDED.crowns,
        voyage_crown_percentage = EXCLUDED.voyage_crown_percentage,
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

-- 6. Create proxy features.set_voyage_total_crowns
CREATE OR REPLACE FUNCTION features.set_voyage_total_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.set_voyage_total_crowns(p_player_tag, p_crowns);
END;
$$;

GRANT EXECUTE ON FUNCTION features.set_voyage_total_crowns(TEXT, INTEGER)
    TO anon, authenticated;

-- 7. Drop the old RPCs
DROP FUNCTION IF EXISTS drivers.set_voyage_manual_crowns(TEXT, INTEGER);
DROP FUNCTION IF EXISTS features.set_voyage_manual_crowns(TEXT, INTEGER);

COMMIT;
