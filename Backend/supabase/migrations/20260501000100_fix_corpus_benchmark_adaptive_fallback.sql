-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FIX: Remove hardcoded 75000 fallback from corpus_benchmark
--
-- ROOT CAUSE:
--   The previous corpus_benchmark CTE in headhunter_view used a hardcoded
--   `75000::numeric` as the cold-start guard. This is a magic number — it
--   will become stale as the game's playerbase evolves and score ceilings
--   rise (or fall). Magic numbers are explicitly prohibited by the ADR.
--
-- CORRECT DESIGN:
--   The cold-start fallback must be data-driven:
--     1. PRIMARY:   MAX(raw_potential_score) WHERE status = 'ACTIVE'
--     2. SECONDARY: MAX(raw_potential_score) from non-expired blacklist entries
--     3. TERTIARY:  MAX(raw_potential_score) across ALL statuses (full corpus)
--                   — reached only when ACTIVE pool and blacklist are both empty
--                   (e.g. pipeline initialisation or a full flush)
--     4. GUARD:     1 — a mathematical identity to prevent division by zero.
--                   Only reached when drivers.recruits is completely empty.
--                   This is not a business value; it is a zero-division fence.
--
--   This ensures the benchmark perpetually reflects the real data state,
--   requiring zero intervention as the playerbase and score ranges evolve.
-- =============================================================================

DROP VIEW IF EXISTS features.headhunter_view CASCADE;

CREATE VIEW features.headhunter_view
WITH (security_invoker = true)
AS
WITH corpus_benchmark AS (
    -- Normalization anchor for PoS (0–100 scale).
    --
    -- Priority cascade (all data-driven, no hardcoded values):
    --   1. Max raw_potential_score of current ACTIVE recruits.
    --   2. Max raw_potential_score of recently dismissed recruits (blacklist,
    --      expires_at > now() — the 30-day persistence window).
    --   3. Max raw_potential_score across the entire corpus (all statuses) —
    --      adaptive cold-start: as scores evolve, this value evolves too.
    --   4. 1 — zero-division mathematical guard only; unreachable under normal
    --      operation (requires a completely empty drivers.recruits table).
    SELECT GREATEST(
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'),
            0
        ),
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()),
            0
        ),
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruits),
            1
        )
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
    -- Heritage blessing: 1.05x bonus for returning veterans with proven
    -- history (max_pes > 10 000, seen within 30 days). This is the
    -- intentional PeS/RPeS cross-signal: recruits are graded not only
    -- against other recruits but against the clan's own performance standard.
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
    -- Tier thresholds: derived from absolute raw_potential_score bands.
    -- These bands reflect the game's scoring structure and must be revisited
    -- if the underlying raw_potential_score formula changes.
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
