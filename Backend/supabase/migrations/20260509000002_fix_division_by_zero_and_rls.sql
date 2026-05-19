-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Fix division by zero caused by empty war_activity (either genuinely empty or hidden by RLS)
-- and grant Public Read Access to drivers.war_activity so anon users can view the roster.

-- 1. Add missing Public Read Access to drivers.war_activity
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.war_activity;
DROP POLICY IF EXISTS "Public Read Access" ON drivers.war_activity;
CREATE POLICY "Public Read Access" ON drivers.war_activity AS PERMISSIVE FOR SELECT TO public USING (true);

-- 2. Update features.scoring_view to safeguard against 0 division when no war history exists
CREATE OR REPLACE VIEW features.scoring_view WITH (security_invoker=true) AS
 WITH global_weeks AS (
         SELECT DISTINCT war_activity.week_id
           FROM drivers.war_activity
          ORDER BY war_activity.week_id DESC
        ), week_weights AS (
         SELECT global_weeks.week_id,
            row_number() OVER (ORDER BY global_weeks.week_id DESC) AS recency_rank,
                CASE
                    WHEN row_number() OVER (ORDER BY global_weeks.week_id DESC) <= 10 THEN 1.0 - (row_number() OVER (ORDER BY global_weeks.week_id DESC) - 1)::numeric * 0.05
                    ELSE 0.50
                END AS weight
           FROM global_weeks
        ), window_stats AS (
         SELECT COALESCE(sum(week_weights.weight), 1.0) AS total_weight_sum,
            count(*) AS total_window_weeks
           FROM week_weights
        ), factual_logs AS (
         SELECT m.player_tag,
            sum(COALESCE(wa.fame, 0)::numeric * ww.weight) / ws.total_weight_sum AS weighted_fame,
            sum(COALESCE(wa.decks_used, 0))::numeric / (GREATEST(ws.total_window_weeks::numeric, 1.0) * 16.0) * 100.0 AS avg_war_rate,
            count(wa.week_id) AS recorded_weeks
           FROM drivers.members m
             CROSS JOIN week_weights ww
             CROSS JOIN window_stats ws
             LEFT JOIN drivers.war_activity wa ON wa.player_tag = m.player_tag AND wa.week_id = ww.week_id
          WHERE m.is_active = true
          GROUP BY m.player_tag, ws.total_weight_sum, ws.total_window_weeks
        ), benchmarking_context AS (
         SELECT ( SELECT COALESCE(NULLIF(max(w.recorded_weeks), 0), ( SELECT GREATEST(window_stats.total_window_weeks, 1)
                           FROM window_stats)) AS coalesce
                   FROM ( SELECT count(DISTINCT war_activity.week_id) AS recorded_weeks
                           FROM drivers.war_activity
                          GROUP BY war_activity.player_tag) w) AS max_history_weeks,
            ( SELECT COALESCE(percentile_cont(0.25::double precision) WITHIN GROUP (ORDER BY (t.tenure_days::double precision)), 14::double precision) AS coalesce
                   FROM ( SELECT GREATEST(0::numeric, EXTRACT(day FROM now() - members.joined_at)) AS tenure_days
                           FROM drivers.members
                          WHERE members.is_active = true) t) AS rookie_window_days
        ), base_stats AS (
         SELECT m.player_tag,
            m.player_name AS name,
            m.trophies,
            m.donations,
            m.joined_at,
            m.last_seen_at,
            m.war_wins,
            GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.last_seen_at) / 86400.0) AS days_inactive,
            GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.joined_at) / 86400.0) AS tenure_days,
            COALESCE(m.week_fame, 0) AS current_fame,
            COALESCE(fl.weighted_fame, 0::numeric) AS avg_fame,
            COALESCE(fl.avg_war_rate, 0::numeric) AS war_rate,
            COALESCE(fl.recorded_weeks, 0::bigint) AS recorded_weeks
           FROM drivers.members m
             LEFT JOIN factual_logs fl ON m.player_tag = fl.player_tag
          WHERE m.is_active = true
        ), weighted_calculations AS (
         SELECT bs.player_tag,
            bs.name,
            bs.trophies,
            bs.donations,
            bs.joined_at,
            bs.last_seen_at,
            bs.war_wins,
            bs.days_inactive,
            bs.tenure_days,
            bs.current_fame,
            bs.avg_fame,
            bs.war_rate,
            bs.recorded_weeks,
            LEAST(1.0, bs.recorded_weeks::numeric / GREATEST(bc.max_history_weeks::numeric, 1.0)) AS stability_index,
            LEAST(1.10, 1.0 + bs.tenure_days / 30.0 * 0.01) AS loyalty_multiplier,
            round(bs.current_fame::numeric * 3.0 + bs.avg_fame * 25.0 + bs.donations::numeric * 100.0 + bs.trophies::numeric * 0.1 + bs.war_rate * 50.0) AS baseline_raw_score,
            bs.trophies::numeric * 1.0 + bs.donations::numeric * 0.1 + (bs.war_wins + 500)::numeric * 20.0 AS raw_potential_score,
            power(1.0 - 0.08, GREATEST(0::numeric, bs.days_inactive - 4.0)) AS decay_multiplier,
            bc.rookie_window_days
           FROM base_stats bs
             CROSS JOIN benchmarking_context bc
        ), clinical_layer AS (
         SELECT wc.player_tag,
            wc.name,
            wc.trophies,
            wc.donations,
            wc.joined_at,
            wc.last_seen_at,
            wc.war_wins,
            wc.days_inactive,
            wc.tenure_days,
            wc.current_fame,
            wc.avg_fame,
            wc.war_rate,
            wc.recorded_weeks,
            wc.stability_index,
            wc.loyalty_multiplier,
            wc.baseline_raw_score,
            wc.raw_potential_score,
            wc.decay_multiplier,
            wc.rookie_window_days,
            round(wc.baseline_raw_score * wc.loyalty_multiplier * wc.decay_multiplier) AS raw_performance_score,
                CASE
                    WHEN wc.tenure_days::double precision < wc.rookie_window_days THEN wc.raw_potential_score::double precision * power((wc.rookie_window_days - wc.tenure_days::double precision) / wc.rookie_window_days, 2::numeric::double precision) / 5.0::double precision
                    ELSE 0::numeric::double precision
                END AS heritage_bonus
           FROM weighted_calculations wc
        ), final_scoring AS (
         SELECT clinical_layer.player_tag,
            clinical_layer.name,
            clinical_layer.trophies,
            clinical_layer.donations,
            clinical_layer.joined_at,
            clinical_layer.last_seen_at,
            clinical_layer.war_wins,
            clinical_layer.days_inactive,
            clinical_layer.tenure_days,
            clinical_layer.current_fame,
            clinical_layer.avg_fame,
            clinical_layer.war_rate,
            clinical_layer.recorded_weeks,
            clinical_layer.stability_index,
            clinical_layer.loyalty_multiplier,
            clinical_layer.baseline_raw_score,
            clinical_layer.raw_potential_score,
            clinical_layer.decay_multiplier,
            clinical_layer.rookie_window_days,
            clinical_layer.raw_performance_score,
            clinical_layer.heritage_bonus,
            clinical_layer.raw_performance_score::double precision + clinical_layer.heritage_bonus AS total_combined_score,
            max(clinical_layer.raw_performance_score::double precision + clinical_layer.heritage_bonus) OVER () AS global_max_score
           FROM clinical_layer
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
    raw_performance_score AS rpes,
    heritage_bonus,
        CASE
            WHEN global_max_score > 0::numeric::double precision THEN round(total_combined_score / global_max_score * 100.0::double precision)
            ELSE 0::numeric::double precision
        END AS performance_score,
        CASE
            WHEN global_max_score > 0::numeric::double precision THEN round(total_combined_score / global_max_score * 100.0::double precision)
            ELSE 0::numeric::double precision
        END AS pes
   FROM final_scoring;

