-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Restore voyage_contributions view
 * -----------------------------------------------------------------------
 * Root Cause: The previous migration (20260520223500) dropped `features.scoring_view`
 * CASCADE, which unintentionally dropped the dependent view `features.voyage_contributions`.
 * Fix: Recreate `features.voyage_contributions` with the exact original definition.
 */

BEGIN;

CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT 
    c.player_tag,
    c.crowns,
    s.performance_score
FROM drivers.clan_voyage_contributions c
JOIN features.scoring_view s ON s.player_tag = c.player_tag
WHERE c.voyage_id = (SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1);

GRANT SELECT ON features.voyage_contributions TO authenticated, anon, service_role;

COMMIT;
