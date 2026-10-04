-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

-- These routines are implementation details used by an owner-executed view,
-- a database trigger, and the voyage cron gate. None is a browser RPC.
-- Remove PostgreSQL's default PUBLIC execute grant so the exposed anon and
-- authenticated roles cannot invoke SECURITY DEFINER internals directly.
REVOKE EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[])
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION drivers.on_voyage_active_change()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION drivers.sync_voyage_finalization_job()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION drivers.on_voyage_active_change()
  TO service_role;
GRANT EXECUTE ON FUNCTION drivers.sync_voyage_finalization_job()
  TO service_role;

COMMIT;
