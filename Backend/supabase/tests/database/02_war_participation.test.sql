-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
BEGIN;

-- Include pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan the tests
SELECT plan(1);

-- 1. Setup Mock Player and Member (using characters allowed by regex check).
--    drivers.members.player_tag references drivers.players (fk_members_player),
--    so the player row comes first; without it the member insert is rejected
--    and the test never reaches its assertion.
INSERT INTO drivers.players (player_tag) VALUES ('#J00L');
INSERT INTO drivers.members (player_tag, player_name, role, exp_level, is_active, joined_at, last_seen_at)
VALUES ('#J00L', 'War Test Player', 'member', 50, true, NOW() - INTERVAL '10 days', NOW());

-- 2. Setup Mock War Activity with 16 decks used (maximum allowed per week: 4 days * 4 decks).
--    player_name and section_index are required columns of drivers.war_activity.
INSERT INTO drivers.war_activity (player_tag, player_name, week_id, section_index, fame, decks_used)
VALUES ('#J00L', 'War Test Player', '2026_w01', 0, 1000, 16);

-- 3. Assert that war_participation in features.roster_view is correctly normalized to 100.0%
SELECT results_eq(
    'SELECT war_participation FROM features.roster_view WHERE player_tag = ''#J00L''',
    'VALUES (100.0::numeric)',
    'War participation rate for using 16 decks must be exactly 100.0%'
);

SELECT * FROM finish();
ROLLBACK;
