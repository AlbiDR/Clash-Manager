-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- HEADHUNTER SCORING RESTORATION: potential_score & rpos Columns
--
-- Restores features.headhunter_view to the full clinical definition that was
-- stripped during the 20260422120000_bug_audit_16_fixes security hardening pass.
--
-- The bug_audit reduced the view to a flat SELECT, removing:
--   - elite_benchmark CTE (normalization anchor)
--   - heritage_context CTE (returning veteran bonus)
--   - potential_score  (0–100 window-relative POS)
--   - longevity / longevity_label
--   - tier (ELITE / HIGH / MID)
--   - heritage_status (NEW_CANDIDATE / FORMER_MEMBER / RETURNING_VETERAN)
--   - has_heritage_blessing
--   - ingame_link / royaleapi_link
--   - blacklist exclusion guard
--
-- This migration restores all of the above using SECURITY INVOKER.
-- Column names updated to use the current 'player_name' (not legacy 'name').
-- =============================================================================

DROP VIEW IF EXISTS features.headhunter_view CASCADE;

CREATE VIEW features.headhunter_view
WITH (security_invoker = true)
AS
WITH elite_benchmark AS (
    -- Anchor: average raw_performance_score of the top-10 active roster members.
    -- Used as the normalization denominator for potential_score.
    -- Falls back to 12000 if the scoring_view is empty.
    SELECT COALESCE(AVG(sub.score), 12000::numeric) AS value
    FROM (
        SELECT raw_performance_score AS score
        FROM features.scoring_view
        ORDER BY raw_performance_score DESC
        LIMIT 10
    ) sub
),
heritage_context AS (
    -- Identifies recruits who were previously active members.
    -- is_fresh = seen within the last 30 days (returning veteran signal).
    SELECT
        player_tag,
        max_pes,
        tenure_days,
        (last_seen_at >= (now() - INTERVAL '30 days')) AS is_fresh
    FROM drivers.heritage_ledger
)
SELECT
    r.player_tag,
    r.player_name,
    ('https://link.clashroyale.com/en?player=' || ltrim(r.player_tag, '#')) AS ingame_link,
    ('https://royaleapi.com/player/'           || ltrim(r.player_tag, '#')) AS royaleapi_link,
    r.trophies,
    r.donations,
    r.war_wins,
    r.found_date,
    -- Longevity: how long this recruit has been in the pipeline (minutes since found_date)
    (ROUND(EXTRACT(epoch FROM (now() - r.found_date)) / 60::numeric))::integer AS longevity,
    substrate.format_longevity(
        (ROUND(EXTRACT(epoch FROM (now() - r.found_date)) / 60::numeric))::integer
    ) AS longevity_label,
    r.raw_potential_score,
    r.raw_potential_score AS rpos,
    -- potential_score: 0–100, normalised against elite_benchmark.
    -- Heritage blessing applies a 1.05x bonus for returning veterans with proven history.
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE
                WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
                ELSE 1.0
              END
        ) / (SELECT value FROM elite_benchmark) * 100::numeric
    )) AS potential_score,
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE
                WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
                ELSE 1.0
              END
        ) / (SELECT value FROM elite_benchmark) * 100::numeric
    )) AS pos,
    COALESCE(h.is_fresh AND h.max_pes > 10000, false) AS has_heritage_blessing,
    -- Tier thresholds (absolute raw_potential_score bands)
    CASE
        WHEN r.raw_potential_score >= 12000::numeric THEN 'ELITE'
        WHEN r.raw_potential_score >= 10500::numeric THEN 'HIGH'
        ELSE 'MID'
    END AS tier,
    r.last_scan AS last_seen_at,
    CASE
        WHEN h.player_tag IS NOT NULL AND h.is_fresh THEN 'RETURNING_VETERAN'
        WHEN h.player_tag IS NOT NULL                THEN 'FORMER_MEMBER'
        ELSE 'NEW_CANDIDATE'
    END AS heritage_status
FROM drivers.recruits r
LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
WHERE r.status = 'ACTIVE'::drivers.recruit_status
  AND NOT EXISTS (
      SELECT 1 FROM drivers.recruit_blacklist bl
      WHERE bl.player_tag = r.player_tag
  )
ORDER BY r.raw_potential_score DESC;

GRANT SELECT ON features.headhunter_view TO authenticated, anon, service_role;
