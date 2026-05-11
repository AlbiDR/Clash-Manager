-- Migration: Gating Headhunter View
-- Excludes zero-stat "ghost" candidates from surfacing in the recruitment UI.
-- Adds r.trophies > 0 and r.raw_potential_score > 0 to the view's WHERE clause.

CREATE OR REPLACE VIEW features.headhunter_view AS
 WITH corpus_benchmark AS (
         SELECT GREATEST(COALESCE(( SELECT max(recruits.raw_potential_score) AS max
                   FROM drivers.recruits
                  WHERE (recruits.status = 'ACTIVE'::drivers.recruit_status)), (0)::numeric), COALESCE(( SELECT max(recruit_blacklist.raw_potential_score) AS max
                   FROM drivers.recruit_blacklist
                  WHERE (recruit_blacklist.expires_at > now())), (0)::numeric), COALESCE(( SELECT max(recruits.raw_potential_score) AS max
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
  WHERE ((r.status = 'ACTIVE'::drivers.recruit_status) 
    AND (NOT (EXISTS ( SELECT 1
           FROM drivers.recruit_blacklist bl
          WHERE (bl.player_tag = r.player_tag))))
    AND r.trophies > 0
    AND r.raw_potential_score > 0)
  ORDER BY r.raw_potential_score DESC;
