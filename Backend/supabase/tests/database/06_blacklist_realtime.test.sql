-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

SELECT ok(EXISTS (
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'drivers'
    AND tablename = 'recruit_blacklist'
), 'the blacklist is published for PWA Realtime subscriptions');

SELECT ok(
  has_schema_privilege('anon', 'drivers', 'USAGE')
    AND has_table_privilege('anon', 'drivers.recruit_blacklist', 'SELECT'),
  'anonymous blacklist subscribers can read the published table'
);

SELECT ok((SELECT relrowsecurity FROM pg_class
  WHERE oid = 'drivers.recruit_blacklist'::regclass),
  'Realtime access retains blacklist row-level security'
);

SELECT is((SELECT relreplident::text FROM pg_class
  WHERE oid = 'drivers.recruit_blacklist'::regclass), 'f',
  'blacklist deletes retain replica identity for player-tag events'
);

SELECT * FROM finish();
ROLLBACK;
