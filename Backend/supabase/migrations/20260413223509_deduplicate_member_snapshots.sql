-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Deduplicate member_snapshots to allow unique constraint enforcement
DELETE FROM drivers.member_snapshots a
USING drivers.member_snapshots b
WHERE a.id < b.id
  AND a.member_tag = b.member_tag
  AND a.snapshot_date = b.snapshot_date;
