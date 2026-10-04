-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

-- The PWA subscribes to blacklist INSERT/DELETE events, but this table was
-- missing from supabase_realtime. REST view grants do not enable replication.
-- Keep RLS enabled and grant only the read access needed by subscribers.
GRANT USAGE ON SCHEMA drivers TO anon, authenticated;
GRANT SELECT ON drivers.recruit_blacklist TO anon, authenticated;
ALTER TABLE drivers.recruit_blacklist REPLICA IDENTITY FULL;

DO $publication$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'drivers'
      AND tablename = 'recruit_blacklist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE drivers.recruit_blacklist;
  END IF;
END;
$publication$;

COMMIT;
