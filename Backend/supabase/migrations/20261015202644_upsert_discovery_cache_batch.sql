-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.upsert_discovery_cache_batch(
    p_tags text[],
    p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_max_tags CONSTANT integer := 50;
BEGIN
    IF p_tags IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'p_tags must not be null';
    END IF;

    IF cardinality(p_tags) > v_max_tags THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'p_tags exceeds the maximum batch size';
    END IF;

    INSERT INTO substrate.discovery_cache (player_tag, type, scanned_at)
    SELECT tags.tag, p_type, now()
    FROM (SELECT DISTINCT input.tag FROM unnest(p_tags) AS input(tag)) AS tags
    ORDER BY tags.tag COLLATE "C"
    ON CONFLICT (player_tag) DO UPDATE SET
        scanned_at = EXCLUDED.scanned_at,
        type = EXCLUDED.type;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_discovery_cache_batch(text[], text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_discovery_cache_batch(text[], text)
    TO service_role;

COMMENT ON FUNCTION public.upsert_discovery_cache_batch(text[], text) IS
    'Service-role-only bounded batch upsert for tournament discovery cache entries.';

COMMIT;
