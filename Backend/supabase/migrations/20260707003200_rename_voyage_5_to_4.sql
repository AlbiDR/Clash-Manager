-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260707003200_rename_voyage_5_to_4.sql
--
-- Updates the auto-incremented Clan Voyage ID 5 to 4 (filling the gap from
-- a previous cancellation) and cascading it to all contributions.
-- =============================================================================

UPDATE drivers.clan_voyage
SET id = 4
WHERE id = 5;
