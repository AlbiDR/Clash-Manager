-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Migration: Fix Phantom Dismissal RPCs
-- Moves dismiss_recruits and undismiss_recruits from public to features schema
-- to align with SupabaseClient.ts configuration, and cleans up any legacy 
-- recruit_buffer references or phantom triggers causing "Sync Failed" relation errors.

BEGIN;

-- 1. Create the RPCs in the correct schema (features)
CREATE OR REPLACE FUNCTION features.dismiss_recruits(items JSONB)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Upsert into blacklist
    INSERT INTO drivers.recruit_blacklist (player_tag, player_name, raw_potential_score, reason, expires_at)
    SELECT 
        (val->>'id')::TEXT, 
        (val->>'name')::TEXT, 
        (val->>'raw_potential_score')::NUMERIC, 
        'DISMISSED',
        NOW() + INTERVAL '30 days'
    FROM jsonb_array_elements(items) AS val
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + INTERVAL '30 days',
        created_at = NOW();

    -- Delete from active recruits
    WITH deleted AS (
        DELETE FROM drivers.recruits
        WHERE player_tag IN (SELECT (val->>'id')::TEXT FROM jsonb_array_elements(items) AS val)
        RETURNING *
    )
    SELECT count(*) INTO v_count FROM deleted;

    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'Recruits dismissed successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION features.undismiss_recruits(player_tags TEXT[])
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    WITH deleted AS (
        DELETE FROM drivers.recruit_blacklist
        WHERE player_tag = ANY(player_tags)
        RETURNING *
    )
    SELECT count(*) INTO v_count FROM deleted;

    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'Recruits restored successfully.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Ensure grants are correct for features schema
GRANT EXECUTE ON FUNCTION features.dismiss_recruits(JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION features.undismiss_recruits(TEXT[]) TO authenticated, anon;

-- 3. Drop from public to prevent ambiguity and phantom calls
DROP FUNCTION IF EXISTS public.dismiss_recruits(JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.undismiss_recruits(TEXT[]) CASCADE;

-- 4. Clean up any phantom triggers that might still reference handle_recruit_buffer
DROP TRIGGER IF EXISTS tr_log_recruit_insert ON drivers.recruits;
DROP TRIGGER IF EXISTS tr_log_recruit_update ON drivers.recruits;
DROP TRIGGER IF EXISTS tr_handle_recruit_buffer ON drivers.recruits;
DROP TRIGGER IF EXISTS trg_sentinel_recruit_event ON drivers.recruits;
DROP TRIGGER IF EXISTS trg_sentinel_buffer ON drivers.recruits;

-- Restore legitimate logging triggers
CREATE TRIGGER tr_log_recruit_insert
    AFTER INSERT ON drivers.recruits
    FOR EACH ROW
    EXECUTE FUNCTION drivers.log_recruit_event();

CREATE TRIGGER tr_log_recruit_update
    AFTER UPDATE ON drivers.recruits
    FOR EACH ROW
    EXECUTE FUNCTION drivers.log_recruit_event();

-- 5. Force drop the buffer components to ensure they are gone
DROP TABLE IF EXISTS drivers.recruit_buffer CASCADE;
DROP FUNCTION IF EXISTS drivers.handle_recruit_buffer() CASCADE;

COMMIT;
