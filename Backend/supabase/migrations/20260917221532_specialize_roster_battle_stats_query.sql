-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Join a supplied roster directly to battle indexes; keep the all-player path.

BEGIN;

ALTER FUNCTION drivers.get_player_battle_stats(integer, text[])
    RESET plan_cache_mode;

CREATE OR REPLACE FUNCTION drivers.get_player_battle_stats(
    p_days integer DEFAULT 30,
    p_player_tags text[] DEFAULT NULL
)
RETURNS TABLE (
    player_tag text,
    battles bigint,
    wins bigint,
    fame_earned_sum bigint,
    team_crowns_sum bigint,
    opponent_crowns_sum bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF p_player_tags IS NULL THEN
        RETURN QUERY
        SELECT
            combined.player_tag,
            sum(combined.battles)::bigint,
            sum(combined.wins)::bigint,
            sum(combined.fame_earned_sum)::bigint,
            sum(combined.team_crowns_sum)::bigint,
            sum(combined.opponent_crowns_sum)::bigint
        FROM (
            SELECT
                d.player_tag,
                d.battles,
                d.wins,
                d.fame_earned_sum,
                d.team_crowns_sum,
                d.opponent_crowns_sum
            FROM drivers.player_battle_daily d
            WHERE d.battle_date >= (now() AT TIME ZONE 'UTC')::date - p_days

            UNION ALL

            SELECT
                pb.player_tag,
                count(*),
                count(*) FILTER (WHERE pb.win_status),
                sum(pb.fame_earned),
                sum(pb.team_crowns),
                sum(pb.opponent_crowns)
            FROM drivers.player_battles pb
            WHERE pb.battle_time >= date_trunc('day', now() AT TIME ZONE 'UTC')
              AND pb.battle_time < date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'
            GROUP BY pb.player_tag
        ) combined
        GROUP BY combined.player_tag;
        RETURN;
    END IF;

    RETURN QUERY
    WITH requested_tags AS MATERIALIZED (
        SELECT DISTINCT unnest(p_player_tags) AS player_tag
    ), combined AS (
        SELECT
            d.player_tag,
            d.battles,
            d.wins,
            d.fame_earned_sum,
            d.team_crowns_sum,
            d.opponent_crowns_sum
        FROM requested_tags rt
        JOIN drivers.player_battle_daily d ON d.player_tag = rt.player_tag
        WHERE d.battle_date >= (now() AT TIME ZONE 'UTC')::date - p_days

        UNION ALL

        SELECT
            pb.player_tag,
            count(*),
            count(*) FILTER (WHERE pb.win_status),
            sum(pb.fame_earned),
            sum(pb.team_crowns),
            sum(pb.opponent_crowns)
        FROM requested_tags rt
        JOIN drivers.player_battles pb ON pb.player_tag = rt.player_tag
        WHERE pb.battle_time >= date_trunc('day', now() AT TIME ZONE 'UTC')
          AND pb.battle_time < date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'
        GROUP BY pb.player_tag
    )
    SELECT
        combined.player_tag,
        sum(combined.battles)::bigint,
        sum(combined.wins)::bigint,
        sum(combined.fame_earned_sum)::bigint,
        sum(combined.team_crowns_sum)::bigint,
        sum(combined.opponent_crowns_sum)::bigint
    FROM combined
    GROUP BY combined.player_tag;
END;
$function$;

REVOKE ALL ON FUNCTION drivers.get_player_battle_stats(integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[]) TO anon, authenticated, service_role;

COMMIT;
