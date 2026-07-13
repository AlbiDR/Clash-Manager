-- Fix: headhunter Tournament Discovery (S2) cache fetch crashed every run with
--   "invalid input syntax for type integer: 0.08333333333333333"
-- The edge function passes CACHE_HOURS = 5/60 (a 5-minute window) but
-- public.get_discovery_cache(p_hours integer) rejects the fractional value.
-- Widen the parameter to numeric so sub-hour windows are valid. The old integer
-- overload is dropped first to avoid an ambiguous-function error in PostgREST.

DROP FUNCTION IF EXISTS public.get_discovery_cache(integer);

CREATE OR REPLACE FUNCTION public.get_discovery_cache(p_hours numeric)
 RETURNS TABLE(player_tag text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT c.player_tag
    FROM substrate.discovery_cache c
    WHERE c.scanned_at >= (NOW() - (p_hours || ' hours')::INTERVAL);
END;
$function$;
