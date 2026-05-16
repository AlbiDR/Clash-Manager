-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Add pre-flight guard to initialize_voyage function
 *
 * Rationale:
 *   Prevent creating or activating a new voyage when an ACTIVE voyage is already underway.
 *   This prevents accidental duplicate active voyages or spamming the activation process.
 */

-- 1. Redefine drivers.initialize_voyage
CREATE OR REPLACE FUNCTION drivers.initialize_voyage(
    target_crowns INTEGER,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_id BIGINT;
    v_clan_tag TEXT;
    v_active_count INTEGER;
BEGIN
    -- Pre-flight guard: check if an ACTIVE voyage already exists
    SELECT COUNT(*) INTO v_active_count
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE';

    IF v_active_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'An active Clan Voyage is already in progress.');
    END IF;

    -- Fetch the authoritative clan tag
    SELECT clan_tag INTO v_clan_tag FROM drivers.clans LIMIT 1;

    IF v_clan_tag IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No clan found in drivers.clans');
    END IF;

    -- Insert new voyage with the fetched clan_tag
    INSERT INTO drivers.clan_voyage (clan_tag, target_crowns, start_at, end_at, status)
    VALUES (v_clan_tag, target_crowns, start_at, end_at, 'ACTIVE')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'voyage_id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
