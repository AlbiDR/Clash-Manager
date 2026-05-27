-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
FIX: PLAYER_CARD_SNAPSHOTS SERVICE ROLE ACCESS
----------------------------------------------------------------------------
The features.player_card_snapshots table was missing explicit grants for
the service_role. Edge Functions execute as service_role and were hitting
"permission denied" on both cache reads (SELECT) and cache writes (UPSERT),
forcing a live Royale API call on every Laboratory sync request.

This migration restores full access for the service_role.
============================================================================
*/

GRANT ALL ON features.player_card_snapshots TO service_role;
