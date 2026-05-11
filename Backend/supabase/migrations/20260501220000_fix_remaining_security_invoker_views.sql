-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FIX: STRIP security_invoker FROM ALL REMAINING VIEWS
--
-- Five views still have `security_invoker=true` set in pg_class.reloptions:
--   features.governance_report         -> substrate.governance_telemetry (RLS blocks anon)
--   features.headhunter_view           -> drivers.recruits (works by chance; fragile)
--   features.tactical_awareness_view   -> drivers.members  (works by chance; fragile)
--   features.war_activity_view         -> drivers.war_activity (RLS blocks anon)
--   substrate.view_pipeline_health     -> substrate.pipeline_heartbeat (RLS blocks anon)
--
-- Views with security_invoker execute as the calling role (anon for PWA).
-- RLS policies on the underlying drivers/substrate tables only permit
-- `authenticated` and `service_role`, so anon silently receives zero rows.
-- Removing security_invoker restores the Postgres default (security_definer):
-- the view executes as its owner (postgres), bypassing RLS. Access is still
-- controlled by GRANT SELECT on each view.
-- =============================================================================


-- -------------------------------------------------------------------------
-- 1. features.governance_report
--    Source: substrate.governance_telemetry (RLS blocks anon)
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS features.governance_report;

CREATE VIEW features.governance_report AS
SELECT
    id,
    event_type,
    status,
    message,
    metadata,
    created_at
FROM substrate.governance_telemetry gt
ORDER BY created_at DESC;

GRANT SELECT ON features.governance_report TO authenticated, anon, service_role;


-- -------------------------------------------------------------------------
-- 2. features.headhunter_view
--    Source: drivers.recruits, drivers.recruit_blacklist, drivers.heritage_ledger
--    Currently works for anon by chance; harden to definer for consistency.
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS features.headhunter_view;

CREATE VIEW features.headhunter_view AS
WITH corpus_benchmark AS (
    SELECT GREATEST(
        COALESCE((SELECT MAX(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'::drivers.recruit_status), 0),
        COALESCE((SELECT MAX(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()), 0),
        COALESCE((SELECT MAX(raw_potential_score) FROM drivers.recruits), 1)
    ) AS value
),
heritage_context AS (
    SELECT
        player_tag,
        max_pes,
        tenure_days,
        (last_seen_at >= now() - INTERVAL '30 days') AS is_fresh
    FROM drivers.heritage_ledger
)
SELECT
    r.player_tag,
    r.player_name,
    ('https://link.clashroyale.com/en?player=' || ltrim(r.player_tag, '#')) AS ingame_link,
    ('https://royaleapi.com/player/'           || ltrim(r.player_tag, '#')) AS royaleapi_link,
    r.trophies,
    r.donations,
    r.cards,
    r.war_wins,
    r.found_date,
    EXTRACT(epoch FROM (now() - r.found_date))::integer / 60                AS longevity,
    substrate.format_longevity(
        (EXTRACT(epoch FROM (now() - r.found_date))::integer / 60)
    )                                                                        AS longevity_label,
    r.raw_potential_score,
    r.raw_potential_score                                                    AS rpos,
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05 ELSE 1.0 END
        ) / (SELECT value FROM corpus_benchmark) * 100::numeric
    ))                                                                       AS potential_score,
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05 ELSE 1.0 END
        ) / (SELECT value FROM corpus_benchmark) * 100::numeric
    ))                                                                       AS pos,
    COALESCE(h.is_fresh AND h.max_pes > 10000, false)                       AS has_heritage_blessing,
    CASE
        WHEN r.raw_potential_score >= 12000 THEN 'ELITE'
        WHEN r.raw_potential_score >= 10500 THEN 'HIGH'
        ELSE 'MID'
    END                                                                      AS tier,
    r.last_scan                                                              AS last_seen_at,
    CASE
        WHEN h.player_tag IS NOT NULL AND h.is_fresh THEN 'RETURNING_VETERAN'
        WHEN h.player_tag IS NOT NULL               THEN 'FORMER_MEMBER'
        ELSE 'NEW_CANDIDATE'
    END                                                                      AS heritage_status
FROM drivers.recruits r
LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
WHERE r.status = 'ACTIVE'::drivers.recruit_status
  AND NOT EXISTS (
      SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = r.player_tag
  )
ORDER BY r.raw_potential_score DESC;

GRANT SELECT ON features.headhunter_view TO authenticated, anon, service_role;


-- -------------------------------------------------------------------------
-- 3. features.tactical_awareness_view
--    Source: drivers.members (anon has RLS policy; harden for consistency)
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS features.tactical_awareness_view;

CREATE VIEW features.tactical_awareness_view AS
SELECT
    player_tag,
    player_name,
    trophies,
    week_fame,
    decks_used_today,
    decks_used_weekly,
    last_seen_at,
    substrate.format_last_seen(
        EXTRACT(epoch FROM (now() - last_seen_at)) / 86400.0
    ) AS last_seen_label
FROM drivers.members m;

GRANT SELECT ON features.tactical_awareness_view TO authenticated, anon, service_role;


-- -------------------------------------------------------------------------
-- 4. features.war_activity_view
--    Source: drivers.war_activity (RLS blocks anon)
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS features.war_activity_view;

CREATE VIEW features.war_activity_view AS
SELECT
    player_tag,
    player_name,
    week_id,
    section_index,
    decks_used,
    decks_used_today,
    fame,
    updated_at
FROM drivers.war_activity wa;

GRANT SELECT ON features.war_activity_view TO authenticated, anon, service_role;


-- -------------------------------------------------------------------------
-- 5. substrate.view_pipeline_health
--    Source: substrate.pipeline_heartbeat (RLS blocks anon)
-- -------------------------------------------------------------------------
DROP VIEW IF EXISTS substrate.view_pipeline_health;

CREATE VIEW substrate.view_pipeline_health AS
SELECT
    component_id,
    status,
    last_triggered_at,
    last_success_at,
    last_failure_at,
    last_message,
    is_data_perfect,
    last_validation_report,
    updated_at
FROM substrate.pipeline_heartbeat ph;

GRANT SELECT ON substrate.view_pipeline_health TO anon, service_role;
