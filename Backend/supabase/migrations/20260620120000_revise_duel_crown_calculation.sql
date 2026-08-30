-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_battle                 RECORD;
    v_voyage_remaining_secs  BIGINT;
    v_interval_secs          BIGINT;
    v_member_last_seen       TIMESTAMPTZ;
BEGIN
    -- Insert / skip duplicate battles.
    FOR v_battle IN
        SELECT
            to_timestamp(t.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"') AS battle_time,
            t.type                   AS battle_type,
            t.opponent_player_tag,
            t.opponent_player_name,
            t.team_crowns,
            t.opponent_crowns,
            CASE
                WHEN t.team_crowns > t.opponent_crowns THEN 'win'
                WHEN t.team_crowns < t.opponent_crowns THEN 'loss'
                ELSE 'draw'
            END AS result,
            (t.team_crowns > t.opponent_crowns) AS win_status
        FROM (
            SELECT
                item->>'battleTime'             AS bt,
                item->>'type'                   AS type,
                item->'team'->0->>'tag'         AS team_tag,
                CASE 
                    WHEN item->>'type' = 'riverRaceDuel' AND jsonb_typeof(item->'team'->0->'rounds') = 'array' THEN
                        (SELECT (COALESCE(SUM((r->>'crowns')::INT), 0) + (3 * GREATEST(COUNT(r) - 1, 0)))::INT
                         FROM jsonb_array_elements(item->'team'->0->'rounds') r)
                    ELSE COALESCE((item->'team'->0->>'crowns')::INT, 0)
                END AS team_crowns,
                item->'opponent'->0->>'tag'     AS opponent_player_tag,
                item->'opponent'->0->>'name'    AS opponent_player_name,
                CASE 
                    WHEN item->>'type' = 'riverRaceDuel' AND jsonb_typeof(item->'opponent'->0->'rounds') = 'array' THEN
                        (SELECT COALESCE(SUM((r->>'crowns')::INT), 0)::INT
                         FROM jsonb_array_elements(item->'opponent'->0->'rounds') r)
                    ELSE COALESCE((item->'opponent'->0->>'crowns')::INT, 0)
                END AS opponent_crowns
            FROM jsonb_array_elements(p_payload) item
            WHERE item->>'battleTime' IS NOT NULL
              AND item->'opponent' IS NOT NULL
        ) t
    LOOP
        INSERT INTO drivers.player_battles (
            player_tag,
            battle_time,
            battle_type,
            win_status,
            result,
            team_crowns,
            opponent_crowns,
            opponent_player_tag,
            opponent_player_name
        )
        VALUES (
            p_tag,
            v_battle.battle_time,
            v_battle.battle_type,
            v_battle.win_status,
            v_battle.result,
            v_battle.team_crowns,
            v_battle.opponent_crowns,
            v_battle.opponent_player_tag,
            v_battle.opponent_player_name
        )
        ON CONFLICT (player_tag, battle_time) DO NOTHING;
    END LOOP;

    -- Enforce the 100-battle rolling window per player.
    DELETE FROM drivers.player_battles
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY player_tag ORDER BY battle_time DESC
            ) AS rn
            FROM drivers.player_battles
            WHERE player_tag = p_tag
        ) x WHERE x.rn > 100
    );

    -- Schedule the next poll for this member based on their activity tier.
    -- Only applies to clan members (not recruits - they have no last_seen_at).
    SELECT last_seen_at
    INTO v_member_last_seen
    FROM drivers.members
    WHERE player_tag = p_tag;

    IF v_member_last_seen IS NOT NULL THEN
        -- Resolve active voyage remaining seconds.
        SELECT GREATEST(0, EXTRACT(EPOCH FROM (end_at - now()))::BIGINT)
        INTO v_voyage_remaining_secs
        FROM drivers.clan_voyage
        WHERE status = 'ACTIVE'
        ORDER BY created_at DESC
        LIMIT 1;

        v_interval_secs := drivers.get_voyage_poll_interval_seconds(
            v_member_last_seen,
            v_voyage_remaining_secs
        );

        UPDATE drivers.members
        SET next_poll_at = now() + make_interval(secs => v_interval_secs::double precision)
        WHERE player_tag = p_tag;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
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

    -- 1. Strict Pruning: Remove any contribution records for players who are not currently active clan members
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

    -- 2. Calculate and update the correct live scores.
    UPDATE drivers.clan_voyage_contributions c
    SET
        total_voyage_crowns = COALESCE(c.manual_voyage_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns + (3 - b.opponent_crowns))
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail')
              AND (
                  (c.manual_voyage_crowns IS NOT NULL AND b.battle_time > c.manual_voyage_crowns_at)
                  OR
                  (c.manual_voyage_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    -- 3. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET percentage_voyage_crowns = LEAST(ROUND((total_voyage_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;

CREATE OR REPLACE FUNCTION drivers.on_contribution_manual_override_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_start      TIMESTAMPTZ;
    v_end        TIMESTAMPTZ;
    v_target     INTEGER;
    v_window_end TIMESTAMPTZ;
BEGIN
    IF NEW.manual_voyage_crowns IS DISTINCT FROM OLD.manual_voyage_crowns THEN
        IF NEW.manual_voyage_crowns IS NOT NULL THEN
            NEW.manual_voyage_crowns_at := now();
        ELSE
            NEW.manual_voyage_crowns_at := NULL;
        END IF;

        SELECT start_at, end_at, target_crowns
        INTO v_start, v_end, v_target
        FROM drivers.clan_voyage
        WHERE id = NEW.voyage_id;

        v_window_end := COALESCE(v_end, now());

        NEW.total_voyage_crowns := COALESCE(NEW.manual_voyage_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns + (3 - b.opponent_crowns))
            FROM drivers.player_battles b
            WHERE b.player_tag = NEW.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail')
              AND (
                  (NEW.manual_voyage_crowns IS NOT NULL AND b.battle_time > NEW.manual_voyage_crowns_at)
                  OR
                  (NEW.manual_voyage_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0);

        NEW.percentage_voyage_crowns := LEAST(ROUND((NEW.total_voyage_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0);
        NEW.updated_at := now();
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_id      BIGINT;
    v_target  INT;
    v_current INT;
    v_end     TIMESTAMPTZ;
    v_name    TEXT;
    v_earned  INT;
BEGIN
    SELECT v.id, v.target_crowns, v.end_at
    INTO v_id, v_target, v_end
    FROM drivers.clan_voyage v
    WHERE v.status = 'ACTIVE'
    AND v.start_at <= NEW.battle_time
    AND v.end_at >= NEW.battle_time
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        SELECT player_name INTO v_name
        FROM drivers.members
        WHERE player_tag = NEW.player_tag
          AND is_active = true
        LIMIT 1;

        IF v_name IS NOT NULL THEN
            v_earned := NEW.team_crowns + (3 - NEW.opponent_crowns);

            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id,
                player_tag,
                player_name,
                total_voyage_crowns,
                percentage_voyage_crowns
            )
            VALUES (
                v_id,
                NEW.player_tag,
                v_name,
                v_earned,
                LEAST(ROUND((v_earned::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
            )
            ON CONFLICT (voyage_id, player_tag)
            DO UPDATE SET
                total_voyage_crowns = drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns,
                percentage_voyage_crowns = LEAST(ROUND(((drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
                player_name = v_name,
                updated_at = now();
        END IF;

        SELECT SUM(total_voyage_crowns) INTO v_current
        FROM drivers.clan_voyage_contributions
        WHERE voyage_id = v_id;

        IF v_current >= v_target OR now() >= v_end THEN
            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id,
                player_tag,
                player_name,
                total_voyage_crowns,
                percentage_voyage_crowns
            )
            SELECT
                v_id,
                m.player_tag,
                m.player_name,
                0,
                0.0
            FROM drivers.members m
            WHERE m.is_active = true
              AND m.player_tag NOT IN (
                  SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_id
              )
            ON CONFLICT (voyage_id, player_tag) DO NOTHING;

            UPDATE drivers.clan_voyage
            SET status = 'COMPLETED',
                updated_at = now()
            WHERE id = v_id;
        END IF;
    ELSE
        PERFORM substrate.finalize_expired_voyages();
    END IF;

    RETURN NEW;
END;
$function$;
