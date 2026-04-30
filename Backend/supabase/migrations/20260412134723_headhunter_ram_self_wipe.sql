-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- IV. CLINICAL RAM LOGIC: finalize the Self-Wiping behavior
CREATE OR REPLACE FUNCTION drivers.handle_recruit_buffer()
RETURNS TRIGGER AS $$
DECLARE
    v_target_recruit RECORD;
BEGIN
    -- 1. SELF-HEALING: Purge expired entries from the Storage layer (Blacklist)
    DELETE FROM drivers.recruit_blacklist WHERE expires_at < NOW();

    -- 2. METADATA SCOOP: Fetch data from the active pool before eviction
    SELECT * INTO v_target_recruit FROM drivers.recruits WHERE tag = NEW.tag;

    -- 3. STORAGE INGESTION: Move into Persistence layer (Rich Blacklist)
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

    -- 5. RAM CLEARING: Synchronously wipe the instruction from the buffer
    -- This ensures the table acts like RAM (volatile substrate)
    DELETE FROM drivers.recruit_buffer WHERE id = NEW.id;
    
    RETURN NULL; -- Null because the row is deleted and we don't want to propagate it
END;
$$ LANGUAGE plpgsql;
