-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

-- uq_player_battle already indexes (player_tag, battle_time), including
-- backward scans for a player's newest battles. These extra indexes repeat
-- that access path and consume cache and disk writes on every battle ingest.
DROP INDEX IF EXISTS drivers.idx_player_battles_player_tag;
DROP INDEX IF EXISTS drivers.idx_player_battles_tag_time;

-- The public roster needs two counters, not the generic six-counter battle
-- report. Keep the roster restriction in SQL so its cardinality is visible to
-- the planner, and avoid a parameterized PL/pgSQL plan shared with scanner
-- queries. Preserve the private helper and the bridge's existing privileges.
CREATE OR REPLACE FUNCTION features.get_active_roster_win_rates()
RETURNS TABLE (player_tag text, win_rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH roster_tags AS MATERIALIZED (
    SELECT members.player_tag
    FROM drivers.members AS members
    WHERE members.is_active
      AND members.player_tag ~ '^#[0289CGJLPQRUVY]+$'
  ), battle_counts AS (
    SELECT daily.player_tag, daily.battles, daily.wins
    FROM roster_tags AS roster
    JOIN drivers.player_battle_daily AS daily USING (player_tag)
    WHERE daily.battle_date >= (now() AT TIME ZONE 'UTC')::date - 30

    UNION ALL

    SELECT battles.player_tag,
      count(*) AS battles,
      count(*) FILTER (WHERE battles.win_status) AS wins
    FROM roster_tags AS roster
    JOIN drivers.player_battles AS battles USING (player_tag)
    WHERE battles.battle_time >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      AND battles.battle_time < (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') + interval '1 day'
    GROUP BY battles.player_tag
  )
  SELECT counts.player_tag,
    COALESCE(sum(counts.wins) / NULLIF(sum(counts.battles), 0), 0::numeric)
  FROM battle_counts AS counts
  GROUP BY counts.player_tag;
$function$;

COMMIT;
