-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Rewrites the "today" branch as a sargable range on battle_time instead of
-- an expression that defeated every index. Rationale in the commit message.

BEGIN;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
    SELECT
        combined.player_tag,
        sum(combined.battles)::bigint,
        sum(combined.wins)::bigint,
        sum(combined.fame_earned_sum)::bigint,
        sum(combined.team_crowns_sum)::bigint,
        sum(combined.opponent_crowns_sum)::bigint
    FROM (
        SELECT player_tag, battles, wins, fame_earned_sum, team_crowns_sum, opponent_crowns_sum
        FROM drivers.player_battle_daily
        WHERE battle_date >= (now() AT TIME ZONE 'UTC')::date - p_days
          AND (p_player_tags IS NULL OR player_tag = ANY (p_player_tags))

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
          AND pb.battle_time <  date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'
          AND (p_player_tags IS NULL OR pb.player_tag = ANY (p_player_tags))
        GROUP BY pb.player_tag
    ) combined
    GROUP BY combined.player_tag;
$function$;

REVOKE EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[]) TO anon, authenticated, service_role;

COMMIT;
