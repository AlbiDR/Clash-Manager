-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration: Audit & Reorder Features Views Columns
-- Reorders columns in features.tables by logical and importance order,
-- pushing infrastructure data (heritage, tier) and wide columns (ingame_link, royaleapi_link)
-- to the end of the views to improve Supabase Studio readability.

DROP VIEW IF EXISTS features.roster_view;
DROP VIEW IF EXISTS features.headhunter_view;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

CREATE VIEW features.scoring_view AS
 WITH factual_logs AS (
         SELECT war_activity.player_tag,
            count(DISTINCT war_activity.week_id) AS recorded_weeks,
            avg(war_activity.fame) AS avg_fame,
            ((avg(war_activity.decks_used) / 16.0) * 100.0) AS avg_war_rate
           FROM drivers.war_activity
          GROUP BY war_activity.player_tag
        ), base_stats AS (
         SELECT m.player_tag,
            m.player_name,
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
           FROM (drivers.members m
             LEFT JOIN factual_logs fl ON ((fl.player_tag = m.player_tag)))
          WHERE (m.is_active = true)
        ), weighted_calculations AS (
         SELECT bs.player_tag,
            bs.player_name,
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
            LEAST(1.10, (1.0 + ((bs.tenure_days / 30.0) * 0.01))) AS loyalty_multiplier,
            LEAST(1.0, ((bs.recorded_weeks)::numeric / 12.0)) AS stability_index,
            round(((((((bs.current_fame)::numeric * 3.0) + (bs.avg_fame * 15.0)) + ((bs.donations)::numeric * 100.0)) + ((bs.trophies)::numeric * 0.1)) + (bs.war_rate * 150.0))) AS baseline_raw_score,
            ((((bs.trophies)::numeric * 1.0) + ((bs.donations)::numeric * 0.1)) + (((bs.war_wins + 500))::numeric * 20.0)) AS raw_potential_score,
            power((1.0 - 0.08), GREATEST((0)::numeric, (bs.days_inactive - 4.0))) AS decay_multiplier
           FROM base_stats bs
        ), clinical_layer AS (
         SELECT wc.player_tag,
            wc.player_name,
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
            wc.loyalty_multiplier,
            wc.stability_index,
            wc.baseline_raw_score,
            wc.raw_potential_score,
            wc.decay_multiplier,
            round(((wc.baseline_raw_score * wc.loyalty_multiplier) * wc.decay_multiplier)) AS raw_performance_score,
                CASE
                    WHEN (wc.tenure_days < (14)::numeric) THEN ((wc.raw_potential_score * power((((14)::numeric - wc.tenure_days) / 14.0), (2)::numeric)) / 5.0)
                    ELSE (0)::numeric
                END AS heritage_bonus
           FROM weighted_calculations wc
        )
 SELECT 
    player_name,
    player_tag,
    trophies,
    donations,
    war_wins,
    current_fame,
    avg_fame,
    war_rate,
    days_inactive,
    tenure_days,
    raw_performance_score,
    raw_performance_score AS rpes,
    CASE
        WHEN (max((raw_performance_score + heritage_bonus)) OVER () > (0)::numeric) THEN round((((raw_performance_score + heritage_bonus) / max((raw_performance_score + heritage_bonus)) OVER ()) * 100.0))
        ELSE (0)::numeric
    END AS performance_score,
    CASE
        WHEN (max((raw_performance_score + heritage_bonus)) OVER () > (0)::numeric) THEN round((((raw_performance_score + heritage_bonus) / max((raw_performance_score + heritage_bonus)) OVER ()) * 100.0))
        ELSE (0)::numeric
    END AS pes,
    recorded_weeks,
    loyalty_multiplier,
    stability_index,
    baseline_raw_score,
    raw_potential_score,
    decay_multiplier,
    heritage_bonus,
    joined_at,
    last_seen_at
   FROM clinical_layer;


CREATE OR REPLACE VIEW features.headhunter_view AS
 WITH corpus_benchmark AS (
         SELECT GREATEST(
             COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'::drivers.recruit_status), 0::numeric),
             COALESCE((SELECT max(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()), 0::numeric),
             COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits), 1::numeric)
         ) AS value
        ), heritage_context AS (
         SELECT 
            player_tag,
            max_pes,
            tenure_days,
            (last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
         FROM drivers.heritage_ledger
        ), base_calculations AS (
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
            h.player_tag AS h_player_tag,
            COALESCE(h.is_fresh AND h.max_pes >= 80, false) AS has_blessing
           FROM drivers.recruits r
           LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
          WHERE r.status = 'ACTIVE'::drivers.recruit_status 
            AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = r.player_tag)
            AND r.trophies > 0 
            AND r.raw_potential_score > 0::numeric
        ), scoring_layer AS (
          SELECT 
            *,
            LEAST(100::numeric, round((((raw_potential_score * (CASE WHEN has_blessing THEN 1.05 ELSE 1.0 END)) / (SELECT value FROM corpus_benchmark)) * 100::numeric))) AS potential_score
          FROM base_calculations
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
        WHEN h_player_tag IS NOT NULL AND has_blessing THEN 'RETURNING_VETERAN'::text
        WHEN h_player_tag IS NOT NULL THEN 'FORMER_MEMBER'::text
        ELSE 'NEW_CANDIDATE'::text
    END AS heritage_status,
    has_blessing AS has_heritage_blessing,
    last_seen_at,
    found_date,
    ('https://link.clashroyale.com/en?player='::text || ltrim(player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(player_tag, '#'::text)) AS royaleapi_link
   FROM scoring_layer
  ORDER BY raw_potential_score DESC;


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
    COALESCE(s.war_rate, (0)::numeric) AS war_participation,
    s.raw_performance_score,
    s.performance_score,
    s.stability_index,
    substrate.format_last_seen(s.days_inactive) AS last_seen_label,
    substrate.format_tenure(s.tenure_days) AS tenure_label,
    m.last_seen_at,
    m.last_ingested_at,
    s.tenure_days,
    ('https://link.clashroyale.com/en?player='::text || ltrim(m.player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(m.player_tag, '#'::text)) AS royaleapi_link
   FROM (drivers.members m
     LEFT JOIN features.scoring_view s ON ((s.player_tag = m.player_tag)))
  WHERE ((m.is_active = true) AND (m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text))
  ORDER BY s.raw_performance_score DESC NULLS LAST, s.performance_score DESC NULLS LAST;
