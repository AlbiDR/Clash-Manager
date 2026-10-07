-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(36);

-- Snapshot-content markers begin at generation zero and do not conflate a
-- successful materialized refresh with the separate pipeline heartbeat.
SELECT is(
  (SELECT count(*)::integer FROM substrate.sync_snapshot_state),
  2,
  'the marker has exactly one seeded row for each consumer snapshot'
);
SELECT ok(
  (SELECT bool_and(generation = 0 AND refreshed_at IS NULL)
   FROM substrate.sync_snapshot_state)
  AND (SELECT array_agg(snapshot_name ORDER BY snapshot_name)
       FROM substrate.sync_snapshot_state) = ARRAY['headhunter', 'roster'],
  'both markers start at generation zero with no refresh timestamp'
);
SELECT is(
  pg_get_function_result('features.sync_snapshot_marker()'::regprocedure),
  'TABLE(snapshot_name text, generation bigint, refreshed_at timestamp with time zone)',
  'the public RPC matches the shared row-shape contract'
);
SELECT ok(
  (SELECT prosecdef AND provolatile = 's'
          AND proconfig @> ARRAY['search_path=""']::text[]
   FROM pg_proc WHERE oid = 'features.sync_snapshot_marker()'::regprocedure),
  'the read-only RPC is stable, fixed-path, and privilege-bounded'
);
SELECT ok(
  has_function_privilege('anon', 'features.sync_snapshot_marker()', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'features.sync_snapshot_marker()', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'features.sync_snapshot_marker()', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
      WHERE routine.oid = 'features.sync_snapshot_marker()'::regprocedure
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    ),
  'only the anon role has explicit execute permission and PUBLIC has none'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_db_role_setting AS s
    JOIN pg_roles AS r ON r.oid = s.setrole
    CROSS JOIN LATERAL unnest(s.setconfig) AS config(setting)
    WHERE r.rolname = 'authenticator'
      AND config.setting LIKE 'pgrst.db_schemas=%'
      AND split_part(config.setting, '=', 2) !~ '(^|,)[[:space:]]*substrate[[:space:]]*(,|$)'
  ),
  'the substrate schema remains excluded from Data API exposure'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'substrate.sync_snapshot_state'::regclass)
  AND NOT has_table_privilege('anon', 'substrate.sync_snapshot_state', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'substrate.sync_snapshot_state', 'SELECT'),
  'RLS is enabled and the backing table is not directly readable by callers'
);
SELECT ok(
  NOT has_table_privilege('anon', 'substrate.sync_snapshot_state', 'INSERT')
    AND NOT has_table_privilege('anon', 'substrate.sync_snapshot_state', 'UPDATE')
    AND NOT has_table_privilege('anon', 'substrate.sync_snapshot_state', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'substrate.sync_snapshot_state', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'substrate.sync_snapshot_state', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'substrate.sync_snapshot_state', 'DELETE')
    AND NOT has_table_privilege('service_role', 'substrate.sync_snapshot_state', 'INSERT')
    AND NOT has_table_privilege('service_role', 'substrate.sync_snapshot_state', 'UPDATE')
    AND NOT has_table_privilege('service_role', 'substrate.sync_snapshot_state', 'DELETE'),
  'API roles cannot write marker state directly'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon;
     DO $assert$
     BEGIN
       IF (SELECT count(*) FROM features.sync_snapshot_marker()) <> 2
          OR (SELECT array_agg(snapshot_name ORDER BY snapshot_name)
              FROM features.sync_snapshot_marker()) <> ARRAY['headhunter', 'roster'] THEN
         RAISE EXCEPTION 'anon RPC response does not contain exactly the two marker rows';
       END IF;
     END;
     $assert$;
     RESET ROLE; $$,
  'the no-session publishable-key anon role reads exactly two marker rows without an Auth JWT'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon;
     SET LOCAL request.jwt.claims = '{"role":"service_role"}';
     DO $assert$
     DECLARE v_denied boolean := false;
     BEGIN
       BEGIN
         PERFORM 1 FROM features.sync_snapshot_marker();
       EXCEPTION WHEN insufficient_privilege THEN
         v_denied := true;
       END;
       IF NOT v_denied THEN RAISE EXCEPTION 'RPC accepted a non-anon JWT role'; END IF;
     END;
     $assert$;
     RESET ROLE; $$,
  'the RPC rejects a conflicting JWT role even when the request role is anon'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon;
     DO $assert$
     DECLARE v_denied boolean := false;
     BEGIN
       BEGIN
         UPDATE substrate.sync_snapshot_state
         SET generation = generation + 1
         WHERE snapshot_name = 'roster';
       EXCEPTION WHEN insufficient_privilege THEN
         v_denied := true;
       END;
       IF NOT v_denied THEN RAISE EXCEPTION 'anon caller mutated marker state'; END IF;
     END;
     $assert$;
     RESET ROLE; $$,
  'the anon role is denied when attempting a direct marker mutation'
);
SELECT is(
  substrate.refresh_materialized_view('features.headhunter_materialized'::regclass),
  true,
  'a successful headhunter refresh reports success'
);
SELECT is(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter'),
  1::bigint,
  'a successful refresh advances only its matching generation'
);
SELECT is(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'roster'),
  0::bigint,
  'a headhunter refresh does not advance the roster generation'
);
SELECT ok(
  (SELECT refreshed_at IS NOT NULL FROM substrate.sync_snapshot_state
   WHERE snapshot_name = 'headhunter'),
  'a successful refresh records its completion timestamp'
);
SELECT is(
  substrate.refresh_materialized_view('features.roster_materialized'::regclass),
  true,
  'a successful roster refresh reports success'
);
SELECT is(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'roster'),
  1::bigint,
  'a successful roster refresh advances the roster generation'
);

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
CREATE TEMP TABLE headhunter_marker_before_unrefreshed_change AS
SELECT generation, refreshed_at FROM substrate.sync_snapshot_state
WHERE snapshot_name = 'headhunter';
UPDATE drivers.recruits SET player_name = 'Snapshot Probe Renamed'
WHERE player_tag = '#P0G9CU2Q';

