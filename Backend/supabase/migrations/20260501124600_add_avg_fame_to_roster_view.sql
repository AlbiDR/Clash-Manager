-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- ROSTER VIEW ENRICHMENT: Average Fame Integration
--
-- Rebuilds features.roster_view to include avg_fame from the scoring engine.
-- This ensures the PWA can display historical average fame instead of just
-- the current week's total (which is often zero early in the week).
-- =============================================================================

DROP VIEW IF EXISTS features.roster_view CASCADE;

CREATE VIEW features.roster_view
WITH (security_invoker = true)
AS
SELECT
    m.player_tag,
    m.player_name,
    m.role,
    ('https://link.clashroyale.com/en?player=' || ltrim(m.player_tag, '#')) AS ingame_link,
    ('https://royaleapi.com/player/'           || ltrim(m.player_tag, '#')) AS royaleapi_link,
    m.exp_level,
    m.trophies,
    m.donations,
    m.donations_received,
    m.clan_rank,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.avg_fame,
    s.raw_performance_score,
    s.raw_performance_score AS rpes,
    s.performance_score,
    s.performance_score AS pes,
    s.stability_index,
    m.last_seen_at,
    m.last_ingested_at,
    substrate.format_last_seen(s.days_inactive)   AS last_seen_label,
    substrate.format_tenure(s.tenure_days)         AS tenure_label,
    s.tenure_days
FROM drivers.members m
LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
WHERE m.is_active = TRUE
  AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'
ORDER BY s.raw_performance_score DESC NULLS LAST,
         s.performance_score      DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;
