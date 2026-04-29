-- Fix shredding logic to match actual Royale API JSON structure and substrate wrapping

CREATE OR REPLACE FUNCTION substrate.shred_clan_profile()
RETURNS TRIGGER AS $$
DECLARE
    v_raw jsonb := NEW.payload;
BEGIN
    INSERT INTO drivers.clans (
        tag, 
        name, 
        description, 
        badge_id, 
        member_count, 
        last_ingested_at
    )
    VALUES (
        v_raw->>'tag',                 -- Top-level tag in JSON
        v_raw->>'name',                -- Top-level name in JSON 
        v_raw->>'description',
        (v_raw->>'badgeId')::INTEGER,
        (v_raw->>'members')::INTEGER, -- Value is an integer in API
        COALESCE(NEW.ingested_at, NOW())
    )
    ON CONFLICT (tag) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        badge_id = EXCLUDED.badge_id,
        member_count = EXCLUDED.member_count,
        last_ingested_at = EXCLUDED.last_ingested_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS TRIGGER AS $$
DECLARE
    v_member RECORD;
BEGIN
    -- Royale API members endpoint returns an object with a 'items' array.
    -- We extract members from that array and upsert into drivers.members.
    FOR v_member IN 
        SELECT * FROM jsonb_to_recordset(NEW.payload->'items') AS x(
            tag TEXT, 
            name TEXT, 
            role TEXT, 
            expLevel INTEGER, 
            trophies INTEGER, 
            clanRank INTEGER
        )
    LOOP
        -- 1. Upsert Member Roster
        INSERT INTO drivers.members (tag, name, role, exp_level, trophies, clan_rank, last_ingested_at)
        VALUES (v_member.tag, v_member.name, v_member.role, v_member.expLevel, v_member.trophies, v_member.clanRank, NOW())
        ON CONFLICT (tag) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            exp_level = EXCLUDED.exp_level,
            trophies = EXCLUDED.trophies,
            clan_rank = EXCLUDED.clan_rank,
            last_ingested_at = EXCLUDED.last_ingested_at;

        -- 2. Log Snapshot Data
        INSERT INTO drivers.member_snapshots (member_tag, trophies, role, recorded_at)
        VALUES (v_member.tag, v_member.trophies, v_member.role, NOW());
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
