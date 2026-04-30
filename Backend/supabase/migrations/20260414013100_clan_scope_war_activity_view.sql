-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Infrastructure Alignment: Documenting the missing War Activity View
-- This view was previously a "ghost" in the database. We now codify it 
-- with clinical filtering to ensure only active residents are displayed.

DROP VIEW IF EXISTS features.war_activity_view;

CREATE OR REPLACE VIEW features.war_activity_view AS
SELECT 
    wa.member_tag AS tag,
    wa.name,
    wa.decks_used AS total_decks,
    wa.decks_used_today AS current_decks,
    wa.fame,
    -- Performance Classification (Clinical Logic)
    CASE
        WHEN (wa.decks_used_today >= 4) THEN 'Completed'::text
        WHEN (wa.decks_used_today > 0) THEN 'Partial'::text
        ELSE 'Missing'::text
    END AS status,
    wa.updated_at AS snapshot_at
FROM drivers.war_activity wa
JOIN drivers.members m ON wa.member_tag = m.tag
WHERE m.is_active = true
  AND wa.updated_at > (now() - interval '24 hours')
ORDER BY wa.decks_used_today ASC, wa.fame DESC;

COMMENT ON VIEW features.war_activity_view IS 'Active resident war participation summary. Filters out external participants from river race payloads.';
