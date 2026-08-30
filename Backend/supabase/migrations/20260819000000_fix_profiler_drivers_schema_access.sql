-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


CREATE OR REPLACE FUNCTION public.get_recent_scans(p_tags text[], p_since timestamptz)
 RETURNS TABLE(player_tag text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT r.player_tag
    FROM drivers.recruits r
    WHERE r.player_tag = ANY(p_tags)
      AND r.last_scan > p_since;
END;
$function$;

COMMENT ON FUNCTION public.get_recent_scans(text[], timestamptz) IS
  'Public-schema wrapper reached by the headhunter-scanner profiler stage,
   which cannot see drivers.recruits directly over the Data API. Returns the
   subset of p_tags scanned more recently than p_since, so the profiler can
   skip re-fetching them from the Royale API within its 30-minute window.';
