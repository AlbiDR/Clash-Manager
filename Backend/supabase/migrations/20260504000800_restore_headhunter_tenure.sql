-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration: Restore Headhunter Heritage Tenure
-- Rationale: Restores the missing tenure reporting for former members/veterans in the headhunter view.
-- This ensures the PWA can correctly report the heritage "Tenure" alongside discovery "Longevity".

BEGIN;

DROP VIEW IF EXISTS features.headhunter_view;

CREATE OR REPLACE VIEW features.headhunter_view AS
 WITH 
  benchmarking_context AS (
      SELECT GREATEST(
          COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'::drivers.recruit_status), 0::numeric),
          COALESCE((SELECT max(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()), 0::numeric),
          COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits), 1::numeric)
      ) AS max_corpus_score
  ),
  heritage_context AS (
      SELECT 
         player_tag,
         max_pes,
         tenure_days,
         (last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
      FROM drivers.heritage_ledger
  ),
  base_calculations AS (
      SELECT 
         r.player_name,
         r.player_tag,
         r.trophies,
         r.donations,
         r.cards,
         r.war_wins,
         r.raw_potential_score,
         r.found_date,
         r.last_scan AS last_seen_at,
         (EXTRACT(epoch FROM (now() - r.found_date))::integer / 60) AS raw_longevity_mins,
         h.player_tag IS NOT NULL as is_former_member,
         COALESCE(h.is_fresh AND h.max_pes >= 80, false) AS has_blessing,
         h.tenure_days as heritage_tenure_days
        FROM drivers.recruits r
        LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
       WHERE r.status = 'ACTIVE'::drivers.recruit_status 
         AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = r.player_tag)
         AND r.trophies > 0 
         AND r.raw_potential_score > 0::numeric
  ),
  scoring_layer AS (
      SELECT 
        bc.max_corpus_score,
        b.*,
        LEAST(100::numeric, round((((b.raw_potential_score * (CASE WHEN b.has_blessing THEN 1.05 ELSE 1.0 END)) / bc.max_corpus_score) * 100::numeric))) AS potential_score
      FROM base_calculations b
      CROSS JOIN benchmarking_context bc
  )
  SELECT 
    player_name,
    player_tag,
    trophies,
    donations,
    cards,
    war_wins,
    raw_potential_score,
    potential_score,
    substrate.format_longevity(raw_longevity_mins) AS longevity_label,
    raw_longevity_mins AS longevity,
    substrate.format_tenure(heritage_tenure_days) AS tenure_label,
    heritage_tenure_days AS tenure_days,
    CASE 
        WHEN potential_score >= 90::numeric THEN 'ELITE'::text
        WHEN potential_score >= 75::numeric THEN 'HIGH'::text
        ELSE 'MID'::text
    END AS tier,
    CASE 
        WHEN has_blessing THEN 'RETURNING_VETERAN'::text
        WHEN is_former_member THEN 'FORMER_MEMBER'::text
        ELSE 'NEW_CANDIDATE'::text
    END AS heritage_status,
    has_blessing AS has_heritage_blessing,
    last_seen_at,
    found_date,
    ('https://link.clashroyale.com/en?player='::text || ltrim(player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(player_tag, '#'::text)) AS royaleapi_link
  FROM scoring_layer
  ORDER BY raw_potential_score DESC;

COMMIT;
