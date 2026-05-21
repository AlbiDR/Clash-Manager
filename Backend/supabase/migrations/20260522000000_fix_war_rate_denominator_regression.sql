-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Fix war rate denominator regression (definitive)
 * -----------------------------------------------------------------------
 * Root Cause: 20260520230000_add_voyage_hist_to_roster.sql introduced
 * the v_hist column into scoring_view and roster_view, but it reverted
 * the war rate denominator from 16.0 back to 4.0.
 *
 * A Clash Royale River Race week has 4 war days, each allowing 4 decks,
 * giving a maximum of 16 decks per recorded week_id. The correct formula
 * to normalize `avg(decks_used)` to a 0-100 % scale is:
 *
 *   avg(decks_used) / 16.0 * 100.0
 *
 * Using 4.0 as the divisor produces values up to 400%, which was the
 * original bug. The denominator fix was first applied in migration
 * 20260520223500_fix_war_rate_percentage.sql (which also raised the
 * score multiplier from 150.0 to 600.0 to preserve the same absolute
 * score contribution). The subsequent v_hist migration silently
 * regressed both changes.
 *
 * This migration rebuilds both views with all three corrections in place:
 *   1. factual_logs: avg(decks_used) / 16.0
 *   2. benchmarking_context inline query: avg(decks_used) / 16.0
 *   3. weighted_calculations: war_rate * 600.0
 *
 * All v_hist logic from 20260520230000 is preserved intact.
 */

BEGIN;

DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

