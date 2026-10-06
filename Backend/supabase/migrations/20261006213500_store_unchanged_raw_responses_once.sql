-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

-- Store a raw war log or clan profile response only when it differs from the
-- newest one stored for that clan. An identical response is already held in
-- full, so storing and shredding it again only rewrote timestamps (the war log
-- alone was 38% of WAL on 2026-10-06). raw_clan_members and raw_river_race stay
-- ungated: a roster unchanged across midnight would skip that day's snapshot.
-- Retention keeps the newest row per clan of the two gated tables: it is the
-- comparison baseline and shred_river_race's seasonId fallback. Rationale in
-- the commit message.

CREATE OR REPLACE FUNCTION public.ingest_raw_war_log(p_clan_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT stored.payload
            FROM substrate.raw_war_log AS stored
            WHERE stored.clan_tag IS NOT DISTINCT FROM p_clan_tag
            ORDER BY stored.id DESC
            LIMIT 1
        ) AS newest
        WHERE newest.payload = p_payload
    ) THEN
        RETURN;
    END IF;

    INSERT INTO substrate.raw_war_log (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$function$;

COMMENT ON FUNCTION public.ingest_raw_war_log(text, jsonb) IS
    'Stores a /riverracelog response, firing trg_shredder_war_log, only when it '
    'differs from the newest response stored for the same clan. An identical '
    'response is a no-op. See 20261006213500_store_unchanged_raw_responses_once.sql.';

CREATE OR REPLACE FUNCTION public.ingest_raw_clan_profile(p_clan_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT stored.payload
            FROM substrate.raw_clan_profile AS stored
            WHERE stored.clan_tag IS NOT DISTINCT FROM p_clan_tag
            ORDER BY stored.id DESC
            LIMIT 1
        ) AS newest
        WHERE newest.payload = p_payload
    ) THEN
        RETURN;
    END IF;

    INSERT INTO substrate.raw_clan_profile (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$function$;

COMMENT ON FUNCTION public.ingest_raw_clan_profile(text, jsonb) IS
    'Stores a clan profile response, firing trg_shredder_profile, only when it '
    'differs from the newest response stored for the same clan. An identical '
    'response is a no-op. See 20261006213500_store_unchanged_raw_responses_once.sql.';

CREATE OR REPLACE FUNCTION substrate.purge_raw_logs(p_retention_hours integer DEFAULT 24)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    -- Gated tables: a row past retention goes only once a newer row for the
    -- same clan supersedes it, so the newest stays as the comparison baseline.
    DELETE FROM substrate.raw_clan_profile AS expired
    WHERE expired.ingested_at < (now() - (p_retention_hours || ' hours')::interval)
      AND EXISTS (
          SELECT 1 FROM substrate.raw_clan_profile AS newer
          WHERE newer.clan_tag IS NOT DISTINCT FROM expired.clan_tag
            AND newer.id > expired.id
      );
    DELETE FROM substrate.raw_clan_members WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_river_race   WHERE ingested_at < (now() - (p_retention_hours || ' hours')::interval);
    DELETE FROM substrate.raw_war_log AS expired
    WHERE expired.ingested_at < (now() - (p_retention_hours || ' hours')::interval)
      AND EXISTS (
          SELECT 1 FROM substrate.raw_war_log AS newer
          WHERE newer.clan_tag IS NOT DISTINCT FROM expired.clan_tag
            AND newer.id > expired.id
      );

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('SYSTEM_PURGE', 'SUCCESS',
            'Raw logs older than ' || p_retention_hours || ' hours successfully evicted.');
END; $function$;

COMMIT;
