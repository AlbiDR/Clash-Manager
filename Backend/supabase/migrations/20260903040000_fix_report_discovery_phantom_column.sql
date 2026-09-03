-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


CREATE OR REPLACE FUNCTION public.report_discovery(p_player_tag text, p_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    -- substrate.discovery_cache has scanned_at, never discovered_at.
    INSERT INTO substrate.discovery_cache (player_tag, type, scanned_at)
    VALUES (p_player_tag, p_type, NOW())
    ON CONFLICT (player_tag) DO NOTHING;
END;
$function$;
