-- Migration: Unlimited War Fame Window with 50% Floor
-- Rationale:
-- 1. Remove the 12-week limit from the scoring window to capture ALL historical data.
-- 2. Maintain Hybrid Linear-Decay (100% -> 55% for first 10 weeks, 50% floor for all older weeks).
-- 3. Dynamically calculate the total weight sum to ensure the weighted average remains mathematically sound across growing history.

BEGIN;

-- Drop dependent views
DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

CREATE VIEW features.scoring_view AS
WITH 
  -- 1. Identify ALL available weeks in the database
  global_weeks AS (
    SELECT DISTINCT week_id
    FROM drivers.war_activity
    ORDER BY week_id DESC
  ),
  -- 2. Assign weights based on recency rank (1 = most recent)
  -- Hybrid Linear-Decay: Weeks 1-10 scale 100% -> 55%. Week 11+ floor at 50%.
  week_weights AS (
    SELECT 
      week_id,
      ROW_NUMBER() OVER (ORDER BY week_id DESC) as recency_rank,
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY week_id DESC) <= 10 THEN (1.0 - (ROW_NUMBER() OVER (ORDER BY week_id DESC) - 1) * 0.05)
        ELSE 0.50
      END as weight
    FROM global_weeks
  ),
  -- 3. Calculate the sum of weights for the entire window to use as a denominator
  window_stats AS (
    SELECT 
        COALESCE(SUM(weight), 1.0) as total_weight_sum,
        COUNT(*) as total_window_weeks
    FROM week_weights
  ),
  -- 4. Calculate weighted stats for each player
  -- missing weeks count as 0 fame (Inactivity Penalty)
  factual_logs AS (
    SELECT 
      m.player_tag,
      SUM(COALESCE(wa.fame, 0) * ww.weight) / ws.total_weight_sum AS weighted_fame,
      ((SUM(COALESCE(wa.decks_used, 0))::numeric / (ws.total_window_weeks * 16.0)) * 100.0) AS avg_war_rate,
      COUNT(wa.week_id) AS recorded_weeks
    FROM drivers.members m
    CROSS JOIN week_weights ww
    CROSS JOIN window_stats ws
    LEFT JOIN drivers.war_activity wa ON wa.player_tag = m.player_tag AND wa.week_id = ww.week_id
    WHERE m.is_active = true
    GROUP BY m.player_tag, ws.total_weight_sum, ws.total_window_weeks
  ),
  -- 5. Benchmarking context
  benchmarking_context AS (
    SELECT 
      (SELECT COALESCE(NULLIF(MAX(recorded_weeks), 0), (SELECT total_window_weeks FROM window_stats)) FROM (SELECT count(DISTINCT week_id) as recorded_weeks FROM drivers.war_activity GROUP BY player_tag) w) as max_history_weeks,
      (SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY tenure_days), 14) FROM (SELECT GREATEST(0, EXTRACT(DAY FROM (now() - joined_at))) as tenure_days FROM drivers.members WHERE is_active = true) t) as rookie_window_days
  ),
  -- 6. Aggregate base stats
  base_stats AS (
    SELECT 
      m.player_tag,
      m.player_name as name,
      m.trophies,
      m.donations,
      m.joined_at,
      m.last_seen_at,
      m.war_wins,
      GREATEST(0::numeric, EXTRACT(epoch FROM (now() - m.last_seen_at)) / 86400.0) AS days_inactive,
      GREATEST(0::numeric, EXTRACT(epoch FROM (now() - m.joined_at)) / 86400.0) AS tenure_days,
      COALESCE(m.week_fame, 0) AS current_fame,
      COALESCE(fl.weighted_fame, 0::numeric) AS avg_fame,
      COALESCE(fl.avg_war_rate, 0::numeric) AS war_rate,
      COALESCE(fl.recorded_weeks, 0::bigint) AS recorded_weeks
    FROM drivers.members m
    LEFT JOIN factual_logs fl ON m.player_tag = fl.player_tag
    WHERE m.is_active = true
  ),
  -- 7. Execute weighted scoring logic
  weighted_calculations AS (
    SELECT 
      bs.*,
      LEAST(1.0, (bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)) AS stability_index,
      LEAST(1.10, (1.0 + ((bs.tenure_days / 30.0) * 0.01))) AS loyalty_multiplier,
      round((
        (bs.current_fame::numeric * 3.0) + 
        (bs.avg_fame * 25.0) + 
        (bs.donations::numeric * 100.0) + 
        (bs.trophies::numeric * 0.1) + 
        (bs.war_rate * 50.0)
      )) AS baseline_raw_score,
      ((bs.trophies::numeric * 1.0) + (bs.donations::numeric * 0.1) + ((bs.war_wins + 500)::numeric * 20.0)) AS raw_potential_score,
      power((1.0 - 0.08), GREATEST(0::numeric, (bs.days_inactive - 4.0))) AS decay_multiplier,
      bc.rookie_window_days
    FROM base_stats bs
    CROSS JOIN benchmarking_context bc
  ),
  clinical_layer AS (
    SELECT 
      wc.*,
      round(((wc.baseline_raw_score * wc.loyalty_multiplier) * wc.decay_multiplier)) AS raw_performance_score,
      CASE
        WHEN (wc.tenure_days < wc.rookie_window_days) THEN 
          ((wc.raw_potential_score * power(((wc.rookie_window_days - wc.tenure_days) / wc.rookie_window_days), 2::numeric)) / 5.0)
        ELSE 0::numeric
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
  raw_performance_score AS rpes,
  heritage_bonus,
  CASE
    WHEN (global_max_score > 0::numeric) THEN 
      round(((total_combined_score / global_max_score) * 100.0))
    ELSE 0::numeric
  END AS performance_score,
  CASE
    WHEN (global_max_score > 0::numeric) THEN 
      round(((total_combined_score / global_max_score) * 100.0))
    ELSE 0::numeric
  END AS pes
FROM final_scoring;

GRANT SELECT ON features.scoring_view TO authenticated, anon, service_role;

-- Restore features.roster_view
CREATE VIEW features.roster_view AS
 SELECT 
    m.player_name,
    m.role,
    m.player_tag,
    m.clan_rank,
    m.trophies,
    m.exp_level,
    m.donations,
    m.donations_received,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.avg_fame,
    COALESCE(s.war_rate, 0::numeric) AS war_participation,
    s.raw_performance_score,
    s.raw_performance_score AS rpes,
    s.performance_score,
    s.performance_score AS pes,
    s.stability_index,
    substrate.format_last_seen(s.days_inactive) AS last_seen_label,
    substrate.format_tenure(s.tenure_days) AS tenure_label,
    m.last_seen_at,
    m.last_ingested_at,
    s.tenure_days,
    'https://link.clashroyale.com/en?player='::text || ltrim(m.player_tag, '#'::text) AS ingame_link,
    'https://royaleapi.com/player/'::text || ltrim(m.player_tag, '#'::text) AS royaleapi_link
 FROM drivers.members m
 LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
 WHERE m.is_active = true 
   AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
 ORDER BY s.raw_performance_score DESC NULLS LAST, s.performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

COMMIT;
