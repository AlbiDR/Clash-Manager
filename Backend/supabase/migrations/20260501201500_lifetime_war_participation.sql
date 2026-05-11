-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- LIFETIME WAR PARTICIPATION & SCORING FIX
--
-- 1. Fixes the `avg_war_rate` in `features.scoring_view` to use 16.0 as the denominator
--    (previously it was 4.0, which led to inflated war rates).
-- 2. Updates `features.roster_view` to use the lifetime `war_rate` (s.war_rate)
--    instead of the current week's progression for `war_participation`.
-- =============================================================================

DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

CREATE VIEW features.scoring_view
WITH (security_invoker = true)
AS
WITH factual_logs AS (
    -- Aggregate war participation history per player
    SELECT
        player_tag,
        COUNT(DISTINCT week_id)                  AS recorded_weeks,
        AVG(fame)                                AS avg_fame,
        (AVG(decks_used) / 16.0) * 100.0         AS avg_war_rate
    FROM drivers.war_activity
    GROUP BY player_tag
),
base_stats AS (
    -- Merge member baseline with war history; restrict to active roster
    SELECT
        m.player_tag,
        m.player_name,
        m.trophies,
        m.donations,
        m.joined_at,
        m.last_seen_at,
        m.war_wins,
        GREATEST(0::numeric, EXTRACT(epoch FROM (now() - m.last_seen_at)) / 86400.0) AS days_inactive,
        GREATEST(0::numeric, EXTRACT(epoch FROM (now() - m.joined_at))    / 86400.0) AS tenure_days,
        COALESCE(m.week_fame,    0)              AS current_fame,
        COALESCE(fl.avg_fame,    0::numeric)    AS avg_fame,
        COALESCE(fl.avg_war_rate,0::numeric)    AS war_rate,
        COALESCE(fl.recorded_weeks, 0::bigint)  AS recorded_weeks
    FROM drivers.members m
    LEFT JOIN factual_logs fl ON fl.player_tag = m.player_tag
    WHERE m.is_active = true
),
weighted_calculations AS (
    -- Derive multipliers and raw scores; all arithmetic is NUMERIC to prevent
    -- integer division truncation
    SELECT
        bs.*,
        -- Loyalty: caps at 1.10x after ~30 months
        LEAST(1.10, 1.0 + (bs.tenure_days / 30.0) * 0.01)         AS loyalty_multiplier,
        -- Stability: fraction of weeks tracked out of a 12-week window
        LEAST(1.0, bs.recorded_weeks::numeric / 12.0)              AS stability_index,
        -- Baseline raw performance (activity-driven)
        ROUND(
            (bs.current_fame::numeric  *   3.0)
          + (bs.avg_fame               *  15.0)
          + (bs.donations::numeric     * 100.0)
          + (bs.trophies::numeric      *   0.1)
          + (bs.war_rate               * 150.0)
        )                                                           AS baseline_raw_score,
        -- Potential score (used for heritage bonus only)
        (bs.trophies::numeric * 1.0)
          + (bs.donations::numeric * 0.1)
          + ((bs.war_wins + 500)::numeric * 20.0)                  AS raw_potential_score,
        -- Exponential decay: 8% per day inactive after a 4-day grace window
        POWER(1.0 - 0.08, GREATEST(0::numeric, bs.days_inactive - 4.0)) AS decay_multiplier
    FROM base_stats bs
),
clinical_layer AS (
    -- Apply loyalty and decay to produce the final raw performance score
    SELECT
        wc.*,
        ROUND(wc.baseline_raw_score * wc.loyalty_multiplier * wc.decay_multiplier) AS raw_performance_score,
        -- Heritage bonus: brief boost for members in their first two weeks
        CASE
            WHEN wc.tenure_days < 14::numeric
            THEN (wc.raw_potential_score * POWER((14::numeric - wc.tenure_days) / 14.0, 2::numeric)) / 5.0
            ELSE 0::numeric
        END AS heritage_bonus
    FROM weighted_calculations wc
)
SELECT
    player_tag,
    player_name,
    trophies,
    donations,
    joined_at,
    last_seen_at,
    war_wins,
    days_inactive,
    tenure_days,
    current_fame,
    avg_fame,
    war_rate,
    recorded_weeks,
    loyalty_multiplier,
    stability_index,
    baseline_raw_score,
    raw_potential_score,
    decay_multiplier,
    raw_performance_score,
    raw_performance_score AS rpes,
    heritage_bonus,
    -- performance_score: window-relative 0–100 rank within the active roster
    CASE
        WHEN MAX(raw_performance_score + heritage_bonus) OVER () > 0::numeric
        THEN ROUND(
            ((raw_performance_score + heritage_bonus)
             / MAX(raw_performance_score + heritage_bonus) OVER ()) * 100.0
        )
        ELSE 0::numeric
    END AS performance_score,
    CASE
        WHEN MAX(raw_performance_score + heritage_bonus) OVER () > 0::numeric
        THEN ROUND(
            ((raw_performance_score + heritage_bonus)
             / MAX(raw_performance_score + heritage_bonus) OVER ()) * 100.0
        )
        ELSE 0::numeric
    END AS pes
FROM clinical_layer;

GRANT SELECT ON features.scoring_view TO authenticated, anon, service_role;


-- 2. REBUILD features.roster_view
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
    s.tenure_days,
    -- Use the lifetime average war rate instead of the current week's progression
    COALESCE(s.war_rate, 0::numeric) AS war_participation
FROM drivers.members m
LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
WHERE m.is_active = TRUE
  AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'
ORDER BY s.raw_performance_score DESC NULLS LAST,
         s.performance_score      DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;
