-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260529220000_voyage_auto_activation
 * -------------------------------------------------
 * Rationale:
 *   Replaces the manual "Awaiting Promotion" step with a fully autonomous
 *   two-phase model:
 *
 *   Phase 1 (automatic): A pg_cron job fires every minute and promotes any
 *     PENDING voyage whose start_at has passed to ACTIVE. No human action
 *     required. The "starts in" timer is now truly a set-and-forget trigger.
 *
 *   Phase 2 (deferred manual): Once the event is ACTIVE and the official
 *     in-game duration is publicly announced, an admin calls set_voyage_end
 *     to record end_at on the live row. Tracking is already running by then.
 *
 * Changes:
 *   1. drivers.auto_activate_pending_voyages() -- called by pg_cron.
 *   2. pg_cron job: voyage-auto-activate-cron (every minute).
 *   3. drivers.set_voyage_end() + features.set_voyage_end() proxy.
 */

BEGIN;

-- ============================================================
-- 1. DRIVER FUNCTION: auto_activate_pending_voyages
-- ============================================================

CREATE OR REPLACE FUNCTION drivers.auto_activate_pending_voyages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE drivers.clan_voyage
    SET
        status     = 'ACTIVE',
        updated_at = now()
    WHERE status   = 'PENDING'
      AND start_at <= now();

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    -- Refresh contribution window only when at least one row was promoted.
    IF v_affected > 0 THEN
        PERFORM drivers.refresh_voyage_contributions();
    END IF;
END;
$$;

-- ============================================================
-- 2. REGISTER pg_cron JOB: voyage-auto-activate-cron
-- ============================================================

-- Idempotent guard: unschedule first if the job already exists
-- (mirrors the pattern used throughout the existing migration history).
DO $$
BEGIN
    PERFORM cron.unschedule('voyage-auto-activate-cron');
EXCEPTION WHEN OTHERS THEN
    -- Job did not exist; safe to continue.
    NULL;
END;
$$;

SELECT cron.schedule(
    'voyage-auto-activate-cron',
    '* * * * *',
    $$ SELECT drivers.auto_activate_pending_voyages(); $$
);

-- ============================================================
-- 3. DRIVER FUNCTION: set_voyage_end
-- ============================================================

CREATE OR REPLACE FUNCTION drivers.set_voyage_end(
    voyage_id BIGINT,
    end_at    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status
    FROM drivers.clan_voyage
    WHERE id = voyage_id;

    IF v_current_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voyage not found.');
    END IF;

    IF v_current_status <> 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'End time can only be set on an ACTIVE voyage.');
    END IF;

    UPDATE drivers.clan_voyage
    SET
        end_at     = set_voyage_end.end_at,
        updated_at = now()
    WHERE id = voyage_id;

    RETURN jsonb_build_object('success', true, 'voyage_id', voyage_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 4. FEATURES PROXY: set_voyage_end
-- ============================================================

CREATE OR REPLACE FUNCTION features.set_voyage_end(
    voyage_id BIGINT,
    end_at    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.set_voyage_end(voyage_id, end_at);
END;
$$;

GRANT EXECUTE ON FUNCTION features.set_voyage_end(BIGINT, TIMESTAMPTZ) TO anon, authenticated;

COMMIT;
