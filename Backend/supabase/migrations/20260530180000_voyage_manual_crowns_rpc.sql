-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530180000_voyage_manual_crowns_rpc
 * ---------------------------------------------------
 * Rationale:
 *   The `manual_crowns` column on `drivers.clan_voyage_contributions` has
 *   existed since 20260517060000 but had no exposed write path.
 *   When the Clash Royale API battle log is unavailable or incorrect, an
 *   admin must be able to supply the authoritative crown tally per player
 *   directly. This migration wires that capability end-to-end.
 *
 * Design:
 *   `drivers.set_voyage_manual_crowns` - authoritative single-player write.
 *     - Accepts (player_tag TEXT, crowns INTEGER).
 *     - Targets the current ACTIVE voyage automatically (no voyage_id leak
 *       to the caller - consistent with how refresh_voyage_contributions
 *       also resolves the active voyage internally).
 *     - Inserts a new contribution row OR updates the existing one.
 *     - Sets manual_crowns to the supplied value.
 *     - Sets `crowns` to the same value immediately so the display is
 *       accurate before the next refresh cycle, then triggers
 *       refresh_voyage_contributions() to let automated tallies settle
 *       on top of the override.
 *
 *   `features.set_voyage_manual_crowns` - anon/authenticated proxy.
 *
 * Notes:
 *   - CQS compliance: this is a Command (mutates state, returns status only).
 *   - The refresh call inside the driver ensures the `voyage_crown_pct`
 *     column and the voyage-level `progress_ratio` remain consistent
 *     without a separate client round-trip.
 */

BEGIN;

-- ============================================================
-- 1. DRIVER: set_voyage_manual_crowns
-- ============================================================

CREATE OR REPLACE FUNCTION drivers.set_voyage_manual_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    v_id      BIGINT;
    v_target  INTEGER;
    v_name    TEXT;
BEGIN
    -- Resolve the current ACTIVE voyage.
    SELECT id, target_crowns
    INTO v_id, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'No ACTIVE clan voyage found.'
        );
    END IF;

    IF p_crowns < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'crowns must be non-negative.'
        );
    END IF;

    -- Resolve the player name from the current roster (best-effort).
    SELECT player_name INTO v_name
    FROM drivers.members
    WHERE player_tag = p_player_tag
    LIMIT 1;

    -- Upsert the contribution row, writing manual_crowns and pre-setting
    -- crowns to the manual value so the display is immediately correct.
    INSERT INTO drivers.clan_voyage_contributions
        (voyage_id, player_tag, player_name, manual_crowns, crowns, voyage_crown_pct)
    VALUES (
        v_id,
        p_player_tag,
        v_name,
        p_crowns,
        p_crowns,
        LEAST(ROUND((p_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    )
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        manual_crowns    = EXCLUDED.manual_crowns,
        crowns           = EXCLUDED.crowns,
        voyage_crown_pct = EXCLUDED.voyage_crown_pct,
        updated_at       = now();

    -- Re-run the full refresh so automated + manual figures settle cleanly.
    PERFORM drivers.refresh_voyage_contributions();

    RETURN jsonb_build_object(
        'success',    true,
        'voyage_id',  v_id,
        'player_tag', p_player_tag,
        'crowns',     p_crowns
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 2. FEATURES PROXY: set_voyage_manual_crowns
-- ============================================================

CREATE OR REPLACE FUNCTION features.set_voyage_manual_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.set_voyage_manual_crowns(p_player_tag, p_crowns);
END;
$$;

GRANT EXECUTE ON FUNCTION features.set_voyage_manual_crowns(TEXT, INTEGER)
    TO anon, authenticated;

COMMIT;
