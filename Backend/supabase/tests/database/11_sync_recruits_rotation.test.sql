-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'substrate.recruit_sync_rotation_guard'::regclass)
  AND NOT has_table_privilege('anon', 'substrate.recruit_sync_rotation_guard', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'substrate.recruit_sync_rotation_guard', 'SELECT')
  AND NOT has_table_privilege('service_role', 'substrate.recruit_sync_rotation_guard', 'SELECT')
  AND NOT has_table_privilege('anon', 'substrate.recruit_sync_rotation_guard', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'substrate.recruit_sync_rotation_guard', 'INSERT')
  AND NOT has_table_privilege('service_role', 'substrate.recruit_sync_rotation_guard', 'INSERT'),
  'the transaction guard is private and unavailable to API roles'
);

CREATE TEMP TABLE r3_rotation_events (event_id bigint GENERATED ALWAYS AS IDENTITY);
CREATE FUNCTION pg_temp.r3_capture_recruit_rotation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_temp AS $capture$
BEGIN
  INSERT INTO r3_rotation_events DEFAULT VALUES;
  RETURN NULL;
END;
$capture$;
CREATE TRIGGER zzz_r3_capture_recruit_rotation
AFTER UPDATE OF status ON substrate.pipeline_heartbeat
FOR EACH ROW WHEN (NEW.component_id = 'RECRUIT_ROTATION' AND NEW.status = 'COMPLETED')
EXECUTE FUNCTION pg_temp.r3_capture_recruit_rotation();
CREATE TEMP TABLE r3_rotation_marker AS
SELECT generation, 0::bigint AS rotations
FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter';

SELECT public.sync_recruits('[{
  "player_tag":"#2R9C2R9C","player_name":"DB rotation fixture","trophies":10000,
  "donations":0,"cards":0,"war_wins":0,"win_rate":0,"source":"MANUAL","status":"ACTIVE",
  "raw_potential_score":999999
}]'::jsonb);
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    - (SELECT generation FROM r3_rotation_marker) = 1
  AND (SELECT count(*) FROM r3_rotation_events) - (SELECT rotations FROM r3_rotation_marker) = 1,
  'one new recruit causes one rotation and one successful snapshot refresh'
);
UPDATE r3_rotation_marker
SET generation = (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter'),
    rotations = (SELECT count(*) FROM r3_rotation_events);

SELECT public.sync_recruits('[{
  "player_tag":"#2R9C2R9C","player_name":"DB rotation fixture","trophies":10001,
  "donations":0,"cards":0,"war_wins":0,"win_rate":0,"source":"TOURNAMENT","status":"ACTIVE",
  "raw_potential_score":1000000
}]'::jsonb);
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    - (SELECT generation FROM r3_rotation_marker) = 1
  AND (SELECT count(*) FROM r3_rotation_events) - (SELECT rotations FROM r3_rotation_marker) = 1,
  'one changed recruit causes one rotation and one successful snapshot refresh'
);
SELECT ok(
  (SELECT source = 'MANUAL' FROM drivers.recruits WHERE player_tag = '#2R9C2R9C')
  AND (SELECT status = 'ACTIVE' FROM drivers.recruits WHERE player_tag = '#2R9C2R9C'),
  'the update retains source provenance and the requested active state'
);
UPDATE r3_rotation_marker
SET generation = (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter'),
    rotations = (SELECT count(*) FROM r3_rotation_events);

SELECT public.sync_recruits('[
  {"player_tag":"#2R9C2R9C","player_name":"DB rotation fixture","trophies":10002,
   "donations":0,"cards":0,"war_wins":0,"win_rate":0,"source":"SHADOW","status":"ACTIVE",
   "raw_potential_score":1000001},
  {"player_tag":"#2R9C2R9G","player_name":"DB mixed fixture","trophies":10000,
   "donations":0,"cards":0,"war_wins":0,"win_rate":0,"source":"TOURNAMENT","status":"ACTIVE",
   "raw_potential_score":999998}
]'::jsonb);
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    - (SELECT generation FROM r3_rotation_marker) = 1
  AND (SELECT count(*) FROM r3_rotation_events) - (SELECT rotations FROM r3_rotation_marker) = 1,
  'a mixed insert and update batch causes one rotation and one successful snapshot refresh'
);
SELECT ok(
  (SELECT source = 'MANUAL' FROM drivers.recruits WHERE player_tag = '#2R9C2R9C')
  AND (SELECT count(*) = 2 FROM drivers.recruits WHERE player_tag IN ('#2R9C2R9C', '#2R9C2R9G')),
  'mixed synchronization preserves provenance and both recruit rows'
);
UPDATE r3_rotation_marker
SET generation = (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter'),
    rotations = (SELECT count(*) FROM r3_rotation_events);

INSERT INTO drivers.recruit_blacklist (player_tag, reason, expires_at)
VALUES ('#2R9C2R9G', 'R3 DB test fixture', NOW() + INTERVAL '1 day');
SELECT ok(
  EXISTS (SELECT 1 FROM drivers.recruit_blacklist WHERE player_tag = '#2R9C2R9G')
  AND NOT EXISTS (SELECT 1 FROM features.headhunter_view WHERE player_tag = '#2R9C2R9G'),
  'the blacklist continues to exclude its recruit from the headhunter projection'
);

SELECT public.sync_recruits('[]'::jsonb);
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    = (SELECT generation FROM r3_rotation_marker)
  AND (SELECT count(*) FROM r3_rotation_events) = (SELECT rotations FROM r3_rotation_marker),
  'an empty batch causes no rotation or snapshot refresh'
);
SELECT public.sync_recruits('[{"player_tag":"#2R9C2R9C","player_name":"DB rotation fixture",
  "trophies":10002,"donations":0,"cards":0,"war_wins":0,"win_rate":0,
  "source":"TOURNAMENT","status":"ACTIVE","raw_potential_score":1000001}]'::jsonb);
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    = (SELECT generation FROM r3_rotation_marker)
  AND (SELECT count(*) FROM r3_rotation_events) = (SELECT rotations FROM r3_rotation_marker),
  'an unchanged conflict batch causes no rotation or snapshot refresh'
);

