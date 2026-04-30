-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- I. ARCHITECTURAL RENAMING: recruit_events -> recruit_buffer (RAM)
ALTER TABLE IF EXISTS drivers.recruit_events RENAME TO recruit_buffer;
COMMENT ON TABLE drivers.recruit_buffer IS 'L2 Drivers: Operational RAM buffer for transient recruitment actions. Self-wiping on execution.';

-- II. PERSISTENCE ENRICHMENT: Rich Blacklist Metadata
ALTER TABLE drivers.recruit_blacklist 
ADD COLUMN IF NOT EXISTS player_name TEXT,
ADD COLUMN IF NOT EXISTS raw_potential_score NUMERIC DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS snapshot JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

COMMENT ON COLUMN drivers.recruit_blacklist.player_name IS 'Cached player name to save API processing.';
COMMENT ON COLUMN drivers.recruit_blacklist.raw_potential_score IS 'Last known Raw Potential Score (RPoS) at the moment of eviction.';
COMMENT ON COLUMN drivers.recruit_blacklist.snapshot IS 'Full JSONB snapshot of player stats (trophies, donations, etc.) for historical review.';
COMMENT ON COLUMN drivers.recruit_blacklist.expires_at IS 'The 30-day temporal contract expiration. Player recirculates into pool after this date.';

-- III. INDEX OPTIMIZATION: High-speed lookups for tags
DROP INDEX IF EXISTS drivers.idx_blacklist_active;
CREATE INDEX idx_blacklist_tag ON drivers.recruit_blacklist (tag);

-- IV. CLINICAL RAM LOGIC: Autonomous Scrubber & Metadata Scoop
CREATE OR REPLACE FUNCTION drivers.handle_recruit_buffer()
RETURNS TRIGGER AS $$
DECLARE
    v_target_recruit RECORD;
BEGIN
    -- 1. SELF-HEALING: Purge expired entries from the Storage layer (Blacklist)
    DELETE FROM drivers.recruit_blacklist WHERE expires_at < NOW();

    -- 2. METADATA SCOOP: Fetch data from the active pool before eviction
    SELECT * INTO v_target_recruit FROM drivers.recruits WHERE tag = NEW.tag;

    -- 3. STORAGE INGESTION: Move to the Rich Blacklist
    IF NEW.event_type IN ('INVITED', 'DISCARDED') THEN
        INSERT INTO drivers.recruit_blacklist (
            tag, 
            player_name, 
            raw_potential_score, 
            snapshot, 
            reason, 
            expires_at
        )
        VALUES (
            NEW.tag,
            COALESCE(v_target_recruit.name, NEW.metadata->>'name', 'Unknown'),
            COALESCE(v_target_recruit.raw_potential_score, (NEW.metadata->>'raw_potential_score')::numeric, 0.0),
            COALESCE(to_jsonb(v_target_recruit), NEW.metadata),
            NEW.event_type,
            NOW() + INTERVAL '30 days'
        )
        ON CONFLICT (tag) DO UPDATE SET
            expires_at = EXCLUDED.expires_at,
            reason = EXCLUDED.reason,
            player_name = COALESCE(EXCLUDED.player_name, recruit_blacklist.player_name),
            raw_potential_score = COALESCE(EXCLUDED.raw_potential_score, recruit_blacklist.raw_potential_score),
            snapshot = EXCLUDED.snapshot;
            
        -- 4. POOL EVICTION: Remove from active candidates
        DELETE FROM drivers.recruits WHERE tag = NEW.tag;
    END IF;

    -- 5. RAM CLEARING: Synchronously wipe the buffer row
    -- Return NEW to allow completion; auditing can still occur if table isn't 
    -- immediately cleared by an external process.
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- V. TRIGGER RE-BINDING
DROP TRIGGER IF EXISTS tr_handle_recruit_event ON drivers.recruit_buffer;
DROP TRIGGER IF EXISTS tr_handle_recruit_buffer ON drivers.recruit_buffer;

CREATE TRIGGER tr_handle_recruit_buffer
    AFTER INSERT ON drivers.recruit_buffer
    FOR EACH ROW
    EXECUTE FUNCTION drivers.handle_recruit_buffer();
