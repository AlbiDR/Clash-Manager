-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260707003200_rename_voyage_5_to_4.sql
--
-- Updates the auto-incremented Clan Voyage ID 5 to 4 (filling the gap from
-- a previous cancellation) and cascading it to all contributions.
-- Uses DROP/ADD IDENTITY to update the GENERATED ALWAYS AS IDENTITY column.
-- =============================================================================

-- 1. Temporarily drop identity generator
ALTER TABLE drivers.clan_voyage ALTER COLUMN id DROP IDENTITY;

-- 2. Update the ID from 5 to 4 (cascades to drivers.clan_voyage_contributions)
UPDATE drivers.clan_voyage SET id = 4 WHERE id = 5;

-- 3. Re-add identity generator
ALTER TABLE drivers.clan_voyage ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;

-- 4. Sync the sequence generator to the maximum ID
SELECT setval(pg_get_serial_sequence('drivers.clan_voyage', 'id'), COALESCE(MAX(id), 1)) FROM drivers.clan_voyage;

