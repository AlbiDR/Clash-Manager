-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration: player_card_snapshot_add_profile_columns
-- Purpose: Adds player profile metadata to the card snapshot table so the
-- Laboratory simulation engine receives the correct King Level on cache hits.
-- Previously, cache hits returned kingLevel=1 because the snapshot table had
-- no knowledge of the player's account level.

ALTER TABLE features.player_card_snapshots
  ADD COLUMN IF NOT EXISTS player_name   TEXT     NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS king_level    SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS xp_into_level INTEGER  NOT NULL DEFAULT 0;

COMMENT ON COLUMN features.player_card_snapshots.player_name IS
    'Player display name at the time of the snapshot fetch.';

COMMENT ON COLUMN features.player_card_snapshots.king_level IS
    'King (account) Level at the time of the snapshot fetch (1-90).';

COMMENT ON COLUMN features.player_card_snapshots.xp_into_level IS
    'XP accumulated within the current King Level at the time of fetch. '
    'Used to seed the simulation starting state precisely.';
