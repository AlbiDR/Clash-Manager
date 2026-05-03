-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Consolidation Pass: Drop legacy unused tables
-- 1. drivers.recruit_buffer: Replaced by explicit RPC bridge (dismiss_recruits)
-- 2. substrate.raw_scout_logs: Replaced by explicit RPC bridge (sync_recruits)

BEGIN;

DROP TABLE IF EXISTS drivers.recruit_buffer CASCADE;
DROP TABLE IF EXISTS substrate.raw_scout_logs CASCADE;
DROP FUNCTION IF EXISTS drivers.handle_recruit_buffer() CASCADE;
DROP FUNCTION IF EXISTS substrate.shred_scout_logs() CASCADE;

COMMIT;
