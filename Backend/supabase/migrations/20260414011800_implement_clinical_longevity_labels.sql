-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Create a formatting helper for clinical longevity labels
CREATE OR REPLACE FUNCTION substrate.format_longevity(p_minutes integer)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    IF p_minutes < 60 THEN
        RETURN p_minutes || 'm';
    ELSIF p_minutes < 1440 THEN
        RETURN (p_minutes / 60) || 'h';
    ELSIF p_minutes < 10080 THEN
        RETURN (p_minutes / 1440) || 'd';
    ELSE
        RETURN (p_minutes / 10080) || 'w';
    END IF;
END;
$function$;

-- 2. Update views to include the human-readable label
DROP VIEW IF EXISTS drivers.top_recruits_view;
DROP VIEW IF EXISTS features.headhunter_view;

CREATE OR REPLACE VIEW features.headhunter_view AS
 WITH elite_benchmark AS (
         SELECT COALESCE(avg(sub.score), (12000)::numeric) AS value
           FROM ( SELECT scoring_view.raw_performance_score AS score
                   FROM features.scoring_view
                  ORDER BY scoring_view.raw_performance_score DESC
                 LIMIT 10) sub
        ), heritage_context AS (
         SELECT heritage_ledger.tag,
            heritage_ledger.max_pes,
            heritage_ledger.tenure_days,
            (heritage_ledger.last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
           FROM drivers.heritage_ledger
        )
 SELECT r.tag,
    r.name,
    r.trophies,
    r.donations,
    r.war_wins,
    r.found_date,
    round((EXTRACT(EPOCH FROM (now() - r.found_date)) / 60))::integer AS longevity,
    substrate.format_longevity(round((EXTRACT(EPOCH FROM (now() - r.found_date)) / 60))::integer) AS longevity_label,
    r.raw_potential_score AS rpos,
    round((((r.raw_potential_score *
        CASE
            WHEN COALESCE((h.is_fresh AND (h.max_pes > 10000)), false) THEN 1.05
            ELSE 1.0
        END) / ( SELECT elite_benchmark.value
           FROM elite_benchmark)) * (100)::numeric), 1) AS pos,
    COALESCE((h.is_fresh AND (h.max_pes > 10000)), false) AS has_heritage_blessing,
        CASE
            WHEN (r.raw_potential_score >= (12000)::numeric) THEN 'ELITE'::text
            WHEN (r.raw_potential_score >= (10500)::numeric) THEN 'HIGH'::text
            ELSE 'MID'::text
        END AS tier,
    r.last_scan AS last_seen_at,
        CASE
            WHEN ((h.tag IS NOT NULL) AND h.is_fresh) THEN 'RETURNING_VETERAN'::text
            WHEN (h.tag IS NOT NULL) THEN 'FORMER_MEMBER'::text
            ELSE 'NEW_CANDIDATE'::text
        END AS heritage_status
   FROM (drivers.recruits r
     LEFT JOIN heritage_context h ON ((h.tag = r.tag)))
  WHERE ((r.status = 'ACTIVE'::drivers.recruit_status) AND (NOT (EXISTS ( SELECT 1
           FROM drivers.recruit_blacklist bl
          WHERE (bl.tag = r.tag)))))
  ORDER BY r.raw_potential_score DESC;

CREATE OR REPLACE VIEW drivers.top_recruits_view AS
 WITH stats AS (
         SELECT percentile_cont((0.75)::double precision) WITHIN GROUP (ORDER BY ((headhunter_view.pos)::double precision)) AS threshold
           FROM features.headhunter_view
        )
 SELECT hv.tag,
    hv.name,
    hv.trophies,
    hv.donations,
    hv.war_wins,
    hv.rpos,
    hv.pos,
    hv.found_date,
    hv.longevity,
    hv.longevity_label,
    hv.has_heritage_blessing,
    hv.tier,
    hv.last_seen_at,
    hv.heritage_status
   FROM features.headhunter_view hv,
    stats
  WHERE (((hv.pos)::double precision >= stats.threshold) AND (hv.heritage_status <> 'RETURNING_VETERAN'::text))
  ORDER BY hv.pos DESC;
