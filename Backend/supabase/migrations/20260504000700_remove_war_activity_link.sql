-- Migration: Remove War Analytics Link from War Activity View
-- Removes the 'war_analytics_link' column as requested to keep the view clean.

BEGIN;

DROP VIEW IF EXISTS features.war_activity_view;

CREATE OR REPLACE VIEW features.war_activity_view AS
 WITH 
  activity_enriched AS (
    SELECT
      wa.player_tag,
      wa.player_name,
      m.role,
      COALESCE(m.is_active, false) AS is_still_in_clan,
      wa.week_id,
      wa.section_index,
      wa.decks_used,
      wa.decks_used_today,
      wa.fame,
      -- Performance Ratio: Fame per Deck
      CASE 
        WHEN wa.decks_used > 0 THEN round(wa.fame::numeric / wa.decks_used::numeric, 1)
        ELSE 0::numeric 
      END AS fame_per_deck,
      -- Decks missed (Based on standard 4-day war = 16 decks)
      GREATEST(0, 16 - wa.decks_used) AS decks_remaining_weekly,
      wa.updated_at
    FROM drivers.war_activity wa
    LEFT JOIN drivers.members m ON m.player_tag = wa.player_tag
  )
 SELECT 
    player_name,
    role,
    is_still_in_clan,
    week_id,
    section_index,
    decks_used,
    decks_used_today,
    fame,
    fame_per_deck,
    decks_remaining_weekly,
    updated_at,
    player_tag
 FROM activity_enriched
 ORDER BY week_id DESC, fame DESC;

GRANT SELECT ON features.war_activity_view TO authenticated, anon, service_role;

COMMIT;
