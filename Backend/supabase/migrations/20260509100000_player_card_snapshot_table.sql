-- Migration: player_card_snapshot_table
-- Purpose: Persistent store for player card progression fetched from the Clash Royale API.
-- This table drives the Laboratory simulation engine with real card level/count data.

-- ============================================================
-- TABLE: features.player_card_snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS features.player_card_snapshots (
    -- Identity
    player_tag      TEXT        NOT NULL,
    card_id         BIGINT      NOT NULL,

    -- Card metadata (static, from API)
    card_name       TEXT        NOT NULL,
    rarity          TEXT        NOT NULL CHECK (rarity IN ('Common', 'Rare', 'Epic', 'Legendary', 'Champion')),
    is_tower_troop  BOOLEAN     NOT NULL DEFAULT false,

    -- Card progression (player-specific, from API)
    -- absolute_level is normalized from the API's rarity-relative level using:
    --   absolute_level = 16 - (api_max_level - api_level)
    -- This ensures all rarities share the same 1-16 absolute scale.
    absolute_level  SMALLINT    NOT NULL CHECK (absolute_level BETWEEN 1 AND 16),
    api_level       SMALLINT    NOT NULL, -- raw level as returned by the API (rarity-relative)
    api_max_level   SMALLINT    NOT NULL, -- raw maxLevel as returned by the API
    count           INTEGER     NOT NULL DEFAULT 0 CHECK (count >= 0),

    -- Audit
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (player_tag, card_id)
);

COMMENT ON TABLE features.player_card_snapshots IS
    'Per-player card snapshot fetched from the Clash Royale API. '
    'Populated by the sync-player-cards Edge Function. '
    'Drives the Laboratory simulation engine.';

COMMENT ON COLUMN features.player_card_snapshots.absolute_level IS
    'Level on the unified 1-16 scale used by the simulation engine. '
    'Computed via: 16 - (api_max_level - api_level).';

COMMENT ON COLUMN features.player_card_snapshots.api_level IS
    'Raw level returned by the Clash Royale API (rarity-relative, 1 to api_max_level).';

COMMENT ON COLUMN features.player_card_snapshots.api_max_level IS
    'Raw maxLevel returned by the API: Common=16, Rare=14, Epic=11, Legendary=8, Champion=6.';

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_player_card_snapshots_tag
    ON features.player_card_snapshots (player_tag);

CREATE INDEX IF NOT EXISTS idx_player_card_snapshots_fetched_at
    ON features.player_card_snapshots (fetched_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE features.player_card_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read: card snapshots are derived from public Clash Royale API data.
CREATE POLICY "Public Read Access"
    ON features.player_card_snapshots
    AS PERMISSIVE FOR SELECT
    TO public
    USING (true);

-- Service role write: only the Edge Function (running as service role) may write.
CREATE POLICY "Service Role Write Access"
    ON features.player_card_snapshots
    AS PERMISSIVE FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
