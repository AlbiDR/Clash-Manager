-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
DROP VESTIGIAL MAINTENANCE FUNCTIONS
----------------------------------------------------------------------------
Drops the vestigial `maintenance_janitor` functions.
As noted in the migration audits, `substrate.execute_nightly_maintenance` 
is now the authoritative maintenance entry point.
============================================================================
*/

DROP FUNCTION IF EXISTS public.maintenance_janitor();
DROP FUNCTION IF EXISTS system.maintenance_janitor();
