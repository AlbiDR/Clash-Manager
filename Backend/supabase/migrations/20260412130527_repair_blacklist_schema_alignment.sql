-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Purge the Zombie Table
DROP TABLE IF EXISTS drivers.recruit_blacklist CASCADE;

-- 2. Re-create with Clinical Standard
CREATE TABLE drivers.recruit_blacklist (
    tag TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Re-implement the Sentinel Logic
CREATE OR REPLACE FUNCTION drivers.handle_recruit_event()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.event_type IN ('INVITED', 'DISCARDED') THEN
        INSERT INTO drivers.recruit_blacklist (tag, reason)
        VALUES (NEW.tag, NEW.event_type)
        ON CONFLICT (tag) DO UPDATE SET
            reason = EXCLUDED.reason,
            created_at = NOW();
            
        DELETE FROM drivers.recruits
        WHERE tag = NEW.tag;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Re-attach the trigger
DROP TRIGGER IF EXISTS trg_sentinel_recruit_event ON drivers.recruit_events;
CREATE TRIGGER trg_sentinel_recruit_event
AFTER INSERT ON drivers.recruit_events
FOR EACH ROW
EXECUTE FUNCTION drivers.handle_recruit_event();
