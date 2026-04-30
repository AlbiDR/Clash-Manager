-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Pillar X: Factual Scoring (Fidelity)
-- Ensures scoring is anchored in absolute records while utilizing tenure as a reliability stabilizer.

-- CLINICAL RESET: Mandatory drop as scoring indices are being added/renamed
DROP VIEW IF EXISTS features.scoring_view CASCADE;

CREATE VIEW features.scoring_view AS
WITH factual_logs AS (
    SELECT 
        member_tag,
        COUNT(DISTINCT week_id) as recorded_weeks,
        AVG(fame) as avg_fame,
        AVG(decks_used) / 4.0 * 100.0 as avg_war_rate
    FROM drivers.war_activity
    GROUP BY member_tag
),
base_stats AS (
    SELECT 
        m.tag,
        m.name,
        m.trophies,
        m.donations,
        m.joined_at,
        m.last_seen_at,
        m.war_wins,
        GREATEST(0, EXTRACT(epoch FROM (now() - m.last_seen_at)) / 86400.0) AS days_inactive,
        GREATEST(0, EXTRACT(epoch FROM (now() - m.joined_at)) / 86400.0) AS tenure_days,
        COALESCE(m.week_fame, 0) AS current_fame,
        COALESCE(fl.avg_fame, 0) AS avg_fame,
        COALESCE(fl.avg_war_rate, 0) AS war_rate,
        COALESCE(fl.recorded_weeks, 0) AS recorded_weeks
    FROM drivers.members m
    LEFT JOIN factual_logs fl ON m.tag = fl.member_tag
    WHERE m.is_active = true
), 
weighted_calculations AS (
    SELECT 
        *,
        -- LOYALTY MULTIPLIER: +1% score weight per 30 days, capped at +10% (300 days)
        LEAST(1.10, 1.0 + (tenure_days / 30.0) * 0.01) AS loyalty_multiplier,
        -- INERTIA: The more weeks we have, the more "stable" the score is.
        LEAST(1.0, recorded_weeks / 12.0) AS stability_index,
        -- RAW SCORE: Pure performance based on PROVEN records
        round((current_fame * 3.0 + avg_fame * 15.0 + donations * 100.0 + trophies * 0.1 + war_rate * 150.0)) AS baseline_raw_score,
        -- POTENTIAL: Trophies + Gear (Legacy Parity)
        trophies * 1.0 + donations * 0.1 + (war_wins + 500) * 20.0 AS raw_potential_score,
        -- DECAY: High-precision inactivity tax
        power(1.0 - 0.08, GREATEST(0, days_inactive - 4.0)) AS decay_multiplier
    FROM base_stats
),
clinical_layer AS (
    SELECT 
        *,
        -- APPLY LOYALTY & DECAY
        round(baseline_raw_score * loyalty_multiplier * decay_multiplier) AS raw_performance_score,
        -- HERITAGE BONUS: Temporary protection for new high-value recruits (Legacy parity)
        CASE 
            WHEN tenure_days < 14 THEN raw_potential_score * power((14 - tenure_days) / 14.0, 2) / 5.0
            ELSE 0 
        END AS heritage_bonus
    FROM weighted_calculations
)
SELECT 
    *,
    CASE 
        WHEN max(raw_performance_score + heritage_bonus) OVER () > 0 
        THEN round((raw_performance_score + heritage_bonus) / max(raw_performance_score + heritage_bonus) OVER () * 100.0)
        ELSE 0 
    END AS performance_score
FROM clinical_layer;

-- RE-SYNC ROSTER VIEW
DROP VIEW IF EXISTS features.roster_view;
CREATE VIEW features.roster_view AS
SELECT 
    m.tag,
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
        WHEN (s.days_inactive * 24 * 60) < 60 THEN 'Now'
        WHEN (s.days_inactive * 24) < 1 THEN (s.days_inactive * 24 * 60)::INT || 'm'
        WHEN s.days_inactive < 1 THEN (s.days_inactive * 24)::INT || 'h'
        ELSE s.days_inactive::INT || 'd'
    END AS tenure_label
FROM drivers.members m
LEFT JOIN features.scoring_view s ON m.tag = s.tag
WHERE m.is_active = true
ORDER BY s.raw_performance_score DESC, s.performance_score DESC;
