-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- 1. NOMENCLATURE ALIGNMENT: Rename active_decks to decks_used_today in members
ALTER TABLE drivers.members RENAME COLUMN active_decks TO decks_used_today;

-- 2. ADD WEEKLY COLUMNS to members
ALTER TABLE drivers.members ADD COLUMN IF NOT EXISTS decks_used_weekly INTEGER DEFAULT 0;
ALTER TABLE drivers.members ADD COLUMN IF NOT EXISTS week_fame INTEGER DEFAULT 0;

-- 3. HARDEN WAR ACTIVITY: Ensure unique week keys per member
ALTER TABLE drivers.war_activity ADD CONSTRAINT war_activity_member_tag_week_id_key UNIQUE (member_tag, week_id);

-- 4. ROBUSTIC SHREDDER: Create participant extraction logic
CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS TRIGGER AS $$
DECLARE
    current_season_id TEXT;
    target_week_id TEXT;
BEGIN
    -- 1. Season Discovery Logic: Fetch from the latest verified war log
    SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
    FROM substrate.raw_war_log
    ORDER BY ingested_at DESC LIMIT 1;

    -- 2. Compose ID or Fallback (Robust Option 1)
    IF current_season_id IS NOT NULL THEN
        target_week_id := current_season_id || '-' || (NEW.payload->'sectionIndex');
    ELSE
        target_week_id := to_char(now(), 'YYYY-"W"WW');
    END IF;

    -- 3. Perform Upsert for each participant
    INSERT INTO drivers.war_activity (
        member_tag, name, week_id, section_index,
        decks_used, decks_used_today, fame
    )
    SELECT 
        p->>'tag', p->>'name', target_week_id, (NEW.payload->>'sectionIndex')::INT,
        (p->>'decksUsed')::INT, (p->>'decksUsedToday')::INT, (p->>'fame')::INT
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (member_tag, week_id) DO UPDATE SET
        decks_used = EXCLUDED.decks_used,
        decks_used_today = EXCLUDED.decks_used_today,
        fame = EXCLUDED.fame,
        updated_at = now();

    -- 4. REAL-TIME SYNC: Update the active members table
    UPDATE drivers.members m
    SET 
        decks_used_today = p.p_decks_used_today,
        decks_used_weekly = p.p_decks_used,
        week_fame = p.p_fame,
        last_ingested_at = now()
    FROM (
        SELECT 
            p->>'tag' as p_tag,
            (p->>'fame')::INT as p_fame,
            (p->>'decksUsed')::INT as p_decks_used,
            (p->>'decksUsedToday')::INT as p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.tag = p.p_tag;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. BIND THE TRIGGER
DROP TRIGGER IF EXISTS trigger_shred_river_race ON substrate.raw_river_race;
CREATE TRIGGER trigger_shred_river_race
AFTER INSERT ON substrate.raw_river_race
FOR EACH ROW EXECUTE FUNCTION substrate.shred_river_race();

-- 6. VIEW UPDATES (Optimized)
DROP VIEW IF EXISTS features.roster_view;
CREATE VIEW features.roster_view AS
SELECT 
    m.tag,
    m.name,
    m.role,
    m.exp_level,
    m.trophies,
    m.donations,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.raw_performance_score,
    s.performance_score,
    m.last_seen_at,
    CASE
        WHEN (s.days_inactive * 24 * 60) < 60 THEN 'Now'
        WHEN (s.days_inactive * 24) < 1 THEN (s.days_inactive * 24 * 60)::INT || 'm'
        WHEN s.days_inactive < 1 THEN (s.days_inactive * 24)::INT || 'h'
        ELSE s.days_inactive::INT || 'd'
    END AS tenure_label,
    round(s.heritage_bonus) AS visibility_boost
FROM drivers.members m
LEFT JOIN features.scoring_view s ON m.tag = s.tag
WHERE m.is_active = true
ORDER BY s.raw_performance_score DESC, s.performance_score DESC;

CREATE OR REPLACE VIEW features.scoring_view AS
WITH base_stats AS (
    SELECT 
        m.tag,
        m.name,
        m.trophies,
        m.donations,
        m.joined_at,
        m.last_seen_at,
        m.war_wins,
        GREATEST(0, EXTRACT(epoch FROM (now() - m.last_seen_at)) / 86400.0) AS days_inactive,
        GREATEST(0, EXTRACT(epoch FROM (now() - m.joined_at)) / 86400.0) AS tenure_days,
        COALESCE(m.week_fame, 0) AS current_fame,
        COALESCE((SELECT avg(fame) FROM drivers.war_activity WHERE member_tag = m.tag), 0) AS avg_fame,
        COALESCE((SELECT avg(decks_used) / 4.0 * 100.0 FROM drivers.war_activity WHERE member_tag = m.tag), 0) AS war_rate
    FROM drivers.members m
    WHERE m.is_active = true
), raw_calculations AS (
    SELECT 
        *,
        round(current_fame * 3.0 + avg_fame * 15.0 + donations * 100.0 + trophies * 0.1 + war_rate * 150.0) AS raw_performance_score,
        trophies * 1.0 + donations * 0.1 + (war_wins + 500) * 20.0 AS raw_potential_score,
        power(1.0 - 0.08, GREATEST(0, days_inactive - 4.0)) AS decay_multiplier
    FROM base_stats
), clinical_layer AS (
    SELECT 
        *,
        CASE 
            WHEN tenure_days < 14 THEN raw_potential_score * power((14 - tenure_days) / 14.0, 2) / 5.0
            ELSE 0 
        END AS heritage_bonus,
        raw_performance_score * decay_multiplier AS decayed_score
    FROM raw_calculations
)
SELECT 
    *,
    CASE 
        WHEN max(decayed_score + heritage_bonus) OVER () > 0 
        THEN round((decayed_score + heritage_bonus) / max(decayed_score + heritage_bonus) OVER () * 100.0)
        ELSE 0 
    END AS performance_score
FROM clinical_layer;

COMMENT ON TRIGGER trigger_shred_river_race ON substrate.raw_river_race IS 'Shreds participant metrics and syncs them to drivers.members.';
