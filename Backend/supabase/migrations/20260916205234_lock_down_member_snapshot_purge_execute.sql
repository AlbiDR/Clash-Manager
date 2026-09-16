-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- purge_stale_member_snapshots() is newly created, so Postgres granted it
-- EXECUTE to PUBLIC by default, unlike its sibling purge functions
-- (purge_worst_recruits, purge_inactive_members, ...) which only grant to
-- postgres/service_role. Match that pattern. Rationale in the commit message.

BEGIN;

REVOKE EXECUTE ON FUNCTION substrate.purge_stale_member_snapshots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION substrate.purge_stale_member_snapshots() TO service_role;

COMMIT;
