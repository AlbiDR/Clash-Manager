-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Enforcement of daily clinical snapshot uniqueness
ALTER TABLE drivers.member_snapshots 
ADD CONSTRAINT unique_member_daily_snapshot UNIQUE (member_tag, snapshot_date);
