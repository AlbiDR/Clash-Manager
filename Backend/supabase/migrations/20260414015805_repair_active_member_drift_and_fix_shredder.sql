-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- ============================================================================
-- PART 1: DATA REPAIR
-- Deactivate all members whose tag is NOT present in the most recent
-- raw payload. This collapses the accumulated drift from multiple syncs.
-- ============================================================================
UPDATE drivers.members
SET is_active = FALSE, updated_at = NOW()
WHERE is_active = TRUE
  AND tag NOT IN (
    SELECT (elem->>'tag')::TEXT
    FROM substrate.raw_clan_members rcm,
         jsonb_array_elements(rcm.payload->'items') AS elem
    WHERE rcm.id = (SELECT MAX(id) FROM substrate.raw_clan_members)
  );

-- ============================================================================
-- PART 2: STRUCTURAL FIX — Replace shred_clan_members trigger function
-- The previous trigger deactivated leavers scoped only by clan_tag, which
-- meant multiple separate ingestion inserts would each only see their own
-- slice and never cleanly deactivate the full prior roster.
--
-- The new strategy: on each insert, deactivate members whose tag is absent
-- from ANY row in raw_clan_members for that clan ingested within the last
-- 2 hours (the current sync window). This tolerates chunked payloads while
-- still retiring stale members once the sync window passes.
-- ============================================================================
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_clan_tag TEXT;
BEGIN
    -- Resolve clan context: prefer explicit column, fallback to primary clan
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT tag FROM drivers.clans LIMIT 1));

    -- A. UPSERT CURRENT STATE for all members in this payload
    INSERT INTO drivers.members (
        tag, name, role, clan_tag, exp_level, trophies, donations, donations_received,
        last_seen, last_seen_at, updated_at, is_active
    )
    SELECT
        (elem->>'tag')::TEXT,
        (elem->>'name')::TEXT,
        (elem->>'role')::TEXT,
        v_clan_tag,
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
        name              = EXCLUDED.name,
        role              = EXCLUDED.role,
        clan_tag          = EXCLUDED.clan_tag,
        exp_level         = EXCLUDED.exp_level,
        trophies          = EXCLUDED.trophies,
        donations         = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        last_seen         = EXCLUDED.last_seen,
        last_seen_at      = EXCLUDED.last_seen_at,
        updated_at        = EXCLUDED.updated_at,
        is_active         = TRUE;

    -- B. LOG HISTORY (daily snapshot, idempotent)
    INSERT INTO drivers.member_snapshots (member_tag, snapshot_date, trophies, donations, snapshot_at)
    SELECT
        (elem->>'tag')::TEXT,
        CURRENT_DATE,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER,
        NOW()
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (member_tag, snapshot_date) DO NOTHING;

    -- C. SCOPED DEACTIVATION — retire members absent from ALL recent payloads
    -- "Recent" = any payload for this clan ingested in the last 2 hours.
    -- This tolerates chunked/multi-insert syncs while still correctly retiring
    -- members who have left after the sync window closes.
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = NOW()
    WHERE clan_tag = v_clan_tag
      AND is_active = TRUE
      AND tag NOT IN (
          SELECT (e->>'tag')::TEXT
          FROM substrate.raw_clan_members rcm,
               jsonb_array_elements(rcm.payload->'items') AS e
          WHERE COALESCE(rcm.clan_tag, (SELECT tag FROM drivers.clans LIMIT 1)) = v_clan_tag
            AND rcm.ingested_at >= (NOW() - INTERVAL '2 hours')
      );

    RETURN NEW;
END;
$function$;
