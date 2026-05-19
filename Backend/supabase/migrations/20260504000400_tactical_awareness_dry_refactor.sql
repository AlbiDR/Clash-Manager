-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration: Tactical Awareness DRY Refactor
-- Refactors features.tactical_awareness_view to achieve 10/10 DRY compliance.
-- Implements layered CTEs, centralized thresholds, and integrates performance weighting.

BEGIN;

DROP VIEW IF EXISTS features.tactical_awareness_view;

CREATE OR REPLACE VIEW features.tactical_awareness_view AS
 WITH 
  benchmarking_context AS (
      -- Centralized tactical thresholds
      SELECT 
          '18:00:00'::TIME AS war_deadline,
          '14:00:00'::TIME AS warning_window,
          4 AS full_deck_count,
          (now() AT TIME ZONE 'UTC')::TIME AS current_time_utc
  ),
  source_data AS (
      -- Primary source with authoritative tag validation and scoring integration
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
          s.days_inactive,
          ltrim(m.player_tag, '#'::text) as raw_tag
      FROM drivers.members m
      LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
      WHERE m.is_active = true
        AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
  ),
  status_eval AS (
      -- Logical evaluation layer (DRY)
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

-- Re-apply permissions
GRANT SELECT ON features.tactical_awareness_view TO authenticated, anon, service_role;

COMMIT;
