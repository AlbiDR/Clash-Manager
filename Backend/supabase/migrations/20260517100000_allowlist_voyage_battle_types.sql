-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Switch from a blocklist to an allowlist for competitive battle types.
-- Only PvP, pathOfLegend, riverRacePvP, and riverRaceDuel count toward Clan Voyage crowns.
-- This removes boatBattle (Builder Base) and trail (Goblin Map) which were previously
-- slipping through the blocklist filter and inflating the crown total.
CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'drivers', 'public'
AS $function$
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

    -- 1. Remove ghost records of players not in the current roster
    --    who have no manual override worth preserving
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND COALESCE(manual_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    -- 2. Reset crowns to just their manual override amount (clearing old automated sums)
    UPDATE drivers.clan_voyage_contributions
    SET crowns = COALESCE(manual_crowns, 0)
    WHERE voyage_id = v_id;

    -- 3. Upsert automated sums using an ALLOWLIST of competitive battle types:
    --    PvP            - regular multiplayer home village attacks
    --    pathOfLegend   - Legend League home village attacks
    --    riverRacePvP   - Clan War League river race battles
    --    riverRaceDuel  - Clan War League river race duels
    --
    --    Excluded: boatBattle (Builder Base), trail (Goblin Map/single-player),
    --              friendly, clanMate, clanMate2v2, tournament
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_pct)
    SELECT
        v_id,
        b.player_tag,
        m.player_name,
        SUM(b.team_crowns) AS crowns,
        LEAST(ROUND((SUM(b.team_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0) AS voyage_crown_pct
    FROM drivers.player_battles b
    INNER JOIN drivers.members m ON m.player_tag = b.player_tag
    WHERE b.battle_time >= v_start AND b.battle_time <= v_end
      AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
    GROUP BY b.player_tag, m.player_name
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        player_name = excluded.player_name,
        crowns = excluded.crowns + COALESCE(drivers.clan_voyage_contributions.manual_crowns, 0),
        voyage_crown_pct = LEAST(ROUND(((excluded.crowns + COALESCE(drivers.clan_voyage_contributions.manual_crowns, 0))::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
        updated_at = NOW();

    -- 4. Final pass: ensure all percentages are accurate
    UPDATE drivers.clan_voyage_contributions
    SET voyage_crown_pct = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;
