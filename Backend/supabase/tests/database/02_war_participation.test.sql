-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
BEGIN;

-- Include pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the tests
SELECT plan(1);

-- 1. Setup Mock Member (using characters allowed by regex check)
INSERT INTO drivers.members (player_tag, player_name, role, exp_level, is_active, joined_at, last_seen_at)
VALUES ('#J00L', 'War Test Player', 'member', 50, true, NOW() - INTERVAL '10 days', NOW());

-- 2. Setup Mock War Activity with 16 decks used (maximum allowed per week: 4 days * 4 decks)
INSERT INTO drivers.war_activity (player_tag, week_id, fame, decks_used)
VALUES ('#J00L', '2026_w01', 1000, 16);

-- 3. Assert that war_participation in features.roster_view is correctly normalized to 100.0%
SELECT results_eq(
    'SELECT war_participation FROM features.roster_view WHERE player_tag = ''#J00L''',
    'VALUES (100.0::numeric)',
    'War participation rate for using 16 decks must be exactly 100.0%'
);

SELECT * FROM finish();
ROLLBACK;
