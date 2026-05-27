-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Voyage Pending State Support
 * 
 * Rationale:
 *   - Allows Clan Voyages to be scheduled in advance with a PENDING status and a start_at in the future.
 *   - PENDING voyages do not have an end_at set initially (end_at is nullable).
 *   - Adds schedule_voyage, activate_scheduled_voyage, and cancel_voyage RPCs.
 *   - Updates features.voyage_summary view to include PENDING and ACTIVE voyages.
 */

BEGIN;

-- 1. Make end_at nullable in drivers.clan_voyage
ALTER TABLE drivers.clan_voyage ALTER COLUMN end_at DROP NOT NULL;

-- 2. Create drivers.schedule_voyage RPC
CREATE OR REPLACE FUNCTION drivers.schedule_voyage(
    target_crowns INTEGER,
    start_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_id BIGINT;
    v_clan_tag TEXT;
    v_active_or_pending_count INTEGER;
BEGIN
    -- Pre-flight guard: check if an ACTIVE or PENDING voyage already exists
    SELECT COUNT(*) INTO v_active_or_pending_count
    FROM drivers.clan_voyage
    WHERE status IN ('ACTIVE', 'PENDING');

    IF v_active_or_pending_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'An active or scheduled Clan Voyage is already in progress.');
    END IF;

    -- Fetch the authoritative clan tag
    SELECT clan_tag INTO v_clan_tag FROM drivers.clans LIMIT 1;

    IF v_clan_tag IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No clan found in drivers.clans');
    END IF;

    -- Insert new scheduled voyage (status = 'PENDING', end_at = NULL)
    INSERT INTO drivers.clan_voyage (clan_tag, target_crowns, start_at, end_at, status)
    VALUES (v_clan_tag, target_crowns, start_at, NULL, 'PENDING')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'voyage_id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create drivers.activate_scheduled_voyage RPC
CREATE OR REPLACE FUNCTION drivers.activate_scheduled_voyage(
    voyage_id BIGINT,
    target_crowns INTEGER,
    end_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status
    FROM drivers.clan_voyage
    WHERE id = voyage_id;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voyage not found.');
    END IF;

    IF v_current_status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only scheduled PENDING voyages can be activated.');
    END IF;

    -- Update target_crowns, end_at, and transition status to ACTIVE
    UPDATE drivers.clan_voyage
    SET target_crowns = activate_scheduled_voyage.target_crowns,
        end_at = activate_scheduled_voyage.end_at,
        status = 'ACTIVE',
        updated_at = now()
    WHERE id = voyage_id;

    -- Force refresh of voyage contributions for the newly active window
    PERFORM drivers.refresh_voyage_contributions();

    RETURN jsonb_build_object('success', true, 'voyage_id', voyage_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create drivers.cancel_voyage RPC
CREATE OR REPLACE FUNCTION drivers.cancel_voyage(
    voyage_id BIGINT
)
RETURNS JSONB AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status
    FROM drivers.clan_voyage
    WHERE id = voyage_id;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voyage not found.');
    END IF;

    IF v_current_status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only PENDING voyages can be cancelled.');
    END IF;

    DELETE FROM drivers.clan_voyage
    WHERE id = voyage_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recreate features.voyage_summary view to include PENDING or ACTIVE voyages
CREATE OR REPLACE VIEW features.voyage_summary AS
WITH current_voyage AS (
    SELECT * 
    FROM drivers.clan_voyage 
    WHERE status IN ('PENDING', 'ACTIVE') 
    ORDER BY CASE WHEN status = 'ACTIVE' THEN 1 ELSE 2 END ASC, created_at DESC 
    LIMIT 1
), total_stats AS (
    SELECT 
        v.id AS voyage_id,
        COALESCE(SUM(c.crowns), 0) AS total_crowns
    FROM current_voyage v
    LEFT JOIN drivers.clan_voyage_contributions c ON c.voyage_id = v.id
    GROUP BY v.id
)
SELECT 
    (SELECT jsonb_build_object(
        'id', v.id,
        'status', v.status,
        'target_crowns', v.target_crowns,
        'start_at', v.start_at,
        'end_at', v.end_at,
        'is_victory', (ts.total_crowns >= v.target_crowns)
    ) FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id) AS event,
    COALESCE((SELECT ts.total_crowns FROM total_stats ts), 0) AS total_crowns,
    COALESCE((SELECT (ts.total_crowns::numeric / NULLIF(v.target_crowns, 0)::numeric) FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id), 0) AS progress_ratio;

-- 6. Recreate features proxy functions and grant execution rights
CREATE OR REPLACE FUNCTION features.schedule_voyage(
    target_crowns INTEGER,
    start_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.schedule_voyage(target_crowns, start_at);
END;
$$;

CREATE OR REPLACE FUNCTION features.activate_scheduled_voyage(
    voyage_id BIGINT,
    target_crowns INTEGER,
    end_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.activate_scheduled_voyage(voyage_id, target_crowns, end_at);
END;
$$;

CREATE OR REPLACE FUNCTION features.cancel_voyage(
    voyage_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.cancel_voyage(voyage_id);
END;
$$;

GRANT EXECUTE ON FUNCTION features.schedule_voyage(INTEGER, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION features.activate_scheduled_voyage(BIGINT, INTEGER, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION features.cancel_voyage(BIGINT) TO anon, authenticated;

COMMIT;
