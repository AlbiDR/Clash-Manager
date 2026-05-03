-- Migration: Adaptive Tiering Thresholds
-- Eliminates magic numbers (e.g., 12000, 10500, 10000) from features.headhunter_view
-- Transitions to a dynamic, relative percentage-based tiering system.

DROP VIEW IF EXISTS features.headhunter_view;

CREATE VIEW features.headhunter_view AS
 WITH corpus_benchmark AS (
         SELECT GREATEST(
             COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'::drivers.recruit_status), 0::numeric),
             COALESCE((SELECT max(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()), 0::numeric),
             COALESCE((SELECT max(raw_potential_score) FROM drivers.recruits), 1::numeric)
         ) AS value
        ), heritage_context AS (
         SELECT heritage_ledger.player_tag,
            heritage_ledger.max_pes,
            heritage_ledger.tenure_days,
            (heritage_ledger.last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
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
            h.player_tag AS h_player_tag,
            h.is_fresh,
            h.max_pes,
            LEAST((100)::numeric, round((((r.raw_potential_score *
                CASE
                    -- Replaced magic number 10000 with a relative percentile (80 out of 100 max_pes)
                    WHEN COALESCE((h.is_fresh AND (h.max_pes >= 80)), false) THEN 1.05
                    ELSE 1.0
                END) / ( SELECT corpus_benchmark.value
                   FROM corpus_benchmark)) * (100)::numeric))) AS potential_score,
            ((EXTRACT(epoch FROM (now() - r.found_date)))::integer / 60) AS longevity_minutes
           FROM drivers.recruits r
           LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
          WHERE r.status = 'ACTIVE'::drivers.recruit_status 
            AND NOT EXISTS ( SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = r.player_tag )
            AND r.trophies > 0 
            AND r.raw_potential_score > 0::numeric
        )
 SELECT 
    bc.player_name,
    bc.player_tag,
    bc.trophies,
    bc.donations,
    bc.cards,
    bc.war_wins,
    bc.raw_potential_score,
    bc.potential_score,
    substrate.format_longevity(bc.longevity_minutes) AS longevity_label,
    bc.longevity_minutes AS longevity,
    CASE
        -- Replaced absolute magic numbers (12000, 10500) with dynamic percentages
        WHEN (bc.potential_score >= 90::numeric) THEN 'ELITE'::text
        WHEN (bc.potential_score >= 75::numeric) THEN 'HIGH'::text
        ELSE 'MID'::text
    END AS tier,
    CASE
        WHEN ((bc.h_player_tag IS NOT NULL) AND bc.is_fresh) THEN 'RETURNING_VETERAN'::text
        WHEN (bc.h_player_tag IS NOT NULL) THEN 'FORMER_MEMBER'::text
        ELSE 'NEW_CANDIDATE'::text
    END AS heritage_status,
    COALESCE((bc.is_fresh AND (bc.max_pes >= 80)), false) AS has_heritage_blessing,
    bc.last_seen_at,
    bc.found_date,
    ('https://link.clashroyale.com/en?player='::text || ltrim(bc.player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(bc.player_tag, '#'::text)) AS royaleapi_link
   FROM base_calculations bc
  ORDER BY bc.raw_potential_score DESC;

