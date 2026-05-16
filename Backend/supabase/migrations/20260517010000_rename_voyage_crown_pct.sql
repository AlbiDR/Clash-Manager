-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Rename clan_voyage_contributions.performance_score -> voyage_crown_pct
 *
 * Rationale:
 *   "performance_score" is a reserved term in this project for the RPeS output
 *   (features.scoring_view). The voyage contributions column is not a final score;
 *   it is a per-player crown contribution ratio capped at 100, used as an input
 *   to the Decayed Participation Index. "voyage_crown_pct" is self-describing
 *   even in isolation and does not pollute the RPeS namespace.
 *
 * Scope:
 *   - drivers.clan_voyage_contributions (column rename)
 *   - drivers.refresh_voyage_contributions (function rebuild)
 *   - drivers.get_rolling_voyage_performance (function rebuild)
 *
 * NOT touched:
 *   - features.scoring_view (performance_score = RPeS output, correct name)
 *   - features.roster_view  (same)
 */

-- 1. Rename the column
ALTER TABLE drivers.clan_voyage_contributions
  RENAME COLUMN performance_score TO voyage_crown_pct;

-- 2. Rebuild refresh_voyage_contributions
CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'drivers', 'public'
AS $$
DECLARE
    v_id     BIGINT;
    v_start  TIMESTAMPTZ;
    v_end    TIMESTAMPTZ;
    v_target INTEGER;
BEGIN
    SELECT id, start_at, end_at, target_crowns
    INTO v_id, v_start, v_end, v_target
    FROM drivers.clan_voyage
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;

    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, crowns, voyage_crown_pct)
    SELECT
        v_id,
        b.player_tag,
        SUM(b.team_crowns)                                                                          AS crowns,
        LEAST(ROUND((SUM(b.team_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0) AS voyage_crown_pct
    FROM drivers.player_battles b
    WHERE b.battle_time >= v_start AND b.battle_time <= v_end
    GROUP BY b.player_tag
    ON CONFLICT (voyage_id, player_tag) DO UPDATE SET
        crowns           = EXCLUDED.crowns,
        voyage_crown_pct = EXCLUDED.voyage_crown_pct,
        updated_at       = now();
END;
$$;

-- 3. Rebuild get_rolling_voyage_performance
CREATE OR REPLACE FUNCTION drivers.get_rolling_voyage_performance(p_tag text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'drivers', 'public'
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(AVG(voyage_crown_pct), 0)
        FROM (
            SELECT voyage_crown_pct
            FROM drivers.clan_voyage_contributions
            WHERE player_tag = p_tag
            ORDER BY id DESC
            LIMIT 3
        ) sub
    );
END;
$$;
