-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
HEADHUNTER: BLACKLIST CONTROLLER
----------------------------------------------------------------------------
Procedural logic for candidate dismissal and lifecycle management.
============================================================================
*/

-- -------------------------------------------------------------------------
-- I. THE BANISHER (ATOMIC DISMISSAL)
-- -------------------------------------------------------------------------
-- Moves a recruit from the active pool to the blacklist.
CREATE OR REPLACE FUNCTION drivers.dismiss_recruit(
    p_tag TEXT,
    p_days_to_ban INTEGER DEFAULT 30
)
RETURNS VOID AS $$
DECLARE
    v_recruit RECORD;
BEGIN
    -- 1. Grab metadata from active pool before deletion
    SELECT * INTO v_recruit FROM drivers.recruits WHERE tag = p_tag;

    -- 2. Upsert into blacklist
    INSERT INTO drivers.recruit_blacklist (tag, raw_score, expiry_date)
    VALUES (
        p_tag, 
        COALESCE(v_recruit.raw_score, 0.0), 
        NOW() + (p_days_to_ban || ' days')::INTERVAL
    )
    ON CONFLICT (tag) DO UPDATE SET
        expiry_date = NOW() + (p_days_to_ban || ' days')::INTERVAL,
        banned_at = NOW();

    -- 3. Delete from active pools
    DELETE FROM drivers.recruits WHERE tag = p_tag;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- II. MAINTENANCE (THE PURGE)
-- -------------------------------------------------------------------------
-- Deletes entries that have passed their expiry date.
CREATE OR REPLACE FUNCTION drivers.purge_expired_blacklist()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM drivers.recruit_blacklist
    WHERE expiry_date < NOW();
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- III. SCHEMA BROADCAST (L3 VIEW UPDATES)
-- -------------------------------------------------------------------------
-- Update the shredder to handle blacklist updates during ingestion
-- (Already handled by the trigger in the foundation migration, 
-- but we ensure permissions are robust here).
GRANT EXECUTE ON FUNCTION drivers.dismiss_recruit(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION drivers.purge_expired_blacklist() TO authenticated;
