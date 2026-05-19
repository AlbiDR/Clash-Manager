-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
BEGIN;

-- Include pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the tests
SELECT plan(15);

-- -------------------------------------------------------------------------
-- SCHEMAS & DEPENDENCIES
-- -------------------------------------------------------------------------
SELECT has_schema('substrate');
SELECT has_schema('drivers');
SELECT has_schema('features');

-- -------------------------------------------------------------------------
-- L0 SUBSTRATE (RAW LOGS)
-- -------------------------------------------------------------------------
SELECT has_table('substrate', 'raw_scout_logs', 'Should have a buffer table for raw scout data');
SELECT has_column('substrate', 'raw_scout_logs', 'id', 'Buffer should have an id');
SELECT has_column('substrate', 'raw_scout_logs', 'payload', 'Buffer should have a JSONB payload');
SELECT has_column('substrate', 'raw_scout_logs', 'source', 'Buffer should define source (TOURNAMENT/SHADOW)');

-- -------------------------------------------------------------------------
-- L2 DRIVERS (SSoT RECRUIT DATA)
-- -------------------------------------------------------------------------
SELECT has_table('drivers', 'recruits', 'Should have a table for benched and active recruits');
SELECT has_pk('drivers', 'recruits', 'Recruits table should have a primary key (tag)');
SELECT has_column('drivers', 'recruits', 'tag', 'Recruit should have a tag');
SELECT has_column('drivers', 'recruits', 'raw_score', 'Recruit should have a raw score');
SELECT has_column('drivers', 'recruits', 'status', 'Recruit should have a strict status constraint (ACTIVE/BENCHED/INVITED)');

SELECT has_table('drivers', 'recruit_blacklist', 'Should have a table for dismissals');
SELECT has_pk('drivers', 'recruit_blacklist', 'Blacklist should have a primary key (tag)');
SELECT has_column('drivers', 'recruit_blacklist', 'expiry_date', 'Blacklist should eventually expire');

-- -------------------------------------------------------------------------
-- FUNCTIONAL TESTS: DISMISSAL & MAINTENANCE
-- -------------------------------------------------------------------------
-- 1. Setup Mock Recruit
INSERT INTO drivers.recruits (tag, name, source, raw_score)
VALUES ('#TEST1', 'Test Player', 'TOURNAMENT', 100.5);

-- 2. Test Dismissal (Banished from recruits -> Moved to blacklist)
SELECT drivers.dismiss_recruit('#TEST1', 1);

SELECT is_empty('SELECT 1 FROM drivers.recruits WHERE tag = ''#TEST1''', 'Dismissed recruit should be removed from recruits table');
SELECT results_eq('SELECT tag, raw_score FROM drivers.recruit_blacklist WHERE tag = ''#TEST1''', 
    'VALUES (''#TEST1'', 100.5)', 'Dismissed recruit should be present in blacklist with original score');

-- 3. Test Ingestion Block (Blacklisted tags should be filtered by shredder)
INSERT INTO substrate.raw_scout_logs (payload, source)
VALUES ('[{"tag": "#TEST1", "name": "Test Player", "rawScore": 999}]'::jsonb, 'TOURNAMENT');

SELECT is_empty('SELECT 1 FROM drivers.recruits WHERE tag = ''#TEST1''', 'Blacklisted player should NOT be re-ingested by shredder');

-- 4. Test Maintenance (The Purge)
-- Force an expired entry
INSERT INTO drivers.recruit_blacklist (tag, expiry_date)
VALUES ('#EXPIRED', NOW() - INTERVAL '1 day');

SELECT ok(drivers.purge_expired_blacklist() >= 1, 'Purge should remove at least 1 expired entry');
SELECT is_empty('SELECT 1 FROM drivers.recruit_blacklist WHERE tag = ''#EXPIRED''', 'Expired entry should be deleted after purge');

SELECT * FROM finish();
ROLLBACK;
