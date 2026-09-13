-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Scope scoring_view's factual CTEs to active members. war_weekly,
-- donation_weekly and both arms of voyage_history aggregated every player in
-- drivers.war_activity, member_snapshots, clan_voyage_contributions and
-- player_voyage_history, then LEFT JOINed onto a base_stats already filtered to
-- is_active, so the discarded rows were computed first. Output is unchanged;
-- benchmarking_context_base reads war_activity directly and is left untouched.

CREATE OR REPLACE VIEW features.scoring_view AS
 WITH
  active_members AS (
      SELECT m.player_tag
        FROM drivers.members m
       WHERE m.is_active = true
  ),
  voyage_history AS (
      SELECT
          c.player_tag,
          c.total_voyage_crowns                               AS crowns,
          v.target_crowns,
          v.end_at,
          v.id                                                AS voyage_id
        FROM drivers.clan_voyage_contributions c
          JOIN drivers.clan_voyage v ON v.id = c.voyage_id
       WHERE v.status = 'COMPLETED'::text
         AND c.player_tag IN (SELECT am.player_tag FROM active_members am)

      UNION ALL

      SELECT
          pvh.player_tag,
          (regexp_split_to_array(entry, '\|'))[2]::integer               AS crowns,
          (regexp_split_to_array(entry, '\|'))[3]::integer               AS target_crowns,
          ((regexp_split_to_array(entry, '\|'))[4]::date)::timestamptz  AS end_at,
          (regexp_split_to_array(entry, '\|'))[1]::bigint                AS voyage_id
        FROM   drivers.player_voyage_history pvh
        CROSS  JOIN LATERAL unnest(string_to_array(pvh.history, ',')) AS entry
       WHERE   pvh.history <> ''
         AND   pvh.player_tag IN (SELECT am.player_tag FROM active_members am)
  ),
  voyage_ranked AS (
      SELECT
          player_tag,
          crowns,
          target_crowns,
          end_at,
          voyage_id,
          row_number() OVER (
              PARTITION BY player_tag ORDER BY end_at DESC
          ) AS recency_rank
        FROM voyage_history
  ),
  voyage_factuals AS (
      SELECT vh.player_tag,
             sum(
                 vh.crowns::numeric / NULLIF(vh.target_crowns::numeric, 0)
                 * GREATEST(0.5, 1.0 - (vh.recency_rank - 1)::numeric * 0.05)
             ) AS weighted_voyage_index,
             ( SELECT string_agg(
                           sub.crowns::text || ' ' || TO_CHAR(sub.end_at, 'YYYY-MM-DD'),
                           ' | '
                           ORDER BY sub.end_at DESC
                       )
               FROM (
                   SELECT crowns, end_at
                     FROM voyage_ranked vh_sub
                    WHERE vh_sub.player_tag = vh.player_tag
                    ORDER BY end_at DESC
                    LIMIT 52
               ) sub
             ) AS v_hist
        FROM voyage_ranked vh
       GROUP BY vh.player_tag
  ),

  war_weekly AS (
      SELECT wa.player_tag,
             wa.week_id,
             max(wa.fame)                      AS fame,
             avg(wa.decks_used) / 16.0 * 100.0 AS decks_pct,
             max(wa.recorded_at)               AS max_recorded
        FROM drivers.war_activity wa
       WHERE wa.player_tag IN (SELECT am.player_tag FROM active_members am)
       GROUP BY wa.player_tag, wa.week_id
  ),
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
  war_factuals AS (
      SELECT player_tag,
             count(*)                                                                          AS recorded_weeks,
             substrate.weighted_avg(ARRAY_AGG(fame::numeric      ORDER BY recency_rank))               AS avg_fame,
             substrate.weighted_avg(ARRAY_AGG(decks_pct           ORDER BY recency_rank))               AS avg_war_rate,
             string_agg(fame::text || ' ' || week_id, ' | ' ORDER BY max_recorded DESC)       AS hist
        FROM war_ranked
       GROUP BY player_tag
  ),

  donation_weekly AS (
      SELECT player_tag,
             DATE_TRUNC('week', snapshot_date) AS week_start,
             MAX(donations)                    AS max_donations
        FROM drivers.member_snapshots
       WHERE player_tag IN (SELECT am.player_tag FROM active_members am)
       GROUP BY player_tag, DATE_TRUNC('week', snapshot_date)
  ),
  donation_ranked AS (
      SELECT player_tag,
             week_start,
             max_donations,
             row_number() OVER (
                 PARTITION BY player_tag ORDER BY week_start DESC
             ) AS recency_rank
        FROM donation_weekly
  ),
  donation_factuals AS (
      SELECT player_tag,
             substrate.weighted_avg(ARRAY_AGG(max_donations::numeric ORDER BY recency_rank)) / 7.0
                 AS avg_daily_donations
        FROM donation_ranked
       GROUP BY player_tag
  ),

  benchmarking_context_base AS (
      SELECT
          ( SELECT COALESCE(NULLIF(max(w.recorded_weeks), 0), 12::bigint)
              FROM ( SELECT count(DISTINCT drivers.war_activity.week_id) AS recorded_weeks
                       FROM drivers.war_activity
                      GROUP BY drivers.war_activity.player_tag) w
          ) AS max_history_weeks,
          ( SELECT COALESCE(
                       percentile_cont(0.25) WITHIN GROUP (ORDER BY t.tenure_days::double precision),
                       14::double precision
                   )
              FROM ( SELECT GREATEST(0::numeric, EXTRACT(day FROM now() - drivers.members.joined_at))
                             AS tenure_days
                       FROM drivers.members
                      WHERE drivers.members.is_active = true) t
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
             COALESCE(df.avg_daily_donations, m.donations::numeric / 7.0, 0::numeric)  AS avg_daily_donations
        FROM drivers.members m
          LEFT JOIN war_factuals      wf ON m.player_tag = wf.player_tag
          LEFT JOIN voyage_factuals   vf ON m.player_tag = vf.player_tag
          LEFT JOIN donation_factuals df ON m.player_tag = df.player_tag
       WHERE m.is_active = true
  ),

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
                         wc.trophies::numeric * 1.0     -- RPOS_TROPHY_WEIGHT = 1.0 (trophy weight coefficient)
                         + wc.donations::numeric * 0.1   -- RPOS_DONATION_WEIGHT = 0.1 (donation weight coefficient; unchanged, see WEEKLY-vs-lifetime caveat above)
                         + wc.war_wins::numeric * 10.0   -- RPOS_LEGACY_WAR_WEIGHT = 10 (legacy CW1 war win micro-bonus; no +500 offset, no *20 -- bug removed)
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
