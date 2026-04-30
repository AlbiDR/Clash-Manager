-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 3. Create the Sentinel Trigger Function
CREATE OR REPLACE FUNCTION drivers.handle_recruit_event()
RETURNS TRIGGER AS $$
BEGIN
    -- If the event is a final state (Invited or Discarded)
    IF NEW.event_type IN ('INVITED', 'DISCARDED') THEN
        -- 1. Add to the Shield (Blacklist)
        INSERT INTO drivers.recruit_blacklist (tag, reason)
        VALUES (NEW.tag, NEW.event_type)
        ON CONFLICT (tag) DO UPDATE SET
            reason = EXCLUDED.reason,
            created_at = NOW();
            
        -- 2. Immediate Eviction from the active pool
        DELETE FROM drivers.recruits
        WHERE tag = NEW.tag;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach the Sentinel Trigger to the ledger
DROP TRIGGER IF EXISTS trg_sentinel_recruit_event ON drivers.recruit_events;
CREATE TRIGGER trg_sentinel_recruit_event
AFTER INSERT ON drivers.recruit_events
FOR EACH ROW
EXECUTE FUNCTION drivers.handle_recruit_event();