-- =============================================================================
-- SCORING VIEW
-- =============================================================================
CREATE OR REPLACE VIEW features.scoring_view AS
 WITH voyage_history AS (
         SELECT c.player_tag,
            c.crowns,
            v.target_crowns,
            v.end_at,
            row_number() OVER (PARTITION BY c.player_tag ORDER BY v.end_at DESC) AS recency_rank
           FROM drivers.clan_voyage_contributions c
             JOIN drivers.clan_voyage v ON v.id = c.voyage_id
          WHERE v.status = 'COMPLETED'::text
        ),
  voyage_factuals AS (
         SELECT voyage_history.player_tag,
            sum(
              voyage_history.crowns::numeric / voyage_history.target_crowns::numeric
              * GREATEST(0.5, 1.0 - (voyage_history.recency_rank - 1)::numeric * 0.05)
            ) AS weighted_voyage_index,
            ( SELECT string_agg(sub.crowns::text || ' ' || TO_CHAR(sub.end_at, 'YYYY-MM-DD'), ' | ' ORDER BY sub.end_at DESC)
              FROM (
                SELECT crowns, end_at
                FROM voyage_history vh_sub
                WHERE vh_sub.player_tag = voyage_history.player_tag
                ORDER BY end_at DESC
                LIMIT 52
              ) sub
            ) AS v_hist
           FROM voyage_history
          GROUP BY voyage_history.player_tag
        ),
  factual_logs AS (
         SELECT
            m.player_tag,
            count(DISTINCT wa.week_id) AS recorded_weeks,
            avg(wa.fame)              AS avg_fame,
            -- CORRECTION: divide by 16.0 (4 days * 4 decks/day = 16 max decks per week)
            -- Using 4.0 as the divisor produced war rates up to 400%.
            avg(wa.decks_used) / 16.0 * 100.0 AS avg_war_rate,
            ( SELECT string_agg(sub.fame::text || ' ' || sub.week_id, ' | ' ORDER BY sub.max_recorded DESC)
              FROM (
                SELECT wa2.week_id,
                       max(wa2.fame)        AS fame,
                       max(wa2.recorded_at) AS max_recorded
                FROM drivers.war_activity wa2
                WHERE wa2.player_tag = m.player_tag
                GROUP BY wa2.week_id
                ORDER BY max(wa2.recorded_at) DESC
              ) sub
            ) AS hist
           FROM drivers.members m
           LEFT JOIN drivers.war_activity wa ON wa.player_tag = m.player_tag
          WHERE m.is_active = true
          GROUP BY m.player_tag
        ),
  benchmarking_context AS (
         SELECT
            ( SELECT COALESCE(NULLIF(max(w.recorded_weeks), 0), 12::bigint)
                FROM ( SELECT count(DISTINCT war_activity.week_id) AS recorded_weeks
                         FROM drivers.war_activity
                        GROUP BY war_activity.player_tag) w
            ) AS max_history_weeks,
            ( SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY t.tenure_days::double precision), 14::double precision)
                FROM ( SELECT GREATEST(0::numeric, EXTRACT(day FROM now() - members.joined_at)) AS tenure_days
                         FROM drivers.members
                        WHERE members.is_active = true) t
            ) AS rookie_window_days,
            ( SELECT max(s.baseline_raw_score)
                FROM ( SELECT round(
                                COALESCE(m.week_fame, 0)::numeric * 3.0
                                + COALESCE(fl2.avg_fame, 0::numeric) * 15.0
                                + m.donations::numeric * 100.0
                                + m.trophies::numeric * 0.1
                                -- CORRECTION: multiplier 600.0 matches the 16.0 denominator
                                -- (4x of 150.0, compensating for the 4x smaller war_rate value)
                                + COALESCE(fl2.avg_war_rate, 0::numeric) * 600.0
                              ) AS baseline_raw_score
                         FROM drivers.members m
                         LEFT JOIN (
                           SELECT war_activity.player_tag,
                                  avg(war_activity.fame)               AS avg_fame,
                                  -- CORRECTION: same 16.0 denominator in the inline subquery
                                  avg(war_activity.decks_used) / 16.0 * 100.0 AS avg_war_rate
                             FROM drivers.war_activity
                            GROUP BY war_activity.player_tag
                         ) fl2 ON m.player_tag = fl2.player_tag
                        WHERE m.is_active = true) s
            ) AS clan_max_baseline
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
            GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.joined_at) / 86400.0)    AS tenure_days,
            COALESCE(m.week_fame, 0)              AS current_fame,
            COALESCE(fl.avg_fame, 0::numeric)     AS avg_fame,
            COALESCE(fl.avg_war_rate, 0::numeric) AS war_rate,
            COALESCE(fl.recorded_weeks, 0::bigint) AS recorded_weeks,
            COALESCE(fl.hist, '-'::text)           AS hist,
            COALESCE(vf.v_hist, '-'::text)         AS v_hist,
            COALESCE(vf.weighted_voyage_index, 0::numeric) AS voyage_index
           FROM drivers.members m
             LEFT JOIN factual_logs fl ON m.player_tag = fl.player_tag
             LEFT JOIN voyage_factuals vf ON m.player_tag = vf.player_tag
          WHERE m.is_active = true
        ),
  weighted_calculations AS (
         SELECT bs.*,
            LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric) AS stability_index,
            LEAST(1.10, 1.0 + bs.tenure_days / 30.0 * 0.01)                        AS loyalty_multiplier,
            round(bs.voyage_index * bc.clan_max_baseline)                           AS voyage_merit,
            round(
              bs.current_fame::numeric * 3.0
              + bs.avg_fame * 15.0
              + bs.donations::numeric * 100.0
              + bs.trophies::numeric * 0.1
              -- CORRECTION: 600.0 multiplier keeps war_rate contribution identical
              -- to what 150.0 produced when decks_used was divided by 4.0
              + bs.war_rate * 600.0
            ) AS core_baseline_score,
            power(1.0 - 0.08, GREATEST(0::numeric, bs.days_inactive - 4.0)) AS decay_multiplier,
            bc.rookie_window_days
           FROM base_stats bs
             CROSS JOIN benchmarking_context bc
        ),
  clinical_layer AS (
         SELECT wc.*,
            round((wc.core_baseline_score + wc.voyage_merit) * wc.loyalty_multiplier * wc.decay_multiplier) AS raw_performance_score,
            CASE
                WHEN wc.tenure_days::double precision < wc.rookie_window_days
                    THEN (wc.trophies::numeric * 1.0 + wc.donations::numeric * 0.1 + (wc.war_wins + 500)::numeric * 20.0)::double precision
                         * power((wc.rookie_window_days - wc.tenure_days::double precision) / wc.rookie_window_days, 2::numeric::double precision)
                         / 5.0
                ELSE 0::numeric::double precision
            END AS heritage_bonus
           FROM weighted_calculations wc
        ),
  final_scoring AS (
         SELECT *,
            raw_performance_score::double precision + heritage_bonus AS total_combined_score,
            max(raw_performance_score::double precision + heritage_bonus) OVER () AS global_max_score
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
    CASE
        WHEN global_max_score > 0::numeric::double precision
            THEN round(total_combined_score / global_max_score * 100.0::double precision)
        ELSE 0::numeric::double precision
    END AS performance_score
   FROM final_scoring;

GRANT SELECT ON features.scoring_view TO authenticated, anon, service_role;

-- =============================================================================
-- ROSTER VIEW
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
            ltrim(m.player_tag, '#'::text) AS raw_tag
           FROM drivers.members m
             LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
          WHERE m.is_active = true AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
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
    'https://link.clashroyale.com/en?player='::text || raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || raw_tag AS royaleapi_link
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

COMMIT;
