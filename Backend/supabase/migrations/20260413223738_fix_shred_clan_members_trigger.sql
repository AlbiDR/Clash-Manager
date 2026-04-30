-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Repairing shred_clan_members trigger to resolve 'elem' alias collision
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- 1. Snapshot members for historical tracking
    INSERT INTO drivers.member_snapshots (member_tag, name, role, trophies, donations, donations_received, snapshot_date)
    SELECT 
        e->>'tag' as member_tag,
        e->>'name' as name,
        e->>'role' as role,
        (e->>'trophies')::integer as trophies,
        (e->>'donations')::integer as donations,
        (e->>'donationsReceived')::integer as donations_received,
        CURRENT_DATE as snapshot_date
    FROM jsonb_array_elements(NEW.payload->'items') AS e
    ON CONFLICT (member_tag, snapshot_date) DO UPDATE SET
        trophies = EXCLUDED.trophies,
        donations = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received;

    -- 2. Upsert current member state
    INSERT INTO drivers.members (tag, name, role, trophies, is_active)
    SELECT 
        e->>'tag' as tag,
        e->>'name' as name,
        e->>'role' as role,
        (e->>'trophies')::integer as trophies,
        true as is_active
    FROM jsonb_array_elements(NEW.payload->'items') AS e
    ON CONFLICT (tag) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        trophies = EXCLUDED.trophies,
        is_active = true,
        updated_at = NOW();

    -- 3. Mark missing members as inactive
    UPDATE drivers.members
    SET is_active = false, updated_at = NOW()
    WHERE tag NOT IN (
        SELECT e->>'tag' FROM jsonb_array_elements(NEW.payload->'items') AS e
    ) AND is_active = true;

    RETURN NEW;
END;
$function$;
