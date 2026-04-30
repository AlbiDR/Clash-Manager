-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Recreate roster_view without the clan_tag visibility to remove noise,
-- and automatically enforce RoyaleAPI tag format to filter out dummy tests.
DROP VIEW IF EXISTS features.roster_view;
CREATE OR REPLACE VIEW features.roster_view AS
 SELECT m.tag,
    m.name,
    m.role,
    m.exp_level,
    m.trophies,
    m.donations,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.raw_performance_score,
    s.performance_score,
    s.stability_index,
    m.last_seen_at,
        CASE
            WHEN (((s.days_inactive * (24)::numeric) * (60)::numeric) < (60)::numeric) THEN 'Now'::text
            WHEN ((s.days_inactive * (24)::numeric) < (1)::numeric) THEN ((((s.days_inactive * (24)::numeric) * (60)::numeric))::integer || 'm'::text)
            WHEN (s.days_inactive < (1)::numeric) THEN (((s.days_inactive * (24)::numeric))::integer || 'h'::text)
            ELSE ((s.days_inactive)::integer || 'd'::text)
        END AS tenure_label
   FROM (drivers.members m
     LEFT JOIN features.scoring_view s ON ((m.tag = s.tag)))
  WHERE m.is_active = true 
    AND m.tag ~ '^#[0289CGJLPQRUVY]+$'
  ORDER BY s.raw_performance_score DESC, s.performance_score DESC;
