-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MIGRATION: Enrich Roster & Headhunter Views with Deep Links
-- =============================================================================
-- Changes:
--   1. features.roster_view    - Add ingame_link, royaleapi_link columns.
--   2. features.headhunter_view - Add ingame_link, royaleapi_link columns;
--                                  rename pos → potential_score,
--                                  rename rpos → raw_potential_score;
--                                  cap potential_score at 100 (0-100 contract).
--   3. drivers.top_recruits_view - Rebuilt to propagate link columns and
--                                  ADR-compliant score names from headhunter_view.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. features.roster_view
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS features.roster_view;

CREATE VIEW features.roster_view AS
 SELECT m.tag,
    m.name,
    m.role,
    'https://link.clashroyale.com/en?player=' || LTRIM(m.tag, '#') AS ingame_link,
    'https://royaleapi.com/player/' || LTRIM(m.tag, '#') AS royaleapi_link,
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
            WHEN (s.days_inactive * 24::numeric * 60::numeric) < 60::numeric THEN 'Now'::text
            WHEN (s.days_inactive * 24::numeric) < 1::numeric THEN (s.days_inactive * 24::numeric * 60::numeric)::integer || 'm'::text
            WHEN s.days_inactive < 1::numeric THEN (s.days_inactive * 24::numeric)::integer || 'h'::text
            ELSE s.days_inactive::integer || 'd'::text
        END AS tenure_label
   FROM drivers.members m
     LEFT JOIN features.scoring_view s ON m.tag = s.tag
  WHERE m.is_active = true AND m.tag ~ '^#[0289CGJLPQRUVY]+$'::text
  ORDER BY s.raw_performance_score DESC, s.performance_score DESC;

-- -----------------------------------------------------------------------------
-- 2. features.headhunter_view  (drop dependent view first)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS drivers.top_recruits_view;
DROP VIEW IF EXISTS features.headhunter_view;

CREATE VIEW features.headhunter_view AS
 WITH elite_benchmark AS (
         SELECT COALESCE(avg(sub.score), 12000::numeric) AS value
           FROM ( SELECT scoring_view.raw_performance_score AS score
                   FROM features.scoring_view
                  ORDER BY scoring_view.raw_performance_score DESC
                 LIMIT 10) sub
        ), heritage_context AS (
         SELECT heritage_ledger.tag,
            heritage_ledger.max_pes,
            heritage_ledger.tenure_days,
            heritage_ledger.last_seen_at >= (now() - '30 days'::interval) AS is_fresh
           FROM drivers.heritage_ledger
        )
 SELECT r.tag,
    r.name,
    'https://link.clashroyale.com/en?player=' || LTRIM(r.tag, '#') AS ingame_link,
    'https://royaleapi.com/player/' || LTRIM(r.tag, '#') AS royaleapi_link,
    r.trophies,
    r.donations,
    r.war_wins,
    r.found_date,
    round(EXTRACT(epoch FROM now() - r.found_date) / 60::numeric)::integer AS longevity,
    substrate.format_longevity(round(EXTRACT(epoch FROM now() - r.found_date) / 60::numeric)::integer) AS longevity_label,
    -- ADR-compliant: full names, no abbreviations
    r.raw_potential_score,
    -- Hard-capped at 100 to enforce the 0-100 percentage contract
    LEAST(100, round(r.raw_potential_score *
        CASE
            WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
            ELSE 1.0
        END / (( SELECT elite_benchmark.value
           FROM elite_benchmark)) * 100::numeric)) AS potential_score,
    COALESCE(h.is_fresh AND h.max_pes > 10000, false) AS has_heritage_blessing,
        CASE
            WHEN r.raw_potential_score >= 12000::numeric THEN 'ELITE'::text
            WHEN r.raw_potential_score >= 10500::numeric THEN 'HIGH'::text
            ELSE 'MID'::text
        END AS tier,
    r.last_scan AS last_seen_at,
        CASE
            WHEN h.tag IS NOT NULL AND h.is_fresh THEN 'RETURNING_VETERAN'::text
            WHEN h.tag IS NOT NULL THEN 'FORMER_MEMBER'::text
            ELSE 'NEW_CANDIDATE'::text
        END AS heritage_status
   FROM drivers.recruits r
     LEFT JOIN heritage_context h ON h.tag = r.tag
  WHERE r.status = 'ACTIVE'::drivers.recruit_status AND NOT (EXISTS ( SELECT 1
           FROM drivers.recruit_blacklist bl
          WHERE bl.tag = r.tag))
  ORDER BY r.raw_potential_score DESC;

-- -----------------------------------------------------------------------------
-- 3. drivers.top_recruits_view  (rebuilt with propagated link columns and
--    ADR-compliant score names)
-- -----------------------------------------------------------------------------
CREATE VIEW drivers.top_recruits_view AS
 WITH stats AS (
         SELECT percentile_cont(0.75::double precision) WITHIN GROUP (ORDER BY (headhunter_view.potential_score::double precision)) AS threshold
           FROM features.headhunter_view
        )
 SELECT hv.tag,
    hv.name,
    hv.ingame_link,
    hv.royaleapi_link,
    hv.trophies,
    hv.donations,
    hv.war_wins,
    hv.raw_potential_score,
    hv.potential_score,
    hv.found_date,
    hv.longevity,
    hv.longevity_label,
    hv.has_heritage_blessing,
    hv.tier,
    hv.last_seen_at,
    hv.heritage_status
   FROM features.headhunter_view hv,
    stats
  WHERE hv.potential_score::double precision >= stats.threshold AND hv.heritage_status <> 'RETURNING_VETERAN'::text
  ORDER BY hv.potential_score DESC;
