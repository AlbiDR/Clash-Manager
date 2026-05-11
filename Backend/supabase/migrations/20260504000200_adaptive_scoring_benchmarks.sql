-- Migration: Adaptive Scoring Benchmarks
-- Transitioning scoring logic from absolute thresholds to relative corpus benchmarks.
-- Eliminates technical debt (12-week stability, 14-day heritage window) in favor of self-healing benchmarks.

BEGIN;

-- Drop dependent views to allow schema changes
DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

-- 1. Redefine features.scoring_view with a benchmarking layer
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
             COALESCE(NULLIF(MAX(recorded_weeks), 0), 12) as max_history_weeks,
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
             m.player_name as name,
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
             LEAST(1.0, (bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)) AS stability_index,
             LEAST(1.10, (1.0 + ((bs.tenure_days / 30.0) * 0.01))) AS loyalty_multiplier,
             round(((((((bs.current_fame)::numeric * 3.0) + (bs.avg_fame * 15.0)) + ((bs.donations)::numeric * 100.0)) + ((bs.trophies)::numeric * 0.1)) + (bs.war_rate * 150.0))) AS baseline_raw_score,
             ((((bs.trophies)::numeric * 1.0) + ((bs.donations)::numeric * 0.1)) + (((bs.war_wins + 500))::numeric * 20.0)) AS raw_potential_score,
             power((1.0 - 0.08), GREATEST((0)::numeric, (bs.days_inactive - 4.0))) AS decay_multiplier,
             bc.rookie_window_days
            FROM base_stats bs
            CROSS JOIN benchmarking_context bc
         ), 
  clinical_layer AS (
          SELECT wc.*,
             round(((wc.baseline_raw_score * wc.loyalty_multiplier) * wc.decay_multiplier)) AS raw_performance_score,
             CASE
                 WHEN (wc.tenure_days < wc.rookie_window_days) THEN 
                     ((wc.raw_potential_score * power(((wc.rookie_window_days - wc.tenure_days) / wc.rookie_window_days), (2)::numeric)) / 5.0)
                 ELSE (0)::numeric
             END AS heritage_bonus
            FROM weighted_calculations wc
         ),
  final_scoring AS (
      SELECT 
        *,
        (raw_performance_score + heritage_bonus) as total_combined_score,
        max(raw_performance_score + heritage_bonus) OVER () as global_max_score
      FROM clinical_layer
  )
  SELECT 
     player_tag,
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
         WHEN (global_max_score > (0)::numeric) THEN 
             round(((total_combined_score / global_max_score) * 100.0))
         ELSE (0)::numeric
     END AS performance_score
    FROM final_scoring;

-- 2. Restore features.roster_view with the "Gold Standard" CTE pattern
CREATE OR REPLACE VIEW features.roster_view AS
 WITH roster_source AS (
    SELECT 
        m.*,
        s.avg_fame,
        s.war_rate,
        s.raw_performance_score,
        s.performance_score,
        s.stability_index,
        s.days_inactive,
        s.tenure_days,
        ltrim(m.player_tag, '#'::text) as raw_tag
    FROM drivers.members m
    LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
    WHERE m.is_active = true 
      AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
 )
 SELECT 
    player_name,
    role,
    player_tag,
    clan_rank,
    trophies,
    exp_level,
    donations,
    donations_received,
    decks_used_today,
    decks_used_weekly,
    week_fame,
    avg_fame,
    COALESCE(war_rate, 0::numeric) AS war_participation,
    raw_performance_score,
    performance_score,
    stability_index,
    substrate.format_last_seen(days_inactive) AS last_seen_label,
    substrate.format_tenure(tenure_days) AS tenure_label,
    last_seen_at,
    last_ingested_at,
    tenure_days,
    'https://link.clashroyale.com/en?player='::text || raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || raw_tag AS royaleapi_link
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

COMMIT;
