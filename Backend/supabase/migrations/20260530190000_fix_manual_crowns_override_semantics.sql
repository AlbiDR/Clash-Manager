-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530190000_fix_manual_crowns_override_semantics
 * -------------------------------------------------------------
 * Root Cause:
 *   `manual_crowns` was designed as an *additive* adjustment on top of the
 *   automated battle sum. In practice the value is used as a *full
 *   authoritative replacement* sourced from the in-game clan-event screen.
 *   When both a manual override and automated battle records exist for the
 *   same player, refresh_voyage_contributions() was summing them:
 *
 *     crowns = automated_sum + manual_crowns
 *
 *   This produces a total that is higher than the real figure because
 *   the manual value already includes every crown the player earned.
 *
 * Fix:
 *   Change the upsert in step 3 of refresh_voyage_contributions() to use an
 *   OVERRIDE model:
 *
 *     IF manual_crowns IS SET  ->  crowns = manual_crowns   (override wins)
 *     ELSE                     ->  crowns = automated_sum   (pipeline wins)
 *
 *   The step-2 reset and step-4 pct finaliser remain identical.
 *   The drivers.on_battle_recorded() trigger is left unchanged because the
 *   real-time path only fires for live incoming battles; when a manual
 *   override is present the next refresh will correct the value anyway.
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

    -- When end_at has not been set yet (two-phase auto-activation model),
    -- treat the upper window bound as the current moment so that battles
    -- recorded since activation are counted immediately.
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

    -- 3. Upsert automated sums using an ALLOWLIST of competitive battle types:
    --    PvP            - regular multiplayer home village attacks
    --    pathOfLegend   - Legend League home village attacks
    --    riverRacePvP   - Clan War League river race battles
    --    riverRaceDuel  - Clan War League river race duels
    --
    --    Excluded: boatBattle (Builder Base), trail (Goblin Map/single-player),
    --              friendly, clanMate, clanMate2v2, tournament
    --
    --    OVERRIDE SEMANTICS: when a row already has manual_crowns set, the
    --    automated sum is IGNORED and the manual value is kept as-is.
    --    Only rows with no manual override receive the automated figure.
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
