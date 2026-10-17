-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(16);

SELECT ok(NOT (SELECT prosecdef FROM pg_proc
 WHERE oid = 'drivers.sync_exclusion_cache()'::regprocedure),
 'exclusion maintenance retains live SECURITY INVOKER behavior');
SELECT is((SELECT proconfig FROM pg_proc
 WHERE oid = 'drivers.sync_exclusion_cache()'::regprocedure),
 ARRAY['search_path=public, features, drivers, substrate, pg_temp']::text[],
 'the fixed search path is unchanged');

INSERT INTO drivers.players(player_tag,player_name) VALUES
 ('#QQQQQQQQ','Exclusion member'), ('#QQQQQQQY','Replacement member'), ('#QQQQQQQP','Replacement blacklist');
INSERT INTO drivers.members(player_tag,player_name) VALUES ('#QQQQQQQQ','Exclusion member');
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'member insert adds its exclusion');
INSERT INTO drivers.recruit_blacklist(player_tag,reason) VALUES ('#QQQQQQQQ','test');
DELETE FROM drivers.members WHERE player_tag='#QQQQQQQQ';
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'member deletion retains an overlapping blacklist exclusion');
DELETE FROM drivers.recruit_blacklist WHERE player_tag='#QQQQQQQQ';
SELECT ok(NOT EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'last source deletion removes its exclusion');

INSERT INTO drivers.members(player_tag,player_name) VALUES ('#QQQQQQQQ','Exclusion member');
INSERT INTO drivers.recruit_blacklist(player_tag,reason) VALUES ('#QQQQQQQQ','test');
DELETE FROM drivers.recruit_blacklist WHERE player_tag='#QQQQQQQQ';
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'blacklist deletion retains an overlapping member exclusion');

CREATE TEMP TABLE cache_writes(operation text);
CREATE FUNCTION pg_temp.record_exclusion_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO cache_writes VALUES(TG_OP);
 RETURN NULL;
END;
$$;
CREATE TRIGGER test_exclusion_writes AFTER INSERT OR UPDATE OR DELETE ON drivers.exclusion_cache
 FOR EACH STATEMENT EXECUTE FUNCTION pg_temp.record_exclusion_write();
UPDATE drivers.members SET next_poll_at=now() WHERE player_tag='#QQQQQQQQ';
SELECT is((SELECT count(*)::integer FROM cache_writes),0,
 'scheduling-only updates issue no cache write statement');
INSERT INTO drivers.recruit_blacklist(player_tag,reason) VALUES ('#QQQQQQQQ','test');
TRUNCATE cache_writes;
UPDATE drivers.recruit_blacklist SET reason='changed',player_tag=player_tag WHERE player_tag='#QQQQQQQQ';
SELECT is((SELECT count(*)::integer FROM cache_writes),0,
 'same-tag blacklist updates issue no cache write statement');

UPDATE drivers.members SET player_tag='#QQQQQQQY' WHERE player_tag='#QQQQQQQQ';
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQY'),
 'member tag replacement adds the new exclusion');
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'member tag replacement retains an old tag still blacklisted');
UPDATE drivers.recruit_blacklist SET player_tag='#QQQQQQQP' WHERE player_tag='#QQQQQQQQ';
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQP'),
 'blacklist tag replacement adds the new exclusion');
SELECT ok(NOT EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'blacklist tag replacement removes an unowned old tag');
UPDATE drivers.members SET player_tag='#QQQQQQQQ' WHERE player_tag='#QQQQQQQY';
SELECT ok(NOT EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQY'),
 'member tag replacement removes an unowned old tag');
SAVEPOINT exclusion_rollback;
DELETE FROM drivers.members WHERE player_tag='#QQQQQQQQ';
SELECT ok(NOT EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'deletion updates cache within the transaction');
ROLLBACK TO SAVEPOINT exclusion_rollback;
SELECT ok(EXISTS(SELECT FROM drivers.exclusion_cache WHERE player_tag='#QQQQQQQQ'),
 'transaction rollback restores source and cache together');
SELECT is((SELECT count(*)::integer FROM (
 (SELECT player_tag FROM drivers.exclusion_cache EXCEPT
  (SELECT player_tag FROM drivers.members UNION SELECT player_tag FROM drivers.recruit_blacklist))
 UNION ALL
 ((SELECT player_tag FROM drivers.members UNION SELECT player_tag FROM drivers.recruit_blacklist)
  EXCEPT SELECT player_tag FROM drivers.exclusion_cache)
) AS difference),0,'cache equals the source union after mixed operations');
SELECT * FROM finish();
ROLLBACK;
