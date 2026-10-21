-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(28);
SELECT ok(NOT has_function_privilege('anon','public.record_recruit_battle_polls(text[])','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.record_recruit_battle_polls(text[])','EXECUTE')
 AND has_function_privilege('service_role','public.record_recruit_battle_polls(text[])','EXECUTE'),
 'poll acknowledgment is service-role-only');
SELECT ok(NOT EXISTS(SELECT FROM pg_proc p,
 LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid='public.record_recruit_battle_polls(text[])'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),
 'PUBLIC has no poll acknowledgment execution grant');
SELECT ok((SELECT prosecdef AND proconfig=ARRAY['search_path=""'] FROM pg_proc
 WHERE oid='public.record_recruit_battle_polls(text[])'::regprocedure),
 'the new privileged command has an empty fixed search path');

-- Use real triggers throughout, retaining sufficient ranking capacity for 301
-- active fixtures. Everything, including config and archive changes, rolls back.
UPDATE substrate.config SET value='1000' WHERE key='MAX_ACTIVE_RECRUITS';
UPDATE substrate.config SET value='50' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
UPDATE drivers.recruits SET status='ARCHIVED';
CREATE TEMP TABLE poll_fixture AS
 SELECT '#QQQQ'||string_agg(substr('0289',((i >> (digit*2)) & 3)+1,1),'' ORDER BY digit DESC) AS tag
 FROM generate_series(0,300) i CROSS JOIN generate_series(0,4) digit GROUP BY i;
INSERT INTO drivers.players(player_tag,player_name) SELECT tag,'Poll fairness fixture' FROM poll_fixture;
INSERT INTO drivers.recruits(player_tag,player_name,source,status,raw_potential_score)
 SELECT tag,'Poll fairness fixture','MANUAL','ACTIVE',1 FROM poll_fixture;
SELECT is((SELECT count(*)::integer FROM drivers.recruits WHERE status='ACTIVE'),301,
 'the fixture exceeds both 250 active recruits and a 50-target batch');
CREATE TEMP TABLE initial_poll_targets AS SELECT public.get_ingestion_targets() payload;
SELECT is(jsonb_array_length((SELECT payload->'drivers.recruits' FROM initial_poll_targets)),50,
 'the inner selection limits actual recruit targets to 50');
SELECT is((SELECT count(*)::integer FROM drivers.recruits WHERE last_battle_poll_at IS NOT NULL),0,
 'selection alone never marks queued or unstarted work');
SELECT is((SELECT payload->'drivers.recruits' FROM initial_poll_targets),
 (SELECT jsonb_agg(tag ORDER BY tag COLLATE "C") FROM
  (SELECT tag FROM poll_fixture ORDER BY tag COLLATE "C" LIMIT 50) t),
 'initial null timestamps use deterministic C tag ordering');

CREATE TEMP TABLE poll_seen(tag text PRIMARY KEY);
DO $$ DECLARE tags text[]; BEGIN
 FOR cycle IN 1..6 LOOP
  SELECT array_agg(tag) INTO tags FROM jsonb_array_elements_text(public.get_ingestion_targets()->'drivers.recruits') tag;
  INSERT INTO poll_seen SELECT unnest(tags);
  PERFORM public.record_recruit_battle_polls(tags);
 END LOOP;
END $$;
SELECT is((SELECT count(*)::integer FROM poll_seen),300,
 'six 50-attempt cycles visit 300 distinct recruits without starvation');
SELECT is((SELECT count(*)::integer FROM drivers.recruits WHERE last_battle_poll_at IS NULL AND status='ACTIVE'),1,
 'the one unstarted recruit remains unmarked');
SELECT ok((SELECT last_battle_poll_at IS NULL FROM drivers.recruits
 WHERE player_tag=(public.get_ingestion_targets()->'drivers.recruits'->>0)),
 'the next cycle leads with the remaining unattempted recruit');
SELECT lives_ok($$SELECT public.record_recruit_battle_polls(ARRAY[]::text[])$$,
 'an empty attempted batch is a safe no-op');
