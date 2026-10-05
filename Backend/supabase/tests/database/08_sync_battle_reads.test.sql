-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(8);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'drivers.uq_player_battle'::regclass
    AND indisunique AND indisvalid),
  'Battle deduplication keeps its valid unique index'
);
SELECT ok(
  to_regclass('drivers.idx_player_battles_player_tag') IS NULL
    AND to_regclass('drivers.idx_player_battles_tag_time') IS NULL,
  'Battle ingestion no longer maintains duplicate player indexes'
);

INSERT INTO drivers.players (player_tag) VALUES ('#Q0000G0'), ('#Q0000G2'), ('#Q0000G8');
INSERT INTO drivers.members (player_tag, player_name, role, exp_level, is_active)
VALUES ('#Q0000G0', 'Sync Test', 'member', 50, true),
       ('#Q0000G2', 'Inactive Sync Test', 'member', 50, false),
       ('#Q0000G8', 'No Battle Sync Test', 'member', 50, true);

INSERT INTO drivers.player_battle_daily (player_tag, battle_date, battle_type, battles, wins)
VALUES ('#Q0000G0', (now() AT TIME ZONE 'UTC')::date - 1, 'PvP', 6, 4),
       ('#Q0000G0', (now() AT TIME ZONE 'UTC')::date - 30, 'PvP', 2, 0),
       ('#Q0000G0', (now() AT TIME ZONE 'UTC')::date - 31, 'PvP', 100, 100),
       ('#Q0000G2', (now() AT TIME ZONE 'UTC')::date - 1, 'PvP', 5, 3);

INSERT INTO drivers.player_battles (player_tag, battle_time, battle_type, win_status)
VALUES ('#Q0000G0', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 hour', 'PvP', true),
       ('#Q0000G0', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '2 hours', 'PvP', false),
       ('#Q0000G0', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 hour', 'PvP', true),
       ('#Q0000G0', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '25 hours', 'PvP', true);

SELECT results_eq(
  $$ SELECT win_rate FROM features.get_active_roster_win_rates() WHERE player_tag = '#Q0000G0' $$,
  $$ VALUES (0.5::numeric) $$,
  'Roster win rate combines 30-day rollups with only today raw, without double counting'
);
SELECT is_empty(
  $$ SELECT * FROM features.get_active_roster_win_rates() WHERE player_tag = '#Q0000G2' $$,
  'The public bridge cannot reveal inactive player statistics'
);
SELECT results_eq(
  $$ SELECT win_rate FROM features.roster_view WHERE player_tag = '#Q0000G8' $$,
  $$ VALUES (0::numeric) $$,
  'Roster members with no battle history keep a zero win rate'
);
SELECT ok(
  NOT has_function_privilege('anon', 'drivers.get_player_battle_stats(integer,text[])', 'EXECUTE'),
  'The generic battle helper stays private'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon; SELECT * FROM features.roster_view WHERE player_tag = '#Q0000G0'; RESET ROLE; $$,
  'Public app reads can still load the roster'
);
SET LOCAL TIME ZONE 'Pacific/Honolulu';
SELECT results_eq(
  $$ SELECT win_rate FROM features.get_active_roster_win_rates() WHERE player_tag = '#Q0000G0' $$,
  $$ VALUES (0.5::numeric) $$,
  'Today boundaries are UTC even in a non-UTC database session'
);

SELECT * FROM finish();
ROLLBACK;
