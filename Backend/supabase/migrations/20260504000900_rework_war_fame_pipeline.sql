-- Migration: War Fame Rework
-- Rationale:
-- 1. Replace deck-based war participation with fame-based contribution as the primary driver.
-- 2. Implement Hybrid Linear-Decay for fame scoring (Weeks 1-10: 100%->55%, Week 11+: 50%).
-- 3. Ensure inactivity gaps (missing weeks) drag down the score by using a fixed 12-week weight denominator.

BEGIN;

-- We need to drop views that depend on scoring_view first.
DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

CREATE VIEW features.scoring_view AS
WITH 
  -- 1. Identify the last 12 weeks globally to define the scoring window
  recent_weeks AS (
    SELECT DISTINCT week_id
    FROM drivers.war_activity
    ORDER BY week_id DESC
    LIMIT 12
  ),
  -- 2. Assign weights based on recency rank (1 = most recent)
  -- Hybrid Linear-Decay: Weeks 1-10 scale 100% -> 55% (decrement 0.05 per week). Week 11+ floor at 50%.
  week_weights AS (
    SELECT 
      week_id,
      ROW_NUMBER() OVER (ORDER BY week_id DESC) as recency_rank,
      CASE 
        WHEN ROW_NUMBER() OVER (ORDER BY week_id DESC) <= 10 THEN (1.0 - (ROW_NUMBER() OVER (ORDER BY week_id DESC) - 1) * 0.05)
        ELSE 0.50
      END as weight
    FROM recent_weeks
  ),
  -- 3. Calculate weighted stats for each player, ensuring missing weeks count as 0
  factual_logs AS (
    SELECT 
      m.player_tag,
      SUM(COALESCE(wa.fame, 0) * ww.weight) / 8.75 AS weighted_fame, -- 8.75 is the sum of weights for 12 weeks
      ((SUM(COALESCE(wa.decks_used, 0))::numeric / (COUNT(DISTINCT ww.week_id) * 16.0)) * 100.0) AS avg_war_rate,
      COUNT(wa.week_id) AS recorded_weeks
    FROM drivers.members m
    CROSS JOIN week_weights ww
    LEFT JOIN drivers.war_activity wa ON wa.player_tag = m.player_tag AND wa.week_id = ww.week_id
    WHERE m.is_active = true
    GROUP BY m.player_tag
  ),
  -- 4. Benchmarking context for rookie windows and history scaling
  benchmarking_context AS (
    SELECT 
      (SELECT COALESCE(NULLIF(MAX(recorded_weeks), 0), 12) FROM (SELECT count(DISTINCT week_id) as recorded_weeks FROM drivers.war_activity GROUP BY player_tag) w) as max_history_weeks,
      (SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY tenure_days), 14) FROM (SELECT GREATEST(0, EXTRACT(DAY FROM (now() - joined_at))) as tenure_days FROM drivers.members WHERE is_active = true) t) as rookie_window_days
  ),
  -- 5. Aggregate base stats with the new weighted fame
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
      COALESCE(fl.weighted_fame, 0::numeric) AS avg_fame, -- Alias weighted_fame as avg_fame for backward compatibility
      COALESCE(fl.avg_war_rate, 0::numeric) AS war_rate,
      COALESCE(fl.recorded_weeks, 0::bigint) AS recorded_weeks
    FROM drivers.members m
    LEFT JOIN factual_logs fl ON m.player_tag = fl.player_tag
    WHERE m.is_active = true
  ),
  -- 6. Execute weighted scoring logic
  weighted_calculations AS (
    SELECT 
      bs.*,
      LEAST(1.0, (bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)) AS stability_index,
      LEAST(1.10, (1.0 + ((bs.tenure_days / 30.0) * 0.01))) AS loyalty_multiplier,
      -- REWORKED SCORING: Fame (avg_fame which is weighted) boosted to 25x, Participation (war_rate) reduced to 50x
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
    raw_performance_score AS rpes,
    performance_score,
    performance_score AS pes,
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

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

COMMIT;