SAVEPOINT poll_rollback;
SELECT public.record_recruit_battle_polls(ARRAY[(SELECT tag FROM poll_fixture EXCEPT SELECT tag FROM poll_seen LIMIT 1)]);
SELECT is((SELECT count(*)::integer FROM drivers.recruits WHERE last_battle_poll_at IS NOT NULL),301,
 'recording an actual attempt needs no changed battle data or success result');
ROLLBACK TO SAVEPOINT poll_rollback;
SELECT is((SELECT count(*)::integer FROM drivers.recruits WHERE last_battle_poll_at IS NULL AND status='ACTIVE'),1,
 'attempt cursor updates roll back atomically');
SELECT throws_ok($$SELECT public.record_recruit_battle_polls(NULL)$$,'22023',NULL,'null input is rejected');
SELECT throws_ok($$SELECT public.record_recruit_battle_polls(ARRAY[(SELECT min(tag) FROM poll_fixture),'invalid'])$$,
 '22023',NULL,'mixed valid and malformed tags fail before any write');
SELECT throws_ok($$SELECT public.record_recruit_battle_polls(array_fill('#QQQQ00000'::text,ARRAY[51]))$$,
 '22023',NULL,'raw input cardinality is bounded before deduplication');
UPDATE substrate.config SET value='not-an-integer' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT throws_ok($$SELECT public.get_ingestion_targets()$$,'22023',NULL,'selection rejects malformed config');
SELECT throws_ok($$SELECT public.record_recruit_battle_polls(ARRAY[]::text[])$$,'22023',NULL,'acknowledgment rejects malformed config');
UPDATE substrate.config SET value='51' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT throws_ok($$SELECT public.get_ingestion_targets()$$,'22023',NULL,'config cannot exceed the existing 50-target safety bound');
UPDATE substrate.config SET value='0' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT throws_ok($$SELECT public.get_ingestion_targets()$$,'22023',NULL,'zero batch config is rejected');
UPDATE substrate.config SET value='-1' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT throws_ok($$SELECT public.get_ingestion_targets()$$,'22023',NULL,'negative batch config is rejected');
UPDATE substrate.config SET value='999999999999999999999' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT throws_ok($$SELECT public.record_recruit_battle_polls(ARRAY[]::text[])$$,'22023',NULL,'overflow config is rejected consistently');
DELETE FROM substrate.config WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT throws_ok($$SELECT public.get_ingestion_targets()$$,'22023',NULL,'absent batch config is rejected');
INSERT INTO substrate.config(key,value) VALUES('RECRUIT_BATTLE_POLL_BATCH_SIZE','50');
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.record_recruit_battle_polls(ARRAY['#QQQQ00000','#QQQQ00000'])$$,
 'service-role can acknowledge duplicate actual attempts safely');
RESET ROLE;

-- More than 50 active members must remain uncapped, including when a voyage
-- bypasses a future member polling deadline.
INSERT INTO drivers.members(player_tag,player_name,next_poll_at,is_active)
 SELECT tag,'Poll fairness member',now()+interval '1 day',true FROM poll_fixture ORDER BY tag LIMIT 60;
SELECT is(jsonb_array_length(public.get_ingestion_targets()->'drivers.members'),0,
 'without a voyage, future scheduled members are not due');
UPDATE drivers.members SET next_poll_at=NULL;
SELECT is(jsonb_array_length(public.get_ingestion_targets()->'drivers.members'),60,
 'all 60 due members are returned without applying the recruit cap');
UPDATE drivers.members SET next_poll_at=now()+interval '1 day';
INSERT INTO drivers.clans(clan_tag,clan_name,last_ingested_at) VALUES('#QQQQ','Poll voyage fixture',now());
INSERT INTO drivers.clan_voyage(clan_tag,target_crowns,start_at,end_at,status)
 VALUES('#QQQQ',1,now(),now()+interval '1 hour','ACTIVE');
SELECT is(jsonb_array_length(public.get_ingestion_targets()->'drivers.members'),60,
 'an active voyage includes all 60 future-scheduled active members');
UPDATE substrate.config SET value='1' WHERE key='RECRUIT_BATTLE_POLL_BATCH_SIZE';
SELECT is(jsonb_array_length(public.get_ingestion_targets()->'drivers.recruits'),1,
 'both selection and acknowledgment honor a smaller configured batch');
SELECT * FROM finish();
ROLLBACK;
