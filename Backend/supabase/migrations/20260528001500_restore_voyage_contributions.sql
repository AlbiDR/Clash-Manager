-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Restore features.voyage_contributions View
 * 
 * Rationale:
 *   - The view was cascade-dropped when features.scoring_view was dropped in a previous migration.
 *   - We recreate features.voyage_contributions to avoid PWA fetch failures.
 */

BEGIN;

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

COMMIT;