SELECT is(
  (SELECT player_name FROM features.headhunter_materialized WHERE player_tag = '#P0G9CU2Q'),
  'Snapshot Probe',
  'a change with no completion event leaves the snapshot untouched'
);
SELECT ok(
  (SELECT current.generation = before.generation
          AND current.refreshed_at IS NOT DISTINCT FROM before.refreshed_at
   FROM substrate.sync_snapshot_state AS current
   CROSS JOIN headhunter_marker_before_unrefreshed_change AS before
   WHERE current.snapshot_name = 'headhunter'),
  'a source change without a successful refresh leaves the marker untouched'
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

-- A refresh failure leaves its matching generation and timestamp untouched.
CREATE TEMP TABLE headhunter_marker_before_refresh_failure AS
SELECT generation, refreshed_at FROM substrate.sync_snapshot_state
WHERE snapshot_name = 'headhunter';
DROP INDEX features.headhunter_materialized_player_tag_key;
SELECT is(
  substrate.refresh_materialized_view('features.headhunter_materialized'::regclass),
  false,
  'a concurrent refresh without its required unique index reports false'
);
SELECT ok(
  (SELECT current.generation = before.generation
          AND current.refreshed_at IS NOT DISTINCT FROM before.refreshed_at
   FROM substrate.sync_snapshot_state AS current
   CROSS JOIN headhunter_marker_before_refresh_failure AS before
   WHERE current.snapshot_name = 'headhunter'),
  'a failed refresh does not advance or timestamp its marker'
);
CREATE UNIQUE INDEX headhunter_materialized_player_tag_key
    ON features.headhunter_materialized (player_tag);

-- Force the marker update to fail after REFRESH succeeds. The function's
-- exception subtransaction must roll back both the refresh and marker write.
CREATE FUNCTION pg_temp.reject_sync_snapshot_marker_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.snapshot_name = 'headhunter' THEN
    RAISE EXCEPTION 'intentional marker update failure for rollback assertion';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER reject_sync_snapshot_marker_update
BEFORE UPDATE ON substrate.sync_snapshot_state
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_sync_snapshot_marker_update();
UPDATE drivers.recruits
SET player_name = 'Atomicity Probe'
WHERE player_tag = '#P0G9CU2Q';
CREATE TEMP TABLE headhunter_marker_before_marker_failure AS
SELECT generation, refreshed_at FROM substrate.sync_snapshot_state
WHERE snapshot_name = 'headhunter';
CREATE TEMP TABLE headhunter_contents_before_marker_failure AS
SELECT player_name FROM features.headhunter_materialized
WHERE player_tag = '#P0G9CU2Q';
SELECT is(
  substrate.refresh_materialized_view('features.headhunter_materialized'::regclass),
  false,
  'a marker write failure reports false after refresh work is attempted'
);
SELECT ok(
  (SELECT current.generation = before.generation
          AND current.refreshed_at IS NOT DISTINCT FROM before.refreshed_at
   FROM substrate.sync_snapshot_state AS current
   CROSS JOIN headhunter_marker_before_marker_failure AS before
   WHERE current.snapshot_name = 'headhunter'),
  'a marker write failure preserves generation and timestamp'
);
SELECT is(
  (SELECT player_name FROM features.headhunter_materialized WHERE player_tag = '#P0G9CU2Q'),
  (SELECT player_name FROM headhunter_contents_before_marker_failure),
  'a marker write failure rolls back the materialized refresh too'
);
SELECT ok(
  EXISTS (SELECT 1 FROM substrate.governance_telemetry
          WHERE event_type = 'MATERIALIZED_REFRESH' AND status = 'ERROR'
            AND (message LIKE 'headhunter_materialized refresh failed:%'
                 OR message LIKE 'features.headhunter_materialized refresh failed:%')),
  'refresh failures retain their existing telemetry behavior'
);

SELECT * FROM finish();
ROLLBACK;
