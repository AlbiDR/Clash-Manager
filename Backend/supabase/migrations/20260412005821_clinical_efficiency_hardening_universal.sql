
-- =============================================================================
-- MIGRATION: clinical_efficiency_hardening_universal
-- Performance Hardening across the Substrate -> Drivers pipeline.
-- Addresses:
--   1. Refactor shred_river_race: procedural FOR loop -> set-based single INSERT.
--   2. Register trg_shred_river_race on substrate.raw_river_race.
--   3. Implement shred_war_log: set-based historical ingestion.
--   4. Register trg_shred_war_log on substrate.raw_war_log.
-- =============================================================================

-- 1. REFACTOR: shred_river_race (O(1) Set-Based)
CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS trigger AS $$
BEGIN
    INSERT INTO drivers.war_activity (member_tag, week_id, fame, decks_used)
    SELECT 
        p.tag, 
        NEW.payload->>'sectionIndex', 
        p.fame, 
        p.decksUsed
    FROM jsonb_to_recordset(NEW.payload->'clan'->'participants') AS p(
        tag TEXT, name TEXT, fame INTEGER, decksUsed INTEGER
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. REGISTER: trg_shred_river_race
DROP TRIGGER IF EXISTS trg_shred_river_race ON substrate.raw_river_race;
CREATE TRIGGER trg_shred_river_race
    AFTER INSERT ON substrate.raw_river_race
    FOR EACH ROW EXECUTE FUNCTION substrate.shred_river_race();

-- 3. IMPLEMENT: shred_war_log (O(1) Set-Based)
-- Processes the historical war log snapshots into the infinite drivers.war_history ledger.
CREATE OR REPLACE FUNCTION substrate.shred_war_log()
RETURNS trigger AS $$
BEGIN
    -- Unnest historical standing entries
    INSERT INTO drivers.war_history (tag, week_id, fame, rank)
    SELECT 
        c.tag,
        item->>'seasonId' || '-' || (item->>'sectionIndex'),
        c.fame,
        (item->>'rank')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') AS item
    CROSS JOIN LATERAL jsonb_to_recordset(item->'standings'->'clan') AS c(tag TEXT, fame INTEGER)
    ON CONFLICT (tag, week_id) DO UPDATE SET
        fame = EXCLUDED.fame,
        rank = EXCLUDED.rank;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. REGISTER: trg_shred_war_log
DROP TRIGGER IF EXISTS trg_shred_war_log ON substrate.raw_war_log;
CREATE TRIGGER trg_shred_war_log
    AFTER INSERT ON substrate.raw_war_log
    FOR EACH ROW EXECUTE FUNCTION substrate.shred_war_log();

-- 5. FINAL MAINT: Ensure all triggers are enabled
ALTER TABLE substrate.raw_river_race ENABLE TRIGGER trg_shred_river_race;
ALTER TABLE substrate.raw_war_log ENABLE TRIGGER trg_shred_war_log;
