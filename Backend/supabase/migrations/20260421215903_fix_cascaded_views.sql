-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Rebuild features.tactical_awareness_view without current_clan_tag

CREATE OR REPLACE VIEW features.tactical_awareness_view AS
 SELECT 
    player_tag,
    player_name,
    trophies,
    week_fame,
    decks_used_today,
    CASE 
        WHEN decks_used_today < 4 AND (now() AT TIME ZONE 'UTC')::TIME > '18:00:00'::TIME THEN 'CRITICAL'
        WHEN decks_used_today < 4 THEN 'PENDING'
        ELSE 'COMPLETE'
    END as war_status
 FROM drivers.members
 WHERE is_active = true;

COMMENT ON VIEW features.tactical_awareness_view IS 'Global temporal sync anchored to 10:00 UTC. The source of truth for PWA phase labels.';
