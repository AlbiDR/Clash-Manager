-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Unified Recency-Decayed Metrics for Scoring Engine
 *
 * Rationale:
 * - Introduces substrate.weighted_avg() as a shared, IMMUTABLE utility
 *   function that encapsulates the standard 5%-per-entry recency decay
 *   (floored at 50%) used consistently across all time-series metrics.
 * - Replaces the flat AVG() for war fame and war participation with the
 *   same recency decay already used by voyage_factuals, achieving coherent
 *   metric architecture across all three pipelines.
 * - Introduces donation_factuals CTE: computes a recency-decayed weighted
 *   average of weekly peak donations from drivers.member_snapshots, then
 *   divides by 7 to express results as an average daily rate.
 * - Replaces the volatile live-week m.donations value in the scoring formula
 *   with this stable daily average, eliminating mid-week leaderboard swings.
 * - Adjusts the donation multiplier from 115.0 to 805.0 (= 115 * 7) to
 *   preserve equivalent scoring weight after the unit change from weekly
 *   count to daily average.
 * - Applies the stability_index dampening to donations, consistent with
 *   how avg_fame and war_rate are already dampened.
 */

BEGIN;

-- =============================================================================
-- 1. Shared utility: substrate.weighted_avg()
--
-- Computes a weighted average of an ordered array of numeric values using
-- a linear recency decay. The first element (index 1) receives full weight
-- (1.0), each subsequent entry loses p_decay (default 5%) weight, floored
-- at p_floor (default 50%). Values must be supplied most-recent-first.
--
-- Example for 3 values [200, 150, 100]:
--   weight_1 = max(0.5, 1.0 - 0 * 0.05) = 1.00
--   weight_2 = max(0.5, 1.0 - 1 * 0.05) = 0.95
--   weight_3 = max(0.5, 1.0 - 2 * 0.05) = 0.90
--   result   = (200*1.00 + 150*0.95 + 100*0.90) / (1.00 + 0.95 + 0.90)
-- =============================================================================
CREATE OR REPLACE FUNCTION substrate.weighted_avg(
    p_values numeric[],
    p_decay  numeric DEFAULT 0.05,
    p_floor  numeric DEFAULT 0.5
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE STRICT
AS $$
    SELECT
        SUM(val * GREATEST(p_floor, 1.0 - (ord - 1)::numeric * p_decay)) /
        NULLIF(SUM(CASE WHEN val IS NOT NULL THEN GREATEST(p_floor, 1.0 - (ord - 1)::numeric * p_decay) END), 0)
    FROM UNNEST(p_values) WITH ORDINALITY AS t(val, ord)
$$;

COMMENT ON FUNCTION substrate.weighted_avg(numeric[], numeric, numeric) IS
    'Recency-decayed weighted average. Index 1 = most recent (full weight).
     Each subsequent entry loses p_decay weight, floored at p_floor.
     Default: 5% decay per entry, floor at 50% (matches voyage_factuals).';

-- =============================================================================
-- 2. Drop dependent views for clean rebuild
-- =============================================================================
DROP VIEW IF EXISTS features.voyage_contributions CASCADE;
DROP VIEW IF EXISTS features.voyage_summary CASCADE;
DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

-- =============================================================================
-- 3. Rebuild features.scoring_view with unified recency-decayed metrics
-- =============================================================================
CREATE OR REPLACE VIEW features.scoring_view AS
 WITH
  -- ── Voyage pipeline (unchanged) ─────────────────────────────────────────────
  voyage_history AS (
      SELECT c.player_tag,
             c.total_voyage_crowns AS crowns,
             v.target_crowns,
             v.end_at,
             row_number() OVER (
                 PARTITION BY c.player_tag ORDER BY v.end_at DESC
             ) AS recency_rank
        FROM drivers.clan_voyage_contributions c
          JOIN drivers.clan_voyage v ON v.id = c.voyage_id
       WHERE v.status = 'COMPLETED'::text
  ),
  voyage_factuals AS (
      SELECT vh.player_tag,
             sum(
                 vh.crowns::numeric / vh.target_crowns::numeric
                 * GREATEST(0.5, 1.0 - (vh.recency_rank - 1)::numeric * 0.05)
             ) AS weighted_voyage_index,
             ( SELECT string_agg(
                           sub.crowns::text || ' ' || TO_CHAR(sub.end_at, 'YYYY-MM-DD'),
                           ' | '
                           ORDER BY sub.end_at DESC
                       )
               FROM (
                   SELECT crowns, end_at
                     FROM voyage_history vh_sub
                    WHERE vh_sub.player_tag = vh.player_tag
                    ORDER BY end_at DESC
                    LIMIT 52
               ) sub
             ) AS v_hist
        FROM voyage_history vh
       GROUP BY vh.player_tag
  ),

  -- ── War pipeline: recency-decayed (replaces flat AVG factual_logs) ──────────
  -- Level 1: aggregate to one row per (player, war section week)
  war_weekly AS (
      SELECT wa.player_tag,
             wa.week_id,
             max(wa.fame)                      AS fame,
             avg(wa.decks_used) / 16.0 * 100.0 AS decks_pct,
             max(wa.recorded_at)               AS max_recorded
        FROM drivers.war_activity wa
       GROUP BY wa.player_tag, wa.week_id
  ),
  -- Level 2: assign recency rank (1 = most recent section)
  war_ranked AS (
      SELECT player_tag,
             week_id,
             fame,
             decks_pct,
             max_recorded,
             row_number() OVER (
                 PARTITION BY player_tag ORDER BY max_recorded DESC
             ) AS recency_rank
        FROM war_weekly
  ),
  -- Level 3: compute decayed weighted averages and display history
  war_factuals AS (
      SELECT player_tag,
             count(*)                                                                          AS recorded_weeks,
             substrate.weighted_avg(ARRAY_AGG(fame::numeric      ORDER BY recency_rank))               AS avg_fame,
             substrate.weighted_avg(ARRAY_AGG(decks_pct           ORDER BY recency_rank))               AS avg_war_rate,
             string_agg(fame::text || ' ' || week_id, ' | ' ORDER BY max_recorded DESC)       AS hist
        FROM war_ranked
       GROUP BY player_tag
  ),

  -- ── Donation pipeline: recency-decayed weekly peaks expressed as daily avg ──
  -- Level 1: extract the weekly donation peak from daily snapshots
  donation_weekly AS (
      SELECT player_tag,
             DATE_TRUNC('week', snapshot_date) AS week_start,
             MAX(donations)                    AS max_donations
        FROM drivers.member_snapshots
       GROUP BY player_tag, DATE_TRUNC('week', snapshot_date)
  ),
  -- Level 2: assign recency rank (1 = most recent calendar week)
  donation_ranked AS (
      SELECT player_tag,
             week_start,
             max_donations,
             row_number() OVER (
                 PARTITION BY player_tag ORDER BY week_start DESC
             ) AS recency_rank
        FROM donation_weekly
  ),
  -- Level 3: compute decayed weighted average, divide by 7 for daily rate
  donation_factuals AS (
      SELECT player_tag,
             substrate.weighted_avg(ARRAY_AGG(max_donations::numeric ORDER BY recency_rank)) / 7.0
                 AS avg_daily_donations
        FROM donation_ranked
       GROUP BY player_tag
  ),

  -- ── Benchmarking context: clan-wide maximum baseline ────────────────────────
  benchmarking_context_base AS (
      SELECT
          ( SELECT COALESCE(NULLIF(max(w.recorded_weeks), 0), 12::bigint)
              FROM ( SELECT count(DISTINCT war_activity.week_id) AS recorded_weeks
                       FROM drivers.war_activity
                      GROUP BY war_activity.player_tag) w
          ) AS max_history_weeks,
          ( SELECT COALESCE(
                       percentile_cont(0.25) WITHIN GROUP (ORDER BY t.tenure_days::double precision),
                       14::double precision
                   )
              FROM ( SELECT GREATEST(0::numeric, EXTRACT(day FROM now() - members.joined_at))
                             AS tenure_days
                       FROM drivers.members
                      WHERE members.is_active = true) t
          ) AS rookie_window_days
  ),
  benchmarking_context AS (
      SELECT
          bcb.max_history_weeks,
          bcb.rookie_window_days,
          ( SELECT max(s.baseline_raw_score)
              FROM ( SELECT round(
                                COALESCE(m.week_fame, 0)::numeric  * 3.0
                                + COALESCE(wf2.avg_fame,     0::numeric) * 15.0
                                    * LEAST(1.0, COALESCE(wf2.recorded_weeks, 0)::numeric / bcb.max_history_weeks::numeric)
                                + COALESCE(df2.avg_daily_donations, m.donations::numeric / 7.0, 0::numeric) * 805.0
                                    * LEAST(1.0, COALESCE(wf2.recorded_weeks, 0)::numeric / bcb.max_history_weeks::numeric)
                                + m.trophies::numeric * 0.1
                                + COALESCE(wf2.avg_war_rate, 0::numeric) * 600.0
                                    * LEAST(1.0, COALESCE(wf2.recorded_weeks, 0)::numeric / bcb.max_history_weeks::numeric)
                            ) AS baseline_raw_score
                       FROM drivers.members m
                       LEFT JOIN war_factuals      wf2 ON m.player_tag = wf2.player_tag
                       LEFT JOIN donation_factuals df2 ON m.player_tag = df2.player_tag
                      WHERE m.is_active = true) s
          ) AS clan_max_baseline
        FROM benchmarking_context_base bcb
  ),

  -- ── Base stats: per-player resolved values ───────────────────────────────────
  base_stats AS (
      SELECT m.player_tag,
             m.player_name AS name,
             m.trophies,
             m.donations,
             m.joined_at,
             m.last_seen_at,
             m.war_wins,
             GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.last_seen_at) / 86400.0) AS days_inactive,
             GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.joined_at)    / 86400.0) AS tenure_days,
             COALESCE(m.week_fame, 0)                                                    AS current_fame,
             COALESCE(wf.avg_fame,      0::numeric)                                     AS avg_fame,
             COALESCE(wf.avg_war_rate,  0::numeric)                                     AS war_rate,
             COALESCE(wf.recorded_weeks, 0::bigint)                                     AS recorded_weeks,
             COALESCE(wf.hist,          '-'::text)                                      AS hist,
             COALESCE(vf.v_hist,        '-'::text)                                      AS v_hist,
             COALESCE(vf.weighted_voyage_index, 0::numeric)                             AS voyage_index,
             -- Recency-decayed daily avg; falls back to live weekly / 7 for members
             -- with no snapshot history (cold-start guard)
             COALESCE(df.avg_daily_donations, m.donations::numeric / 7.0, 0::numeric)  AS avg_daily_donations
        FROM drivers.members m
          LEFT JOIN war_factuals      wf ON m.player_tag = wf.player_tag
          LEFT JOIN voyage_factuals   vf ON m.player_tag = vf.player_tag
          LEFT JOIN donation_factuals df ON m.player_tag = df.player_tag
       WHERE m.is_active = true
  ),

  -- ── Weighted calculations ────────────────────────────────────────────────────
  weighted_calculations AS (
      SELECT bs.*,
             LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric) AS stability_index,
             LEAST(1.10, 1.0 + bs.tenure_days / 30.0 * 0.01)                        AS loyalty_multiplier,
             round(bs.voyage_index * bc.clan_max_baseline)                           AS voyage_merit,
             round(
                 bs.current_fame::numeric   *   3.0
                 + bs.avg_fame              *  15.0 * LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)
                 + bs.avg_daily_donations   * 805.0 * LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)
                 + bs.trophies::numeric     *   0.1
                 + bs.war_rate             * 600.0 * LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)
             ) AS core_baseline_score,
             power(1.0 - 0.08, GREATEST(0::numeric, bs.days_inactive - 4.0)) AS decay_multiplier,
             bc.rookie_window_days
        FROM base_stats bs
          CROSS JOIN benchmarking_context bc
  ),

  -- ── Clinical layer: raw performance + heritage bonus ────────────────────────
  clinical_layer AS (
      SELECT wc.*,
             round(
                 (wc.core_baseline_score + wc.voyage_merit)
                 * wc.loyalty_multiplier
                 * wc.decay_multiplier
             ) AS raw_performance_score,
             CASE
                 WHEN wc.tenure_days::double precision < wc.rookie_window_days
                     THEN (
                         wc.trophies::numeric * 1.0
                         + wc.donations::numeric * 0.1
                         + (wc.war_wins + 500)::numeric * 20.0
                     )::double precision
                     * power(
                         (wc.rookie_window_days - wc.tenure_days::double precision)
                         / wc.rookie_window_days,
                         2::numeric::double precision
                     )
                     / 5.0
                 ELSE 0::numeric::double precision
             END AS heritage_bonus
        FROM weighted_calculations wc
  ),

  -- ── Final scoring: normalize to 0-100 PeS ────────────────────────────────────
  final_scoring AS (
      SELECT *,
             raw_performance_score::double precision + heritage_bonus AS total_combined_score,
             max(raw_performance_score::double precision + heritage_bonus) OVER ()
                 AS global_max_score
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
    voyage_index,
    voyage_merit,
    loyalty_multiplier,
    stability_index,
    core_baseline_score AS baseline_raw_score,
    decay_multiplier,
    raw_performance_score,
    heritage_bonus,
    hist,
    v_hist,
    avg_daily_donations,
    CASE
        WHEN global_max_score > 0::numeric::double precision
            THEN round(total_combined_score / global_max_score * 100.0::double precision)
        ELSE 0::numeric::double precision
    END AS performance_score
   FROM final_scoring;

GRANT SELECT ON features.scoring_view TO authenticated, anon, service_role;

-- =============================================================================
-- 4. Rebuild features.roster_view (exposes avg_daily_donations)
-- =============================================================================
CREATE OR REPLACE VIEW features.roster_view AS
 WITH roster_source AS (
      SELECT m.id,
             m.player_tag,
             m.player_name,
             m.role,
             m.exp_level,
             m.last_seen_at,
             m.updated_at,
             m.snapshot_date,
             m.trophies,
             m.donations,
             m.donations_received,
             m.joined_at,
             m.star_points,
             m.best_trophies,
             m.total_donations,
             m.war_day_wins,
             m.clan_cards_collected,
             m.challenge_max_wins,
             m.card_count,
             m.elite_wild_cards,
             m.war_wins,
             m.week_fame,
             m.decks_used_today,
             m.clan_rank,
             m.last_ingested_at,
             m.is_active,
             m.decks_used_weekly,
             m.current_clan_tag,
             s.avg_fame,
             s.war_rate,
             s.voyage_index,
             s.voyage_merit,
             s.raw_performance_score,
             s.performance_score,
             s.stability_index,
             s.days_inactive,
             s.tenure_days,
             s.hist,
             s.v_hist,
             s.avg_daily_donations,
             ltrim(m.player_tag, '#'::text) AS raw_tag
        FROM drivers.members m
          LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
       WHERE m.is_active = true
         AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
  )
 SELECT player_name,
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
    voyage_index,
    voyage_merit,
    COALESCE(war_rate, 0::numeric) AS war_participation,
    raw_performance_score,
    performance_score,
    stability_index,
    substrate.format_last_seen(days_inactive) AS last_seen_label,
    substrate.format_tenure(tenure_days)       AS tenure_label,
    last_seen_at,
    last_ingested_at,
    tenure_days,
    hist,
    v_hist,
    avg_daily_donations,
    'https://link.clashroyale.com/en?player='::text || raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || raw_tag          AS royaleapi_link
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

-- =============================================================================
-- 5. Rebuild features.voyage_contributions (unchanged logic, clean rebuild)
-- =============================================================================
CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT c.player_tag,
       s.name AS player_name,
       c.total_voyage_crowns,
       c.percentage_voyage_crowns,
       s.performance_score
  FROM drivers.clan_voyage_contributions c
  JOIN features.scoring_view s ON s.player_tag = c.player_tag
 WHERE c.voyage_id = (
     SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1
 );

GRANT SELECT ON features.voyage_contributions TO authenticated, anon, service_role;

-- =============================================================================
-- 6. Rebuild features.voyage_summary (unchanged logic, clean rebuild)
-- =============================================================================
CREATE OR REPLACE VIEW features.voyage_summary AS
WITH current_voyage AS (
    SELECT *
      FROM drivers.clan_voyage
     WHERE status IN ('PENDING', 'ACTIVE')
     ORDER BY CASE WHEN status = 'ACTIVE' THEN 1 ELSE 2 END ASC, created_at DESC
     LIMIT 1
), total_stats AS (
    SELECT v.id AS voyage_id,
           COALESCE(SUM(c.total_voyage_crowns), 0) AS total_crowns
      FROM current_voyage v
      LEFT JOIN drivers.clan_voyage_contributions c ON c.voyage_id = v.id
     GROUP BY v.id
)
SELECT
    (SELECT jsonb_build_object(
        'id',            v.id,
        'clan_tag',      v.clan_tag,
        'status',        v.status,
        'target_crowns', v.target_crowns,
        'start_at',      v.start_at,
        'end_at',        v.end_at,
        'is_victory',    (ts.total_crowns >= v.target_crowns)
    ) FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id) AS event,
    COALESCE((SELECT ts.total_crowns FROM total_stats ts), 0)           AS total_voyage_crowns,
    COALESCE(
        (SELECT ts.total_crowns::numeric / NULLIF(v.target_crowns, 0)::numeric
           FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id),
        0
    ) AS progress_ratio;

GRANT SELECT ON features.voyage_summary TO authenticated, anon, service_role;

COMMIT;
