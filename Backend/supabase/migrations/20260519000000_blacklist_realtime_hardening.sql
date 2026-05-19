-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Hardens drivers.recruit_blacklist for Realtime subscription compatibility.
--
-- Two targeted changes:
--
-- 1. REPLICA IDENTITY FULL: Required for DELETE events to carry the old row data.
--    Without this, Supabase Realtime DELETE events arrive with an empty `old` record,
--    making it impossible to identify the player_tag of the undismissed recruit.
--
-- 2. Anon SELECT policy: The PWA connects with the publishable (anon) key.
--    The previous "Authenticated Read Access" policy (auth.role() = 'authenticated')
--    was silently blocking all blacklist reads from the frontend, causing
--    fetchRemote to always return an empty blacklist array. This migration
--    widens read access to include the anon role without granting write access.

BEGIN;

-- Required for DELETE event payload to include old row data via Realtime.
ALTER TABLE drivers.recruit_blacklist REPLICA IDENTITY FULL;

-- Replace the authenticated-only read policy with one that also permits anon access.
-- The publishable key connects as anon; write operations remain gated by separate policies.
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.recruit_blacklist;

CREATE POLICY "Anon and Authenticated Read Access" ON drivers.recruit_blacklist
    FOR SELECT
    USING (auth.role() IN ('anon', 'authenticated'));

COMMIT;
