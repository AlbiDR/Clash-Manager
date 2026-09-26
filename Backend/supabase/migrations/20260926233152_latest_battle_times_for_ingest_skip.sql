-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Lets deep-depth.ts skip ingest_player_battles() for recruits whose fetched
-- battle log holds nothing newer than what is already stored.
-- Reasoning in the COMMENT ON below (queryable via psql \df+).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_latest_battle_times(p_player_tags text[])
 RETURNS TABLE(player_tag text, latest_battle_time text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
    SELECT requested.tag,
           to_char(latest.battle_time, 'YYYYMMDD"T"HH24MISS.MS"Z"')
      FROM unnest(p_player_tags) AS requested(tag)
      CROSS JOIN LATERAL (
          SELECT pb.battle_time
            FROM drivers.player_battles pb
           WHERE pb.player_tag = requested.tag
           ORDER BY pb.battle_time DESC
           LIMIT 1
      ) latest;
$function$;

REVOKE ALL ON FUNCTION public.get_latest_battle_times(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_battle_times(text[]) TO service_role;

COMMENT ON FUNCTION public.get_latest_battle_times(text[]) IS
'Returns, for each requested player tag that has any stored battle, the newest '
'drivers.player_battles.battle_time formatted exactly like the Royale API battleTime '
'string (YYYYMMDDTHHMMSS.mmmZ). Tags with no stored battle are omitted. '
'WHY: ingest-royale-data''s deep-depth stage calls ingest_player_battles() for every '
'member and every ACTIVE recruit every 30 minutes. Measured 2026-09-26: 250 recruits '
'(~12,000 calls/day) of which only ~1,250 calls inserted anything, while each call '
'cost ~110ms end to end through PostgREST even when it wrote nothing. deep-depth.ts '
'calls this once per cycle and skips the ingest RPC for a RECRUIT whose newest fetched '
'battleTime is <= the value returned here. Members are never skipped, because '
'ingest_player_battles() also reschedules their next_poll_at. '
'FORMAT CONTRACT: ingest_player_battles() parses battleTime with to_timestamp(..., '
'''YYYYMMDD"T"HH24MISS.MS"Z"'') in the session time zone and this function renders with '
'to_char in the same session time zone, so the strings round-trip exactly whatever the '
'zone (server default is UTC with no role overrides, verified 2026-09-26). The caller '
'compares strings lexically and falls back to ingesting when either side does not match '
'that format, so any drift here can only cost a redundant call, never a missed battle. '
'Changing either format string without the other breaks that guarantee.';

COMMIT;
