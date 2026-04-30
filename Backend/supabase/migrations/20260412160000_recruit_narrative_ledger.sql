-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- I. Table: drivers.recruit_ledger
-- Permanent institutional memory for the recruitment lifecycle.
CREATE TABLE IF NOT EXISTS drivers.recruit_ledger (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tag TEXT NOT NULL,
    tag_name TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN ('DISCOVERED', 'SCORE_THRESHOLD_HIT', 'ACTION_INVITED', 'ACTION_DISCARDED', 'JOINED_US')),
    old_score NUMERIC DEFAULT 0.0,
    new_score NUMERIC DEFAULT 0.0,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- II. Indices for Institutional Memory
CREATE INDEX IF NOT EXISTS idx_ledger_tag ON drivers.recruit_ledger(tag);
CREATE INDEX IF NOT EXISTS idx_ledger_event ON drivers.recruit_ledger(event_type);

-- III. Function: drivers.log_recruit_event
-- Intelligent logger that implements the 5% RPoS threshold check.
CREATE OR REPLACE FUNCTION drivers.log_recruit_event()
RETURNS TRIGGER AS $$
DECLARE
    v_delta NUMERIC;
BEGIN
    -- 1. DISCOVERY (INSERT)
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO drivers.recruit_ledger (tag, tag_name, event_type, new_score, description)
        VALUES (
            NEW.tag, 
            NEW.name, 
            'DISCOVERED', 
            NEW.raw_potential_score, 
            'Initial discovery via sensory mesh.'
        );
        RETURN NEW;
    END IF;

    -- 2. SCORE UPDATE (UPDATE)
    IF (TG_OP = 'UPDATE') THEN
        -- Only log if RPoS changes and exceeds the 5% Clinical Threshold
        IF (NEW.raw_potential_score <> OLD.raw_potential_score) THEN
            -- Calculate Delta
            v_delta := ABS(NEW.raw_potential_score - OLD.raw_potential_score) / NULLIF(OLD.raw_potential_score, 0);
            
            IF (v_delta >= 0.05 OR (OLD.raw_potential_score = 0 AND NEW.raw_potential_score > 0)) THEN
                INSERT INTO drivers.recruit_ledger (tag, tag_name, event_type, old_score, new_score, description)
                VALUES (
                    NEW.tag, 
                    NEW.name, 
                    'SCORE_THRESHOLD_HIT', 
                    OLD.raw_potential_score, 
                    NEW.raw_potential_score, 
                    'Significant performance shift detected (' || ROUND(v_delta * 100, 1) || '% change).'
                );
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- IV. Triggers for recruits
DROP TRIGGER IF EXISTS tr_log_recruit_insert ON drivers.recruits;
CREATE TRIGGER tr_log_recruit_insert
    AFTER INSERT ON drivers.recruits
    FOR EACH ROW
    EXECUTE FUNCTION drivers.log_recruit_event();

DROP TRIGGER IF EXISTS tr_log_recruit_update ON drivers.recruits;
CREATE TRIGGER tr_log_recruit_update
    AFTER UPDATE ON drivers.recruits
    FOR EACH ROW
    EXECUTE FUNCTION drivers.log_recruit_event();

-- V. Functional Update: handle_recruit_buffer
-- ENHANCED: Now logs persistent narrative events before wiping the RAM buffer.
CREATE OR REPLACE FUNCTION drivers.handle_recruit_buffer()
RETURNS TRIGGER AS $$
DECLARE
    v_target_recruit RECORD;
    v_ledger_event TEXT;
BEGIN
    -- 1. SELF-HEALING: Purge expired entries from the Storage layer (Blacklist)
    DELETE FROM drivers.recruit_blacklist WHERE expires_at < NOW();

    -- 2. METADATA SCOOP: Fetch data from the active pool before eviction
    SELECT * INTO v_target_recruit FROM drivers.recruits WHERE tag = NEW.tag;

    -- 3. STORAGE INGESTION: Move into Persistence layer (Rich Blacklist)
    IF NEW.event_type IN ('INVITED', 'DISCARDED') THEN
        -- Map buffer type to Ledger type for Clinical Parity
        v_ledger_event := CASE 
            WHEN NEW.event_type = 'INVITED' THEN 'ACTION_INVITED'
            WHEN NEW.event_type = 'DISCARDED' THEN 'ACTION_DISCARDED'
        END;

        -- 3a. NARRATIVE LOG: Record action in the persistent Ledger
        INSERT INTO drivers.recruit_ledger (tag, tag_name, event_type, new_score, description)
        VALUES (
            NEW.tag,
            COALESCE(v_target_recruit.name, NEW.metadata->>'name', 'Unknown'),
            v_ledger_event,
            COALESCE(v_target_recruit.raw_potential_score, (NEW.metadata->>'raw_potential_score')::numeric, 0.0),
            'Manual user action processed via RAM buffer.'
        );

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
    DELETE FROM drivers.recruit_buffer WHERE id = NEW.id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- VI. Functional Update: shred_clan_members
-- ENHANCED: Captures 'JOINED_US' events for recruits in the ledger.
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS TRIGGER AS $$
BEGIN
    -- A. UPSERT CURRENT STATE (drivers.members)
    INSERT INTO drivers.members (
        tag, name, role, exp_level, trophies, donations, donations_received, 
        last_seen, last_seen_at, updated_at, is_active
    )
    SELECT 
        (elem->>'tag')::TEXT,
        (elem->>'name')::TEXT,
        (elem->>'role')::TEXT,
        (elem->>'expLevel')::INTEGER,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER,
        (elem->>'donationsReceived')::INTEGER,
        (elem->>'lastSeen')::TIMESTAMPTZ,
        (elem->>'lastSeen')::TIMESTAMPTZ,
        NOW(),
        TRUE
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (tag) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies,
        donations = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        last_seen = EXCLUDED.last_seen,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = EXCLUDED.updated_at,
        is_active = TRUE;

    -- B. LOG HISTORY (drivers.member_snapshots)
    INSERT INTO drivers.member_snapshots (tag, snapshot_date, trophies, donations)
    SELECT 
        (elem->>'tag')::TEXT,
        CURRENT_DATE,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (tag, snapshot_date) DO NOTHING;

    -- C. NARRATIVE LOG: JOINED_US (High-Value Event)
    INSERT INTO drivers.recruit_ledger (tag, tag_name, event_type, new_score, description)
    SELECT 
        r.tag,
        r.name,
        'JOINED_US',
        r.raw_potential_score,
        'Recruit successfully joined the clan.'
    FROM drivers.recruits r
    WHERE r.tag IN (
        SELECT (elem->>'tag')::TEXT 
        FROM jsonb_array_elements(NEW.payload->'items')
    );

    -- D. SELF-HEALING: EVICT FROM RECRUITS (Member Detection)
    DELETE FROM drivers.recruits
    WHERE tag IN (
        SELECT (elem->>'tag')::TEXT 
        FROM jsonb_array_elements(NEW.payload->'items')
    );

    -- E. MAINTENANCE: Mark leavers (not in this payload) as inactive
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = NOW()
    WHERE tag NOT IN (
        SELECT (elem->>'tag')::TEXT 
        FROM jsonb_array_elements(NEW.payload->'items')
    )
    AND is_active = TRUE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
