-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

SET LOCAL lock_timeout = '3s';

-- The PWA subscribes only to recruit_blacklist, clan_voyage and
-- clan_voyage_contributions. clans, members and recruits were published too,
-- so wal2json decoded their churn (tens of thousands of rows a day) for every
-- Realtime poll, the largest single consumer of statement time on the Nano
-- instance measured on 2026-10-06. Each drop is guarded so a cluster whose
-- publication never carried the table applies cleanly.
DO $publication$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['clans', 'members', 'recruits']
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'drivers'
              AND tablename = v_table
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE drivers.%I', v_table);
        END IF;
    END LOOP;
END;
$publication$;

COMMIT;
