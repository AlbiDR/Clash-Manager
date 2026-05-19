-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Allow initialize_voyage to gracefully UPDATE the active voyage's target crowns
CREATE OR REPLACE FUNCTION drivers.initialize_voyage(target_crowns integer, start_at timestamp with time zone, end_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_id BIGINT;
    v_clan_tag TEXT;
BEGIN
    SELECT id INTO v_id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1;

    IF v_id IS NOT NULL THEN
        -- If an event is already active, only update the target crowns to avoid breaking the time window pipeline
        UPDATE drivers.clan_voyage 
        SET target_crowns = initialize_voyage.target_crowns
        WHERE id = v_id;
        
        -- Force a refresh so the percentages recalculate immediately against the new target
        PERFORM drivers.refresh_voyage_contributions();

        RETURN jsonb_build_object('success', true, 'voyage_id', v_id, 'message', 'Voyage target updated');
    END IF;

    -- Fetch the authoritative clan tag
    SELECT clan_tag INTO v_clan_tag FROM drivers.clans LIMIT 1;

    IF v_clan_tag IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No clan found in drivers.clans');
    END IF;

    -- Insert new voyage
    INSERT INTO drivers.clan_voyage (clan_tag, target_crowns, start_at, end_at, status)
    VALUES (v_clan_tag, target_crowns, start_at, end_at, 'ACTIVE')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'voyage_id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
