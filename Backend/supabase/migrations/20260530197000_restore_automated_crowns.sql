-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530197000_restore_automated_crowns
 * --------------------------------------------------
 * Purpose: Revert the accidental stripping of automated battle log aggregation.
 * We restore the fully functional pipeline where automated battle records are
 * aggregated, but manual overrides (if present) act as the absolute source of
 * truth for that player.
 */

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

    -- Treat current time as window boundary if not closed.
    v_window_end := COALESCE(v_end, now());

    -- 1. Remove ghost records of players not in the current roster
    --    who have no manual override worth preserving.
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND COALESCE(manual_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    -- 2. Reset crowns to just their manual override amount (clearing old automated sums).
    --    Players without a manual override are reset to 0; the upsert in step 3
    --    will repopulate them from the battle log.
    UPDATE drivers.clan_voyage_contributions
    SET crowns = COALESCE(manual_crowns, 0)
    WHERE voyage_id = v_id;

    -- 3. Upsert automated sums using the competitive battle types allowlist.
    --    Only rows with no manual override keep their automated values.
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_pct)
    SELECT
        v_id,
        b.player_tag,
        m.player_name,
        SUM(b.team_crowns) AS crowns,
        LEAST(ROUND((SUM(b.team_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0) AS voyage_crown_pct
    FROM drivers.player_battles b
    INNER JOIN drivers.members m ON m.player_tag = b.player_tag
    WHERE b.battle_time >= v_start AND b.battle_time <= v_window_end
      AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
      AND NOT EXISTS (
          SELECT 1 FROM drivers.clan_voyage_contributions c
          WHERE c.voyage_id = v_id
            AND c.player_tag = b.player_tag
            AND c.manual_crowns IS NOT NULL
      )
    GROUP BY b.player_tag, m.player_name
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        player_name = excluded.player_name,
        -- Override semantics: manual_crowns wins when present; automated wins otherwise.
        crowns = CASE
            WHEN COALESCE(drivers.clan_voyage_contributions.manual_crowns, 0) > 0
                THEN drivers.clan_voyage_contributions.manual_crowns
            ELSE excluded.crowns
        END,
        voyage_crown_pct = LEAST(ROUND(
            (CASE
                WHEN COALESCE(drivers.clan_voyage_contributions.manual_crowns, 0) > 0
                    THEN drivers.clan_voyage_contributions.manual_crowns::numeric
                ELSE excluded.crowns::numeric
            END) / NULLIF(v_target, 0)::numeric * 100, 2), 100.0),
        updated_at = NOW();

    -- 4. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET voyage_crown_pct = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;
