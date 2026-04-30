-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Structural Integrity: Add clan_tag to member tracking
ALTER TABLE drivers.members ADD COLUMN IF NOT EXISTS clan_tag TEXT;
ALTER TABLE substrate.raw_clan_members ADD COLUMN IF NOT EXISTS clan_tag TEXT;

-- 2. Heuristic Restoration: Assign existing members to the primary clan
UPDATE drivers.members 
SET clan_tag = (SELECT tag FROM drivers.clans LIMIT 1)
WHERE clan_tag IS NULL;

-- 3. Update features.roster_view to support clan-scoping
DROP VIEW IF EXISTS features.roster_view;
CREATE OR REPLACE VIEW features.roster_view AS
 SELECT m.tag,
    m.name,
    m.role,
    m.clan_tag,
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
        CASE
            WHEN (((s.days_inactive * (24)::numeric) * (60)::numeric) < (60)::numeric) THEN 'Now'::text
            WHEN ((s.days_inactive * (24)::numeric) < (1)::numeric) THEN ((((s.days_inactive * (24)::numeric) * (60)::numeric))::integer || 'm'::text)
            WHEN (s.days_inactive < (1)::numeric) THEN (((s.days_inactive * (24)::numeric))::integer || 'h'::text)
            ELSE ((s.days_inactive)::integer || 'd'::text)
        END AS tenure_label
   FROM (drivers.members m
     LEFT JOIN features.scoring_view s ON ((m.tag = s.tag)))
  WHERE (m.is_active = true)
  ORDER BY s.raw_performance_score DESC, s.performance_score DESC;

-- 4. Clinical Shredder: Scoped member synchronization
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_clan_tag TEXT;
BEGIN
    -- Extract Clan Tag context
    -- 1. Try column on raw table
    -- 2. Try payload (if available)
    -- 3. Fallback to primary clan to maintain legacy parity
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT tag FROM drivers.clans LIMIT 1));

    -- A. UPSERT CURRENT STATE
    INSERT INTO drivers.members (
        tag, name, role, clan_tag, exp_level, trophies, donations, donations_received, 
        last_seen, last_seen_at, updated_at, is_active
    )
    SELECT 
        (elem->>'tag')::TEXT,
        (elem->>'name')::TEXT,
        (elem->>'role')::TEXT,
        v_clan_tag,
        (elem->>'expLevel')::INTEGER,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER,
        (elem->>'donationsReceived')::INTEGER,
        (elem->>'lastSeen')::TIMESTAMPTZ,
        (elem->>'lastSeen')::TIMESTAMPTZ,
        NOW(),
        TRUE
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (tag) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        clan_tag = EXCLUDED.clan_tag,
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies,
        donations = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        last_seen = EXCLUDED.last_seen,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = EXCLUDED.updated_at,
        is_active = TRUE;

    -- B. LOG HISTORY (drivers.member_snapshots)
    INSERT INTO drivers.member_snapshots (member_tag, snapshot_date, trophies, donations, snapshot_at)
    SELECT 
        (elem->>'tag')::TEXT,
        CURRENT_DATE,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER,
        NOW()
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (member_tag, snapshot_date) DO NOTHING;

    -- C. SCOPED MAINTENANCE: Handle leavers without nuking other clans
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = NOW()
    WHERE clan_tag = v_clan_tag                             -- Limit scope to the current clan
    AND tag NOT IN (                                        -- Mark only those missing from THIS payload
        SELECT (e->>'tag')::TEXT 
        FROM jsonb_array_elements(NEW.payload->'items') AS e
    )
    AND is_active = TRUE;

    RETURN NEW;
END;
$function$;
