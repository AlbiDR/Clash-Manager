-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Creates missing RPCs for frontend zero-latency dismissal

BEGIN;

CREATE OR REPLACE FUNCTION public.dismiss_recruits(items JSONB)
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

CREATE OR REPLACE FUNCTION public.undismiss_recruits(player_tags TEXT[])
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

GRANT EXECUTE ON FUNCTION public.dismiss_recruits(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undismiss_recruits(TEXT[]) TO authenticated, service_role;

COMMIT;
