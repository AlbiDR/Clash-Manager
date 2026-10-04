-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
BEGIN;

-- Include pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the tests
SELECT plan(16);

-- -------------------------------------------------------------------------
-- SCHEMAS & DEPENDENCIES
-- -------------------------------------------------------------------------
SELECT has_schema('substrate');
SELECT has_schema('drivers');
SELECT has_schema('features');

-- -------------------------------------------------------------------------
-- L2 DRIVERS (SSoT RECRUIT DATA)
-- -------------------------------------------------------------------------
-- Rewritten 2026-10-04 for the schema as it stands. The first version tested
-- a substrate.raw_scout_logs buffer with a blacklist-aware shredder, and
-- recruits keyed by `tag` with a `raw_score`; none of that exists any more.
-- Recruits are keyed by player_tag and scored by raw_potential_score, and the
-- scanner skips dismissed players through drivers.exclusion_cache, which a
-- trigger on the blacklist keeps current. The intent of every check is kept.
SELECT has_table('drivers', 'recruits', 'Should have a table for queued and active recruits');
SELECT col_is_pk('drivers', 'recruits', 'player_tag', 'Recruits are keyed by player tag');
SELECT has_column('drivers', 'recruits', 'raw_potential_score', 'Recruit should have a raw potential score');
SELECT has_column('drivers', 'recruits', 'status', 'Recruit should have a lifecycle status (ACTIVE/QUEUE/INVITED/ARCHIVED)');

SELECT has_table('drivers', 'recruit_blacklist', 'Should have a table for dismissals');
SELECT col_is_pk('drivers', 'recruit_blacklist', 'player_tag', 'Blacklist is keyed by player tag');
SELECT has_column('drivers', 'recruit_blacklist', 'expires_at', 'Blacklist entries should eventually expire');

-- -------------------------------------------------------------------------
-- FUNCTIONAL TESTS: DISMISSAL, EXCLUSION & MAINTENANCE
-- -------------------------------------------------------------------------
-- Tags use only the characters the player_tag CHECK constraints allow
-- (0289CGJLPQRUVY); the first version's '#TEST1' would be rejected.

-- 1. Setup Mock Recruit. drivers.recruits.player_tag references
--    drivers.players (fk_recruits_player), so the player row comes first.
INSERT INTO drivers.players (player_tag) VALUES ('#2PP');
INSERT INTO drivers.recruits (player_tag, player_name, source, raw_potential_score)
VALUES ('#2PP', 'Test Player', 'TOURNAMENT', 100.5);

-- 2. Dismissal moves the recruit from recruits to the blacklist
SELECT drivers.dismiss_recruit('#2PP', 1);

SELECT is_empty('SELECT 1 FROM drivers.recruits WHERE player_tag = ''#2PP''', 'Dismissed recruit should be removed from recruits table');
SELECT results_eq(
    'SELECT player_tag, raw_potential_score FROM drivers.recruit_blacklist WHERE player_tag = ''#2PP''',
    $$VALUES ('#2PP'::text, 100.5::numeric)$$,
    'Dismissed recruit should be present in blacklist with original score'
);

-- 3. ... and keeps it out of future scans, which is what the old shredder test
--    guarded: the scanner reads drivers.exclusion_cache, not the blacklist.
SELECT isnt_empty('SELECT 1 FROM drivers.exclusion_cache WHERE player_tag = ''#2PP''', 'A dismissed recruit should be excluded from future scans');

-- 4. Maintenance (The Purge) evicts expired entries and releases them
INSERT INTO drivers.recruit_blacklist (player_tag, reason, expires_at)
VALUES ('#2QQ', 'TEST', NOW() - INTERVAL '1 day');

SELECT ok(drivers.purge_expired_blacklist() >= 1, 'Purge should remove at least 1 expired entry');
SELECT is_empty('SELECT 1 FROM drivers.recruit_blacklist WHERE player_tag = ''#2QQ''', 'Expired entry should be deleted after purge');
SELECT is_empty('SELECT 1 FROM drivers.exclusion_cache WHERE player_tag = ''#2QQ''', 'A purged entry should be scannable again');

SELECT * FROM finish();
ROLLBACK;
