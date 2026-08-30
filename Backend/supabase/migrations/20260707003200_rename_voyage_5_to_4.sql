-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


ALTER TABLE drivers.clan_voyage ALTER COLUMN id DROP IDENTITY;

UPDATE drivers.clan_voyage SET id = 4 WHERE id = 5;

ALTER TABLE drivers.clan_voyage ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;

SELECT setval(pg_get_serial_sequence('drivers.clan_voyage', 'id'), COALESCE(MAX(id), 1)) FROM drivers.clan_voyage;

