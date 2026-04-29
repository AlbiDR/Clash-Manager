-- Make the shredding trigger defensive to prevent null constraint violations 
-- if the API returns an error response.

CREATE OR REPLACE FUNCTION substrate.shred_clan_profile()
RETURNS TRIGGER AS $$
DECLARE
    v_raw jsonb := NEW.payload;
BEGIN
    -- Only attempt insert if the 'tag' field exists in the payload.
    -- If it doesn't, we probably got an error response from the Royale API.
    IF v_raw ? 'tag' THEN
        INSERT INTO drivers.clans (
            tag, name, description, badge_id, member_count, last_ingested_at
        )
        VALUES (
            v_raw->>'tag',                 
            v_raw->>'name',                
            v_raw->>'description',
            (v_raw->>'badgeId')::INTEGER,
            (v_raw->>'members')::INTEGER,
            COALESCE(NEW.ingested_at, NOW())
        )
        ON CONFLICT (tag) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            badge_id = EXCLUDED.badge_id,
            member_count = EXCLUDED.member_count,
            last_ingested_at = EXCLUDED.last_ingested_at;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS TRIGGER AS $$
DECLARE
    v_member RECORD;
BEGIN
    -- Only proceed if we have an 'items' array
    IF NEW.payload ? 'items' AND jsonb_typeof(NEW.payload->'items') = 'array' THEN
        FOR v_member IN 
            SELECT * FROM jsonb_to_recordset(NEW.payload->'items') AS x(
                tag TEXT, name TEXT, role TEXT, expLevel INTEGER, trophies INTEGER, clanRank INTEGER
            )
        LOOP
            INSERT INTO drivers.members (tag, name, role, exp_level, trophies, clan_rank, last_ingested_at)
            VALUES (v_member.tag, v_member.name, v_member.role, v_member.expLevel, v_member.trophies, v_member.clanRank, NOW())
            ON CONFLICT (tag) DO UPDATE SET
                name = EXCLUDED.name,
                role = EXCLUDED.role,
                exp_level = EXCLUDED.exp_level,
                trophies = EXCLUDED.trophies,
                clan_rank = EXCLUDED.clan_rank,
                last_ingested_at = EXCLUDED.last_ingested_at;

            INSERT INTO drivers.member_snapshots (member_tag, trophies, role, recorded_at)
            VALUES (v_member.tag, v_member.trophies, v_member.role, NOW());
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
