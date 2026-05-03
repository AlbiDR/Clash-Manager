-- Migration: Adaptive Scoring Benchmarks
-- Transitioning scoring logic from absolute thresholds to relative corpus benchmarks.
-- Eliminates technical debt (12-week stability, 14-day heritage window) in favor of self-healing benchmarks.

BEGIN;

-- 1. Redefine features.scoring_view with a benchmarking layer
CREATE OR REPLACE VIEW features.scoring_view AS
 WITH factual_logs AS (
         SELECT player_tag,
            count(DISTINCT week_id) AS recorded_weeks,
            avg(fame) AS avg_fame,
            ((avg(decks_used) / 4.0) * 100.0) AS avg_war_rate
           FROM drivers.war_activity
          GROUP BY player_tag
        ), 
 benchmarking_context AS (
         SELECT 
            -- We use the maximum history available to define the 1.0 stability mark
            COALESCE(NULLIF(MAX(recorded_weeks), 0), 12) as max_history_weeks,
            -- We use the 25th percentile of tenure as the "new member" window for heritage
            COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY tenure_days), 14) as rookie_window_days
         FROM (
             SELECT count(DISTINCT week_id) as recorded_weeks FROM drivers.war_activity GROUP BY player_tag
         ) w,
         (
             SELECT GREATEST(0, EXTRACT(DAY FROM (now() - joined_at))) as tenure_days FROM drivers.members WHERE is_active = true
         ) t
 ),
 base_stats AS (
         SELECT m.player_tag,
            m.name,
            m.trophies,
            m.donations,
            m.joined_at,
            m.last_seen_at,
            m.war_wins,
            GREATEST((0)::numeric, (EXTRACT(epoch FROM (now() - m.last_seen_at)) / 86400.0)) AS days_inactive,
            GREATEST((0)::numeric, (EXTRACT(epoch FROM (now() - m.joined_at)) / 86400.0)) AS tenure_days,
            COALESCE(m.week_fame, 0) AS current_fame,
            COALESCE(fl.avg_fame, (0)::numeric) AS avg_fame,
            COALESCE(fl.avg_war_rate, (0)::numeric) AS war_rate,
            COALESCE(fl.recorded_weeks, (0)::bigint) AS recorded_weeks
           FROM drivers.members m
             LEFT JOIN factual_logs fl ON m.player_tag = fl.player_tag
          WHERE m.is_active = true
        ), 
 weighted_calculations AS (
         SELECT bs.*,
            -- Adaptive Stability: Relative to the clan's historical depth
            LEAST(1.0, (bs.recorded_weeks::numeric / (SELECT max_history_weeks FROM benchmarking_context))) AS stability_index,
            -- Loyalty Multiplier: Standard monthly scaling remains, but we could cap it relatively
            LEAST(1.10, (1.0 + ((bs.tenure_days / 30.0) * 0.01))) AS loyalty_multiplier,
            -- Baseline Raw Score: Fixed weights for now as they represent policy, not thresholds
            round(((((((bs.current_fame)::numeric * 3.0) + (bs.avg_fame * 15.0)) + ((bs.donations)::numeric * 100.0)) + ((bs.trophies)::numeric * 0.1)) + (bs.war_rate * 150.0))) AS baseline_raw_score,
            ((((bs.trophies)::numeric * 1.0) + ((bs.donations)::numeric * 0.1)) + (((bs.war_wins + 500))::numeric * 20.0)) AS raw_potential_score,
            -- Decay: Fixed 8% daily decay after 4-day grace period
            power((1.0 - 0.08), GREATEST((0)::numeric, (bs.days_inactive - 4.0))) AS decay_multiplier
           FROM base_stats bs
        ), 
 clinical_layer AS (
         SELECT wc.*,
            round(((wc.baseline_raw_score * wc.loyalty_multiplier) * wc.decay_multiplier)) AS raw_performance_score,
            -- Adaptive Heritage Bonus: Grace window is now the bottom 25% of the clan's tenure distribution
            CASE
                WHEN (wc.tenure_days < (SELECT rookie_window_days FROM benchmarking_context)) THEN 
                    ((wc.raw_potential_score * power((((SELECT rookie_window_days FROM benchmarking_context) - wc.tenure_days) / (SELECT rookie_window_days FROM benchmarking_context)), (2)::numeric)) / 5.0)
                ELSE (0)::numeric
            END AS heritage_bonus
           FROM weighted_calculations wc
        )
 SELECT player_tag,
    name,
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
    heritage_bonus,
    CASE
        WHEN (max((raw_performance_score + heritage_bonus)) OVER () > (0)::numeric) THEN 
            round((((raw_performance_score + heritage_bonus) / max((raw_performance_score + heritage_bonus)) OVER ()) * 100.0))
        ELSE (0)::numeric
    END AS performance_score
   FROM clinical_layer;

COMMIT;
