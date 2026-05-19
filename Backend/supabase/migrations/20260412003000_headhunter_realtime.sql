-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Enforce Supabase Realtime tracking for the Headhunter recruiting layers
-- Converts the database into a reactive WebSocket feed for the Vue frontend

begin;

do $$
begin
  -- Expose Recruits to Realtime
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'drivers' and tablename = 'recruits'
  ) then
    execute 'alter publication supabase_realtime add table drivers.recruits';
  end if;

  -- Expose Blacklist to Realtime (helpful for live dashboard feedback)
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'drivers' and tablename = 'recruit_blacklist'
  ) then
    execute 'alter publication supabase_realtime add table drivers.recruit_blacklist';
  end if;
end;
$$;

commit;
