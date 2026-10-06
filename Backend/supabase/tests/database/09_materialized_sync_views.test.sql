-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

-- Snapshots exist, are populated, and carry the unique key CONCURRENTLY needs.
SELECT ok(
  (SELECT ispopulated FROM pg_matviews
   WHERE schemaname = 'features' AND matviewname = 'roster_materialized'),
  'the roster snapshot is a populated materialized view'
);
SELECT ok(
  (SELECT ispopulated FROM pg_matviews
   WHERE schemaname = 'features' AND matviewname = 'headhunter_materialized'),
  'the headhunter snapshot is a populated materialized view'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'features'
    AND indexname = 'roster_materialized_player_tag_key' AND indexdef LIKE 'CREATE UNIQUE INDEX%'),
  'the roster snapshot has the unique player_tag index a concurrent refresh requires'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'features'
    AND indexname = 'headhunter_materialized_player_tag_key' AND indexdef LIKE 'CREATE UNIQUE INDEX%'),
  'the headhunter snapshot has the unique player_tag index a concurrent refresh requires'
);

-- The snapshots mirror the live views column for column.
SELECT is(
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute
   WHERE attrelid = 'features.roster_materialized'::regclass AND attnum > 0 AND NOT attisdropped),
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute
   WHERE attrelid = 'features.roster_view'::regclass AND attnum > 0 AND NOT attisdropped),
  'the roster snapshot exposes exactly the columns of roster_view'
);
SELECT is(
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute
   WHERE attrelid = 'features.headhunter_materialized'::regclass AND attnum > 0 AND NOT attisdropped),
  (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute
   WHERE attrelid = 'features.headhunter_view'::regclass AND attnum > 0 AND NOT attisdropped),
  'the headhunter snapshot exposes exactly the columns of headhunter_view'
);

-- The app reads the snapshots as anon; the refresh machinery is internal.
SELECT lives_ok(
  $$ SET LOCAL ROLE anon; SELECT * FROM features.roster_materialized LIMIT 1;
     SELECT * FROM features.headhunter_materialized LIMIT 1; RESET ROLE; $$,
  'anon can read both snapshots'
);
SELECT ok(
  NOT has_function_privilege('anon', 'substrate.refresh_materialized_view(regclass)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'substrate.refresh_materialized_view(regclass)', 'EXECUTE'),
  'public roles cannot trigger a snapshot refresh'
);

-- Completion of the right component refreshes the right snapshot.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'substrate.pipeline_heartbeat'::regclass
      AND tgname = 'tr_pipeline_completed_refresh' AND NOT tgisinternal),
  'pipeline completion is wired to the snapshot refresh'
);

INSERT INTO drivers.players (player_tag, player_name)
VALUES ('#P0G9CU2Q', 'Snapshot Probe')
ON CONFLICT (player_tag) DO NOTHING;
-- Scored above every existing recruit: the statement trigger that rotates the
-- active pool after an insert must keep the probe ACTIVE, not bench it.
INSERT INTO drivers.recruits (player_tag, player_name, trophies, donations, cards, war_wins, raw_potential_score, source, status, last_scan)
SELECT '#P0G9CU2Q', 'Snapshot Probe', 5000, 100, 100, 10, COALESCE(max(raw_potential_score), 0) + 1, 'TOURNAMENT', 'ACTIVE', now()
FROM drivers.recruits;

-- The insert itself completes a recruit rotation, which already refreshes the
-- snapshot. A rename fires no rotation, so it shows the snapshot standing
-- still until the next completion event.
UPDATE drivers.recruits SET player_name = 'Snapshot Probe Renamed'
WHERE player_tag = '#P0G9CU2Q';

SELECT is(
  (SELECT player_name FROM features.headhunter_materialized WHERE player_tag = '#P0G9CU2Q'),
  'Snapshot Probe',
  'a change with no completion event leaves the snapshot untouched'
);

INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at)
VALUES ('HEADHUNTER_SCANNER', 'RUNNING', now())
ON CONFLICT (component_id) DO UPDATE SET status = 'RUNNING';
UPDATE substrate.pipeline_heartbeat SET status = 'COMPLETED'
WHERE component_id = 'HEADHUNTER_SCANNER';

SELECT is(
  (SELECT player_name FROM features.headhunter_materialized WHERE player_tag = '#P0G9CU2Q'),
  'Snapshot Probe Renamed',
  'a scanner completion refreshes the headhunter snapshot'
);

-- The refresh never fails the completing run: an unknown relation is logged.
SELECT is(
  substrate.refresh_materialized_view('substrate.config'::regclass),
  false,
  'a refresh that cannot run reports false instead of raising'
);

SELECT * FROM finish();
ROLLBACK;
