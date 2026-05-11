-- Migration: Tactical & War Activity Pipeline Hardening
-- Implements the 10/10 Enriched pattern for reporting views.
-- Refines features.tactical_awareness_view and features.war_activity_view.

BEGIN;

-- 1. Hardening features.tactical_awareness_view
-- Rationale: Move temporal math to CTE, improve sorting, and ensure integer-safe label generation.
DROP VIEW IF EXISTS features.tactical_awareness_view;

CREATE OR REPLACE VIEW features.tactical_awareness_view AS
 WITH 
  benchmarking_context AS (
      SELECT 
          '18:00:00'::TIME AS war_deadline,
          '14:00:00'::TIME AS warning_window,
          4 AS full_deck_count,
          (now() AT TIME ZONE 'UTC')::TIME AS current_time_utc
  ),
  source_data AS (
      SELECT 
          m.player_tag,
          m.player_name,
          m.current_clan_tag,
          m.trophies,
          m.week_fame,
          m.decks_used_today,
          m.decks_used_weekly,
          m.last_seen_at,
          s.performance_score,
          (EXTRACT(EPOCH FROM (now() - m.last_seen_at)) / 86400.0) AS days_inactive,
          ltrim(m.player_tag, '#'::text) as raw_tag
      FROM drivers.members m
      LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
      WHERE m.is_active = true
        AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
  ),
  status_eval AS (
      SELECT 
          s.*,
          bc.full_deck_count - s.decks_used_today AS decks_remaining,
          (s.decks_used_today >= bc.full_deck_count) AS is_complete,
          (bc.current_time_utc > bc.war_deadline) AS is_past_deadline,
          (bc.current_time_utc > bc.warning_window) AS is_in_warning_window
      FROM source_data s
      CROSS JOIN benchmarking_context bc
  )
  SELECT 
      player_tag,
      player_name,
      current_clan_tag,
      trophies,
      week_fame,
      decks_used_today,
      decks_used_weekly,
      performance_score,
      decks_remaining,
      CASE 
          WHEN is_complete THEN 'COMPLETE'::text
          WHEN is_past_deadline THEN 'CRITICAL'::text
          WHEN is_in_warning_window THEN 'WARNING'::text
          ELSE 'PENDING'::text
      END AS war_status,
      substrate.format_last_seen(days_inactive) AS last_seen_label,
      last_seen_at,
      ('https://link.clashroyale.com/en?player='::text || raw_tag) AS ingame_link,
      ('https://royaleapi.com/player/'::text || raw_tag) AS royaleapi_link
  FROM status_eval
  ORDER BY 
      is_complete ASC, 
      is_past_deadline DESC, 
      performance_score DESC NULLS LAST;

GRANT SELECT ON features.tactical_awareness_view TO authenticated, anon, service_role;


-- 2. Hardening features.war_activity_view
-- Rationale: Add member context (role, status) and efficiency metrics (fame per deck).
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
      wa.updated_at,
      ltrim(wa.player_tag, '#'::text) AS raw_tag
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
    player_tag,
    'https://royaleapi.com/player/'::text || raw_tag || '/war/analytics' AS war_analytics_link
 FROM activity_enriched
 ORDER BY week_id DESC, fame DESC;

GRANT SELECT ON features.war_activity_view TO authenticated, anon, service_role;

COMMIT;
