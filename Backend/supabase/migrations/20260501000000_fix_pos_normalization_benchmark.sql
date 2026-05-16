-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FIX: PoS Normalization Benchmark - corpus_benchmark replaces elite_benchmark
--
-- ROOT CAUSE:
--   The previous headhunter_view used `elite_benchmark` anchored to the AVG of
--   the top-10 raw_performance_score values from features.scoring_view (clan
--   members). This is a categorically wrong population:
--     1. scoring_view uses a different formula (fame + donations + war_rate)
--        from the recruit potential formula (trophies + donations + war_wins).
--     2. The clan member benchmark (~61 812) was lower than many ACTIVE recruit
--        raw scores (~74 882 max), causing LEAST(100, ...) to cap dozens of
--        recruits at 100 and destroying the grading resolution.
--
-- CORRECT DESIGN:
--   PoS = 100 is awarded to the recruit with the highest raw_potential_score
--   in the observable corpus, defined as:
--     - All currently ACTIVE recruits in drivers.recruits, PLUS
--     - Any recruit in drivers.recruit_blacklist whose expires_at > now()
--       (i.e. dismissed within the last 30 days, the persistence window).
--
--   This makes the scale invariant to dismissals for 30 days: dismissing a
--   top scorer does not inflate everyone else's PoS until the blacklist entry
--   expires. A recruit who earned 72 stays at 72.
--
-- PRESERVED:
--   - Heritage blessing 1.05x multiplier (PeS-weighting for returning veterans
--     with max_pes > 10000 seen within 30 days). This is the intentional
--     PeS/RPeS cross-signal and must not be removed.
--   - All other columns, JOINs, guards, and GRANTs are unchanged.
-- =============================================================================

DROP VIEW IF EXISTS features.headhunter_view CASCADE;

CREATE VIEW features.headhunter_view
WITH (security_invoker = true)
AS
WITH corpus_benchmark AS (
    -- Anchor: the highest raw_potential_score seen across the full observable
    -- recruit corpus - ACTIVE pool plus any blacklisted recruit whose entry
    -- has not yet expired (30-day persistence window).
    --
    -- This ensures the PoS scale is:
    --   (a) derived from the correct population (recruits, not clan members),
    --   (b) invariant to dismissals for up to 30 days (blacklist window),
    --   (c) monotonically stable: the best ever score anchors the scale
    --       until that entry expires from the blacklist.
    --
    -- Falls back to 75000 if both sources are empty (cold-start guard).
    SELECT GREATEST(
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'),
            0
        ),
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()),
            0
        ),
        75000::numeric  -- cold-start fallback; prevents division by zero
    ) AS value
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
    -- potential_score: 0–100, normalised against corpus_benchmark.
    -- Heritage blessing applies a 1.05x bonus for returning veterans with
    -- proven history (max_pes > 10 000, seen within 30 days). This is the
    -- intentional PeS/RPeS cross-signal: it weights recruits that have
    -- already demonstrated performance within the clan context.
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE
                WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
                ELSE 1.0
              END
        ) / (SELECT value FROM corpus_benchmark) * 100::numeric
    )) AS potential_score,
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE
                WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
                ELSE 1.0
              END
        ) / (SELECT value FROM corpus_benchmark) * 100::numeric
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
