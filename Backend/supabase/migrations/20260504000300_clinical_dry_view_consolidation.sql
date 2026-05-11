-- Migration: Clinical DRY View Consolidation
-- Final hardening of the data pipeline to 10/10 DRY standards.
-- Resolves the CROSS JOIN bug in benchmarking_context and consolidates scoring layers.

BEGIN;

-- 1. Hardening features.scoring_view
-- Rationale: Ensure benchmarking_context always returns exactly one row even if source tables are empty.
-- Move global_max_score into the final projection to keep calculations strictly layered.

DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

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
             (SELECT COALESCE(NULLIF(MAX(recorded_weeks), 0), 12) FROM (SELECT count(DISTINCT week_id) as recorded_weeks FROM drivers.war_activity GROUP BY player_tag) w) as max_history_weeks,
             (SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY tenure_days), 14) FROM (SELECT GREATEST(0, EXTRACT(DAY FROM (now() - joined_at))) as tenure_days FROM drivers.members WHERE is_active = true) t) as rookie_window_days
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

-- 2. Restoring features.roster_view
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

-- 3. Hardening features.headhunter_view
-- Rationale: Apply the same 10/10 DRY layered logic and cross-joined benchmarks.

DROP VIEW IF EXISTS features.headhunter_view;

CREATE OR REPLACE VIEW features.headhunter_view AS
 WITH 
  benchmarking_context AS (
      SELECT GREATEST(
          COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'::drivers.recruit_status), 0::numeric),
          COALESCE((SELECT max(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()), 0::numeric),
          COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits), 1::numeric)
      ) AS max_corpus_score
  ),
  heritage_context AS (
      SELECT 
         player_tag,
         max_pes,
         (last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
      FROM drivers.heritage_ledger
  ),
  base_calculations AS (
      SELECT 
         r.player_name,
         r.player_tag,
         r.trophies,
         r.donations,
         r.cards,
         r.war_wins,
         r.raw_potential_score,
         r.found_date,
         r.last_scan AS last_seen_at,
         (EXTRACT(epoch FROM (now() - r.found_date))::integer / 60) AS raw_longevity_mins,
         h.player_tag IS NOT NULL as is_former_member,
         COALESCE(h.is_fresh AND h.max_pes >= 80, false) AS has_blessing
        FROM drivers.recruits r
        LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
       WHERE r.status = 'ACTIVE'::drivers.recruit_status 
         AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = r.player_tag)
         AND r.trophies > 0 
         AND r.raw_potential_score > 0::numeric
  ),
  scoring_layer AS (
      SELECT 
        bc.max_corpus_score,
        b.*,
        LEAST(100::numeric, round((((b.raw_potential_score * (CASE WHEN b.has_blessing THEN 1.05 ELSE 1.0 END)) / bc.max_corpus_score) * 100::numeric))) AS potential_score
      FROM base_calculations b
      CROSS JOIN benchmarking_context bc
  )
  SELECT 
    player_name,
    player_tag,
    trophies,
    donations,
    cards,
    war_wins,
    raw_potential_score,
    potential_score,
    substrate.format_longevity(raw_longevity_mins) AS longevity_label,
    raw_longevity_mins AS longevity,
    CASE 
        WHEN potential_score >= 90::numeric THEN 'ELITE'::text
        WHEN potential_score >= 75::numeric THEN 'HIGH'::text
        ELSE 'MID'::text
    END AS tier,
    CASE 
        WHEN has_blessing THEN 'RETURNING_VETERAN'::text
        WHEN is_former_member THEN 'FORMER_MEMBER'::text
        ELSE 'NEW_CANDIDATE'::text
    END AS heritage_status,
    has_blessing AS has_heritage_blessing,
    last_seen_at,
    found_date,
    ('https://link.clashroyale.com/en?player='::text || ltrim(player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(player_tag, '#'::text)) AS royaleapi_link
  FROM scoring_layer
  ORDER BY raw_potential_score DESC;

COMMIT;
