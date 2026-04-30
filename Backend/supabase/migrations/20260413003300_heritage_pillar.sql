-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Pillar VIII: Institutional History (Heritage)
-- Establishes a 30-day adaptive archive for departed members.

CREATE TABLE IF NOT EXISTS drivers.heritage_ledger (
    tag TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tenure_days INTEGER DEFAULT 0,
    avg_fame INTEGER DEFAULT 0,
    max_pes INTEGER DEFAULT 0,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE drivers.heritage_ledger IS 'Clinical archive for departed members. 30-day retention horizon.';

-- Trigger Function: Upsert Heritage on Departure
CREATE OR REPLACE FUNCTION substrate.handle_heritage_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Only snapshot if the member is actually leaving or being purged from active roster
    IF (TG_OP = 'DELETE') OR (NEW.status = 'LEFT' AND OLD.status != 'LEFT') THEN
        INSERT INTO drivers.heritage_ledger (
            tag,
            name,
            tenure_days,
            avg_fame,
            max_pes,
            last_seen_at
        )
        VALUES (
            COALESCE(OLD.tag, NEW.tag),
            COALESCE(OLD.name, NEW.name),
            EXTRACT(DAY FROM (NOW() - COALESCE(OLD.created_at, NOW())))::INTEGER,
            COALESCE(OLD.war_fame_avg, 0), -- Assuming these columns exist in drivers.members or related view logic
            COALESCE(OLD.pes, 0),
            NOW()
        )
        ON CONFLICT (tag) DO UPDATE
        SET 
            name = EXCLUDED.name,
            tenure_days = EXCLUDED.tenure_days,
            avg_fame = EXCLUDED.avg_fame,
            max_pes = EXCLUDED.max_pes,
            last_seen_at = NOW();
    END IF;
    
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Monitor Roster Departures
DROP TRIGGER IF EXISTS tr_heritage_snapshot ON drivers.members;
CREATE TRIGGER tr_heritage_snapshot
    AFTER UPDATE OR DELETE ON drivers.members
    FOR EACH ROW
    EXECUTE FUNCTION substrate.handle_heritage_snapshot();

-- Maintenance: 30-Day Purge Logic
CREATE OR REPLACE FUNCTION substrate.purge_stale_heritage()
RETURNS VOID AS $$
BEGIN
    DELETE FROM drivers.heritage_ledger
    WHERE last_seen_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION substrate.purge_stale_heritage() IS 'Nightly clinical cleanup of the heritage ledger (30-day horizon).';
