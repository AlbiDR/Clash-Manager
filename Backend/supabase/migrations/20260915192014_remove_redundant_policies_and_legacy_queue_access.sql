-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- The broader public policies already grant the same unconditional SELECT
-- access to authenticated users, so these two narrower policies add no access.
DROP POLICY IF EXISTS "Voyage Read Access" ON drivers.clan_voyage;
DROP POLICY IF EXISTS "Voyage Contribution Read Access" ON drivers.clan_voyage_contributions;

-- This legacy wrapper has no application or database caller. The PWA calls its
-- two underlying feature RPCs directly, so it is not an anonymous API surface.
REVOKE ALL ON FUNCTION features.process_queue(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION features.process_queue(jsonb) TO service_role;
