-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Recreate features.voyage_contributions View
 * 
 * Rationale:
 *   - The view was cascade-dropped in 20260517000000_restore_hist_in_roster_view.sql.
 *   - We need to recreate it using the new "voyage_crown_pct" column.
 *   - To ease manual troubleshooting, we also include the player's name (player_name)
 *     and their general RPeS performance_score from features.scoring_view.
 */

CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT 
    c.player_tag,
    s.name AS player_name,
    c.crowns,
    c.voyage_crown_pct,
    s.performance_score
FROM drivers.clan_voyage_contributions c
JOIN features.scoring_view s ON s.player_tag = c.player_tag
WHERE c.voyage_id = (SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1);

GRANT SELECT ON features.voyage_contributions TO authenticated, anon, service_role;
