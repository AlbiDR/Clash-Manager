-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [CLINICAL SECURITY HARDENING]
-- Enforces Principle of Least Privilege (PoLP) across all schemas.
-- Resolves RLS deficits and cleans up the Realtime publication.

begin;

-- [STAIR 1] - Enable RLS on all unprotected tables
alter table drivers.heritage_ledger enable row level security;
alter table drivers.member_snapshots enable row level security;
alter table drivers.recruit_blacklist enable row level security;
alter table drivers.recruit_buffer enable row level security;
alter table drivers.recruit_ledger enable row level security;
alter table drivers.recruits enable row level security;
alter table substrate.config enable row level security;
alter table substrate.discovery_cache enable row level security;
alter table substrate.governance_telemetry enable row level security;
alter table substrate.raw_river_race enable row level security;
alter table substrate.raw_scout_logs enable row level security;
alter table substrate.raw_war_log enable row level security;

-- [STAIR 2] - Schema USAGE Hardening
-- Isolate the Kernel layer (substrate) from anonymous probes.
revoke usage on schema substrate from anon;
grant usage on schema substrate to authenticated, service_role;

-- Ensure Feature layer (drivers) is accessible but controlled.
grant usage on schema drivers to anon, authenticated, service_role;

-- [STAIR 3] - Policy Tiering: DRIVERS Layer
-- Public Read Access: clans and members only.
drop policy if exists "Public Read Access" on drivers.clans;
create policy "Public Read Access" 
    on drivers.clans for select 
    using (true);

drop policy if exists "Public Read Access" on drivers.members;
create policy "Public Read Access" 
    on drivers.members for select 
    using (true);

-- Authenticated Read Access: All other driver tables.
drop policy if exists "Authenticated Read Access" on drivers.recruits;
create policy "Authenticated Read Access" 
    on drivers.recruits for select 
    using (auth.role() = 'authenticated');

drop policy if exists "Authenticated Read Access" on drivers.recruit_blacklist;
create policy "Authenticated Read Access" 
    on drivers.recruit_blacklist for select 
    using (auth.role() = 'authenticated');

drop policy if exists "Authenticated Read Access" on drivers.war_history;
create policy "Authenticated Read Access" 
    on drivers.war_history for select 
    using (auth.role() = 'authenticated');

-- Service Role Management: ALL access to everything (implicit + explicit)
drop policy if exists "Service Role Full Access" on drivers.recruits;
create policy "Service Role Full Access" 
    on drivers.recruits for all 
    to service_role 
    using (true) 
    with check (true);

-- [STAIR 4] - Policy Tiering: SUBSTRATE Layer
-- Strictly internal. No anon access.
drop policy if exists "Authenticated Read Access" on substrate.governance_telemetry;
create policy "Authenticated Read Access" 
    on substrate.governance_telemetry for select 
    using (auth.role() = 'authenticated');

drop policy if exists "Service Role Full Access" on substrate.config;
create policy "Service Role Full Access" 
    on substrate.config for all 
    to service_role 
    using (true) 
    with check (true);

-- [STAIR 5] - Realtime Sanitization
-- Pruning noise from the stream.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'substrate' AND tablename = 'raw_clan_profile'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE substrate.raw_clan_profile';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'substrate' AND tablename = 'raw_clan_members'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE substrate.raw_clan_members';
    END IF;
END $$;

commit;
