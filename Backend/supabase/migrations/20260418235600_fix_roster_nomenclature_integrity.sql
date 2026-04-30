-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MIGRATION: Fix Roster Nomenclature Integrity
-- =============================================================================
-- Changes:
--   1. substrate.format_tenure    — New helper for longevity labels.
--   2. substrate.format_last_seen — New helper for inactivity labels.
--   3. features.roster_view       — Accurate labeling of Tenure vs Last Seen.
--                                   Restores clan_tag for scoped filtering.
-- =============================================================================

-- 1. Create a formatting helper for clinical tenure (Longevity)
CREATE OR REPLACE FUNCTION substrate.format_tenure(p_days numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    IF p_days IS NULL THEN RETURN 'N/A'; END IF;
    
    IF p_days < 1 THEN
        RETURN '< 1d';
    ELSIF p_days < 30 THEN
        RETURN floor(p_days) || 'd';
    ELSIF p_days < 365 THEN
        RETURN floor(p_days / 30.44) || 'mo';
    ELSE
        RETURN floor(p_days / 365.25) || 'y';
    END IF;
END;
$function$;

-- 2. Create a formatting helper for last seen (Inactivity)
CREATE OR REPLACE FUNCTION substrate.format_last_seen(p_days numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_minutes float;
BEGIN
    IF p_days IS NULL THEN RETURN 'Never'; END IF;
    
    v_minutes := p_days * 1440;
    
    IF v_minutes < 1 THEN
        RETURN 'Now';
    ELSIF v_minutes < 60 THEN
        RETURN round(v_minutes) || 'm';
    ELSIF p_days < 1 THEN
        RETURN round(p_days * 24) || 'h';
    ELSE
        RETURN floor(p_days) || 'd';
    END IF;
END;
$function$;

-- 3. Update features.roster_view with accurate labels and restored scoping
DROP VIEW IF EXISTS features.roster_view;

CREATE OR REPLACE VIEW features.roster_view AS
 SELECT m.tag,
    m.name,
    m.role,
    m.clan_tag, -- Restored for feature parity with clan-scoping
    'https://link.clashroyale.com/en?player=' || LTRIM(m.tag, '#') AS ingame_link,
    'https://royaleapi.com/player/' || LTRIM(m.tag, '#') AS royaleapi_link,
    m.exp_level,
    m.trophies,
    m.donations,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.raw_performance_score,
    s.performance_score,
    s.stability_index,
    m.last_seen_at,
    -- Last Seen Label: Explicit inactivity tracking
    substrate.format_last_seen(s.days_inactive) AS last_seen_label,
    -- Tenure Label: Explicit longevity tracking (Duration since joined_at)
    substrate.format_tenure(s.tenure_days) AS tenure_label
   FROM drivers.members m
     LEFT JOIN features.scoring_view s ON m.tag = s.tag
  WHERE m.is_active = true AND m.tag ~ '^#[0289CGJLPQRUVY]+$'::text
  ORDER BY s.raw_performance_score DESC, s.performance_score DESC;

-- Grant access (Ensuring consistency with existing RLS/Grants if applicable)
GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;
