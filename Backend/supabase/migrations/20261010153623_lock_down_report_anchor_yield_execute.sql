-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
SET LOCAL lock_timeout = '3s';

-- Preserve the private implementation boundary on a clean replay. PostgreSQL
-- grants EXECUTE to PUBLIC on new functions unless that default is revoked.
REVOKE ALL ON FUNCTION substrate.report_anchor_yield(text, integer, boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION substrate.report_anchor_yield(text, integer, boolean)
    TO service_role;

-- Rollback must retain this private-function revocation. Reverting the bridge
-- does not require restoring PUBLIC execution on the implementation.

COMMIT;
