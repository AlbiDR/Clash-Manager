-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Exclusion membership depends only on player_tag. Scheduling, telemetry and
-- reason updates must not acquire an unrelated exclusion-cache write lock.
-- The live cache was checked against the source union before deployment; this
-- trigger is incremental maintenance, not a repair mechanism for cache drift.
CREATE OR REPLACE FUNCTION drivers.sync_exclusion_cache()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.player_tag IS NOT DISTINCT FROM OLD.player_tag THEN
            RETURN NULL;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        INSERT INTO drivers.exclusion_cache (player_tag)
        VALUES (NEW.player_tag)
        ON CONFLICT (player_tag) DO NOTHING;
    END IF;

    -- A genuine tag replacement removes the old membership just like DELETE.
    -- Either source may still own the tag, so inspect their complete union.
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        IF NOT EXISTS (SELECT 1 FROM drivers.members WHERE player_tag = OLD.player_tag)
           AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist WHERE player_tag = OLD.player_tag) THEN
            DELETE FROM drivers.exclusion_cache WHERE player_tag = OLD.player_tag;
        END IF;
    END IF;
    RETURN NULL;
END;
$function$;
