-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Operational maintenance, not a schema migration: keep the primary key and
-- all battle rows, replacing only its physical storage. Run as a standalone
-- command, outside a transaction, after confirming no long transactions.
-- See Backend/README.md for the before/after checks.
REINDEX INDEX CONCURRENTLY drivers.player_battles_pkey;
