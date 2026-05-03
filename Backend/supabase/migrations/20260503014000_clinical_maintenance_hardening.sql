-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MAINTENANCE: Harden recruitment pipeline and purge corrupted data
--
-- Objective:
-- Eliminate "ghost" recruits and entries with corrupted metrics (score 0) 
-- that have failed to profile for more than 12 hours.
-- =============================================================================

BEGIN;

-- 1. Update purge_worst_recruits to prioritize corrupted data
CREATE OR REPLACE FUNCTION substrate.purge_worst_recruits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- First, aggressively purge corrupted entries (score 0) older than 12h
    DELETE FROM drivers.recruits
    WHERE raw_potential_score = 0
      AND found_date < NOW() - INTERVAL '12 hours';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Second, enforce the 500-recruit cap by score, excluding protected statuses
    WITH to_delete AS (
        SELECT player_tag 
        FROM drivers.recruits
        WHERE status NOT IN ('INVITED', 'ACTIVE') -- Protect high-value leads
        ORDER BY raw_potential_score ASC NULLS FIRST
        OFFSET 500 -- Keep top 500
    )
    DELETE FROM drivers.recruits
    WHERE player_tag IN (SELECT player_tag FROM to_delete);
    
    DECLARE
        v_cap_count INTEGER;
    BEGIN
        GET DIAGNOSTICS v_cap_count = ROW_COUNT;
        v_count := v_count + v_cap_count;
    END;
    
    -- Cleanup orphaned ledger entries
    DELETE FROM drivers.recruit_ledger
    WHERE player_tag NOT IN (SELECT player_tag FROM drivers.recruits)
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Purged ' || v_count || ' recruits (corrupted or low-score) to maintain pipeline health.');
    END IF;

    RETURN v_count;
END;
$function$;

-- 2. Immediate manual purge to resolve the user's current visibility issues
-- Delete recruits with 0 score that are from before the scanner fix (anything older than 1 hour)
DELETE FROM drivers.recruits
WHERE raw_potential_score = 0;

COMMIT;