INSERT INTO drivers.players (player_tag, player_name)
VALUES ('#2R9C2R9J', 'DB direct fixture')
ON CONFLICT (player_tag) DO NOTHING;
INSERT INTO drivers.recruits (player_tag, player_name, trophies, raw_potential_score, source, status)
VALUES ('#2R9C2R9J', 'DB direct fixture', 10000, 999997, 'TOURNAMENT', 'ACTIVE');
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    - (SELECT generation FROM r3_rotation_marker) = 1
  AND (SELECT count(*) FROM r3_rotation_events) - (SELECT rotations FROM r3_rotation_marker) = 1,
  'a direct recruit insert retains its automatic single rotation and refresh'
);
UPDATE r3_rotation_marker
SET generation = (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter'),
    rotations = (SELECT count(*) FROM r3_rotation_events);

UPDATE drivers.recruits
SET raw_potential_score = raw_potential_score + 1
WHERE player_tag = '#2R9C2R9J';
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    - (SELECT generation FROM r3_rotation_marker) = 1
  AND (SELECT count(*) FROM r3_rotation_events) - (SELECT rotations FROM r3_rotation_marker) = 1,
  'a direct score update retains its automatic single rotation and refresh'
);
UPDATE r3_rotation_marker
SET generation = (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter'),
    rotations = (SELECT count(*) FROM r3_rotation_events);

INSERT INTO substrate.recruit_sync_rotation_guard (backend_pid, transaction_id, nesting_depth)
VALUES (pg_backend_pid(), pg_current_xact_id(), 7);
SELECT public.sync_recruits('[{"player_tag":"#2R9C2R9L","player_name":"Nested guard fixture",
  "trophies":10000,"donations":0,"cards":0,"war_wins":0,"win_rate":0,
  "source":"TOURNAMENT","status":"ACTIVE","raw_potential_score":999996}]'::jsonb);
SELECT ok(
  (SELECT generation FROM substrate.sync_snapshot_state WHERE snapshot_name = 'headhunter')
    - (SELECT generation FROM r3_rotation_marker) = 1
  AND (SELECT count(*) FROM r3_rotation_events) - (SELECT rotations FROM r3_rotation_marker) = 1,
  'a nested guard still permits exactly one explicit rotation and refresh'
);
SELECT is(
  (SELECT nesting_depth FROM substrate.recruit_sync_rotation_guard
   WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()),
  7,
  'successful nested synchronization restores the prior guard depth'
);
DELETE FROM substrate.recruit_sync_rotation_guard
WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();

SELECT throws_ok(
  $$ SELECT public.sync_recruits('[{"player_tag":"#2R9C2R9P","player_name":"rollback",
       "raw_potential_score":"not-a-number"}]'::jsonb) $$,
  '22P02', NULL,
  'invalid synchronization data raises and rolls back the guarded operation'
);
INSERT INTO substrate.recruit_sync_rotation_guard (backend_pid, transaction_id, nesting_depth)
VALUES (pg_backend_pid(), pg_current_xact_id(), 9);
SELECT throws_ok(
  $$ SELECT public.sync_recruits('[{"player_tag":"#2R9C2R9P","player_name":"rollback",
       "raw_potential_score":"not-a-number"}]'::jsonb) $$,
  '22P02', NULL,
  'an error in a nested invocation rolls its state back to the prior guard depth'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM drivers.players WHERE player_tag = '#2R9C2R9P')
  AND NOT EXISTS (SELECT 1 FROM drivers.recruits WHERE player_tag = '#2R9C2R9P')
  AND (SELECT nesting_depth = 9 FROM substrate.recruit_sync_rotation_guard
       WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()),
  'failed synchronization restores its prior nested guard state and leaves no partial rows'
);
DELETE FROM substrate.recruit_sync_rotation_guard
WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
SELECT ok(
  NOT EXISTS (SELECT 1 FROM substrate.recruit_sync_rotation_guard
              WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()),
  'normal and failed calls leave no stale guard after prior scope cleanup'
);

SELECT * FROM finish();
ROLLBACK;
