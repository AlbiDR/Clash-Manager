-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
VIEW NOMENCLATURE STREAMLINING
----------------------------------------------------------------------------
Eliminates duplicated columns and shorthand aliases (pos, rpos, pes, rpes)
in favor of authoritative, full-length nomenclature. 
Improves troubleshooting and architectural clarity.
============================================================================
*/

-- 1. Streamline features.headhunter_view
DROP VIEW IF EXISTS features.headhunter_view;
CREATE VIEW features.headhunter_view AS
 WITH corpus_benchmark AS (
         SELECT GREATEST(
            COALESCE(( SELECT max(recruits.raw_potential_score) AS max
                   FROM drivers.recruits
                  WHERE (recruits.status = 'ACTIVE'::drivers.recruit_status)), (0)::numeric), 
            COALESCE(( SELECT max(recruit_blacklist.raw_potential_score) AS max
                   FROM drivers.recruit_blacklist
                  WHERE (recruit_blacklist.expires_at > now())), (0)::numeric), 
            COALESCE(( SELECT max(recruits.raw_potential_score) AS max
                   FROM drivers.recruits), (1)::numeric)) AS value
        ), heritage_context AS (
         SELECT heritage_ledger.player_tag,
            heritage_ledger.max_pes,
            heritage_ledger.tenure_days,
            (heritage_ledger.last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
           FROM drivers.heritage_ledger
        )
 SELECT r.player_tag,
    r.player_name,
    ('https://link.clashroyale.com/en?player='::text || ltrim(r.player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(r.player_tag, '#'::text)) AS royaleapi_link,
    r.trophies,
    r.donations,
    r.cards,
    r.war_wins,
    r.found_date,
    ((EXTRACT(epoch FROM (now() - r.found_date)))::integer / 60) AS longevity,
    substrate.format_longevity(((EXTRACT(epoch FROM (now() - r.found_date)))::integer / 60)) AS longevity_label,
    r.raw_potential_score,
    LEAST((100)::numeric, round((((r.raw_potential_score *
        CASE
            WHEN COALESCE((h.is_fresh AND (h.max_pes > 10000)), false) THEN 1.05
            ELSE 1.0
        END) / ( SELECT corpus_benchmark.value
           FROM corpus_benchmark)) * (100)::numeric))) AS potential_score,
    COALESCE((h.is_fresh AND (h.max_pes > 10000)), false) AS has_heritage_blessing,
        CASE
            WHEN (r.raw_potential_score >= (12000)::numeric) THEN 'ELITE'::text
            WHEN (r.raw_potential_score >= (10500)::numeric) THEN 'HIGH'::text
            ELSE 'MID'::text
        END AS tier,
    r.last_scan AS last_seen_at,
        CASE
            WHEN ((h.player_tag IS NOT NULL) AND h.is_fresh) THEN 'RETURNING_VETERAN'::text
            WHEN (h.player_tag IS NOT NULL) THEN 'FORMER_MEMBER'::text
            ELSE 'NEW_CANDIDATE'::text
        END AS heritage_status
   FROM (drivers.recruits r
     LEFT JOIN heritage_context h ON ((h.player_tag = r.player_tag)))
  WHERE ((r.status = 'ACTIVE'::drivers.recruit_status) AND (NOT (EXISTS ( SELECT 1
           FROM drivers.recruit_blacklist bl
          WHERE (bl.player_tag = r.player_tag)))))
  ORDER BY r.raw_potential_score DESC;

-- 2. Streamline features.roster_view
DROP VIEW IF EXISTS features.roster_view;
CREATE VIEW features.roster_view AS
 SELECT m.player_tag,
    m.player_name,
    m.role,
    ('https://link.clashroyale.com/en?player='::text || ltrim(m.player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(m.player_tag, '#'::text)) AS royaleapi_link,
    m.exp_level,
    m.trophies,
    m.donations,
    m.donations_received,
    m.clan_rank,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.avg_fame,
    s.raw_performance_score,
    s.performance_score,
    s.stability_index,
    m.last_seen_at,
    m.last_ingested_at,
    substrate.format_last_seen(s.days_inactive) AS last_seen_label,
    substrate.format_tenure(s.tenure_days) AS tenure_label,
    s.tenure_days,
    COALESCE(s.war_rate, (0)::numeric) AS war_participation
   FROM (drivers.members m
     LEFT JOIN features.scoring_view s ON ((s.player_tag = m.player_tag)))
  WHERE ((m.is_active = true) AND (m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text))
  ORDER BY s.raw_performance_score DESC NULLS LAST, s.performance_score DESC NULLS LAST;
