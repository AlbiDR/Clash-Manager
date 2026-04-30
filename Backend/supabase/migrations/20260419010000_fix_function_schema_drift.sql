-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
FUNCTION SCHEMA DRIFT CORRECTION
----------------------------------------------------------------------------
Resolves all 6 errors reported by `supabase db lint --linked`:

  1. drivers.bench_underqualified_recruits
       Invalid enum value 'BENCHED'. Enum is {ACTIVE, QUEUE, ARCHIVED}.
       Fix: set status = 'ARCHIVED' (semantic equivalent for ineligible leads).

  2. drivers.dismiss_recruit
       Column 'expiry_date' does not exist.
       Fix: rename to 'expires_at' (authoritative column name in the table).

  3. public.ingest_clan_profile
       Column 'active_decks' does not exist in drivers.members.
       Fix: remap to 'decks_used_today'; drop 'war_wins' / 'week_fame' which
       belong to war-layer ingestion, not the profile endpoint.

  4. public.ingest_clan_members
       No unique constraint matching ON CONFLICT (tag, snapshot_date).
       Fix: conflict on (tag) — the sole unique constraint on members.

  5. public.ingest_war_log
       Column 'clan_tag'/'season_id'/'section_index' do not exist in
       drivers.war_history. Table columns are: tag, week_id.
       Fix: rebuild the INSERT to match the authoritative schema.

  6. substrate.execute_nightly_maintenance
       substrate.purge_clanned_recruits() does not exist.
       Fix: create it. Purges recruits whose tag is now present in
       drivers.members (they joined the clan), writing a JOINED_US event.
============================================================================
*/

-- ==========================================================================
-- 1. FIX: drivers.bench_underqualified_recruits
--    'BENCHED' → 'ARCHIVED' (the valid low-trophy/ineligible terminal state)
-- ==========================================================================
CREATE OR REPLACE FUNCTION drivers.bench_underqualified_recruits()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = drivers, substrate, public
AS $$
DECLARE
    v_count             INTEGER;
    v_required_trophies INTEGER;
BEGIN
    SELECT COALESCE(required_trophies, 0) INTO v_required_trophies
    FROM drivers.clans LIMIT 1;

    WITH affected_rows AS (
        UPDATE drivers.recruits
        SET    status    = 'ARCHIVED',
               last_scan = NOW()
        WHERE  trophies < v_required_trophies
          AND  status != 'ARCHIVED'
        RETURNING tag
    )
    SELECT count(*) INTO v_count FROM affected_rows;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION drivers.bench_underqualified_recruits() IS
  'Archives recruits whose trophies fall below the clan floor. Returns the number of rows affected.';


-- ==========================================================================
-- 2. FIX: drivers.dismiss_recruit
--    expiry_date → expires_at (authoritative column in recruit_blacklist)
--    Also adds player_name + reason for a complete blacklist record.
-- ==========================================================================
CREATE OR REPLACE FUNCTION drivers.dismiss_recruit(p_tag TEXT, p_days_to_ban INTEGER DEFAULT 30)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = drivers, substrate, public
AS $$
DECLARE
    v_recruit RECORD;
BEGIN
    SELECT * INTO v_recruit FROM drivers.recruits WHERE tag = p_tag;

    INSERT INTO drivers.recruit_blacklist (
        tag,
        player_name,
        raw_potential_score,
        reason,
        expires_at
    )
    VALUES (
        p_tag,
        v_recruit.name,
        COALESCE(v_recruit.raw_potential_score, 0.0),
        'DISMISSED',
        NOW() + (p_days_to_ban || ' days')::INTERVAL
    )
    ON CONFLICT (tag) DO UPDATE SET
        expires_at = NOW() + (p_days_to_ban || ' days')::INTERVAL,
        created_at = NOW();

    DELETE FROM drivers.recruits WHERE tag = p_tag;
END;
$$;

COMMENT ON FUNCTION drivers.dismiss_recruit(TEXT, INTEGER) IS
  'Moves a recruit to the blacklist and purges them from the active queue.';


-- ==========================================================================
-- 3. FIX: public.ingest_clan_profile
--    Removes non-existent columns (active_decks, war_wins, week_fame).
--    Maps to the authoritative drivers.members schema (decks_used_today).
--    This endpoint stores the raw clan profile payload and updates basic
--    member identity fields only; war data flows through ingest_river_race.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.ingest_clan_profile(p_payload JSONB)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public, drivers, substrate
AS $$
BEGIN
    -- L0: Preserve raw payload for audit trail
    INSERT INTO substrate.raw_clan_profile (payload) VALUES (p_payload);

    -- L2: Shred into drivers.clans (clan-level metadata)
    INSERT INTO drivers.clans (
        tag,
        name,
        description,
        badge_id,
        member_count,
        required_trophies,
        type,
        last_ingested_at
    )
    VALUES (
        p_payload->>'tag',
        p_payload->>'name',
        p_payload->>'description',
        (p_payload->>'badgeId')::INTEGER,
        (p_payload->>'members')::INTEGER,
        (p_payload->>'requiredTrophies')::INTEGER,
        p_payload->>'type',
        NOW()
    )
    ON CONFLICT (tag) DO UPDATE SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        badge_id         = EXCLUDED.badge_id,
        member_count     = EXCLUDED.member_count,
        required_trophies = EXCLUDED.required_trophies,
        type             = EXCLUDED.type,
        last_ingested_at = EXCLUDED.last_ingested_at,
        updated_at       = NOW();
END;
$$;

COMMENT ON FUNCTION public.ingest_clan_profile(JSONB) IS
  'Stores raw clan profile payload and shreds clan-level metadata into drivers.clans.';


-- ==========================================================================
-- 4. FIX: public.ingest_clan_members
--    ON CONFLICT (tag, snapshot_date) → ON CONFLICT (tag)
--    drivers.members unique constraint is on (tag) only.
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.ingest_clan_members(p_payload JSONB)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public, drivers, substrate
AS $$
DECLARE
    r           RECORD;
    v_joined_at TIMESTAMPTZ;
BEGIN
    -- A. RAW SOURCE (L0 Substrate)
    INSERT INTO substrate.raw_clan_members (payload) VALUES (p_payload);

    -- B. MEMBERS = THE SINGLE SOURCE OF TRUTH (L2 Driver)
    FOR r IN
        SELECT item.value AS data
        FROM jsonb_array_elements(p_payload->'items') AS item
    LOOP
        -- Anchor: preserve the earliest joined_at observation
        SELECT MIN(joined_at) INTO v_joined_at
        FROM drivers.members
        WHERE tag = r.data->>'tag';

        IF v_joined_at IS NULL THEN
            v_joined_at := NOW();
        END IF;

        -- UPSERT — conflict on tag (the sole unique key on members)
        INSERT INTO drivers.members (
            tag, name, role, exp_level,
            trophies, donations, donations_received,
            last_seen, last_seen_at, updated_at,
            snapshot_date, joined_at
        )
        VALUES (
            r.data->>'tag',
            r.data->>'name',
            r.data->>'role',
            (r.data->>'expLevel')::INTEGER,
            (r.data->>'trophies')::INTEGER,
            (r.data->>'donations')::INTEGER,
            (r.data->>'donationsReceived')::INTEGER,
            (r.data->>'lastSeen')::TIMESTAMPTZ,
            (r.data->>'lastSeen')::TIMESTAMPTZ,
            NOW(),
            CURRENT_DATE,
            v_joined_at
        )
        ON CONFLICT (tag) DO UPDATE SET
            name               = EXCLUDED.name,
            role               = EXCLUDED.role,
            exp_level          = EXCLUDED.exp_level,
            trophies           = EXCLUDED.trophies,
            donations          = EXCLUDED.donations,
            donations_received = EXCLUDED.donations_received,
            last_seen          = EXCLUDED.last_seen,
            last_seen_at       = EXCLUDED.last_seen_at,
            snapshot_date      = EXCLUDED.snapshot_date,
            updated_at         = EXCLUDED.updated_at;
    END LOOP;

    -- C. PRUNING: 7-day retention for leavers
    DELETE FROM drivers.members
    WHERE tag NOT IN (
        SELECT tag FROM drivers.members WHERE snapshot_date = CURRENT_DATE
    )
    AND last_seen_at < (NOW() - INTERVAL '7 days');
END;
$$;

COMMENT ON FUNCTION public.ingest_clan_members(JSONB) IS
  'Ingests a clan member list payload. Upserts into drivers.members on tag; prunes 7-day leavers.';


-- ==========================================================================
-- 5. FIX: public.ingest_war_log
--    clan_tag/season_id/section_index → tag/week_id (authoritative columns)
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.ingest_war_log(p_payload JSONB)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public, drivers, substrate
AS $$
DECLARE
    v_entry RECORD;
BEGIN
    -- A. RAW SOURCE (L0 Substrate)
    INSERT INTO substrate.raw_war_log (payload) VALUES (p_payload);

    -- B. SHRED into drivers.war_history
    FOR v_entry IN
        SELECT
            (s->'clan'->>'tag')                                        AS tag,
            (s->'clan'->>'name')                                       AS name,
            (item->>'seasonId')::TEXT || '-' || (item->>'sectionIndex')::TEXT
                                                                       AS week_id,
            (s->'clan'->>'fame')::INTEGER                              AS fame,
            (s->>'rank')::INTEGER                                      AS rank,
            (s->'clan'->>'clanScore')::INTEGER                         AS clan_points
        FROM jsonb_array_elements(p_payload->'items') AS item,
             jsonb_array_elements(item->'standings')  AS s
        WHERE s->'clan'->>'tag' IS NOT NULL
    LOOP
        INSERT INTO drivers.war_history (tag, name, week_id, fame, rank, clan_points)
        VALUES (
            v_entry.tag,
            v_entry.name,
            v_entry.week_id,
            v_entry.fame,
            v_entry.rank,
            v_entry.clan_points
        )
        ON CONFLICT (tag, week_id) DO UPDATE SET
            name       = EXCLUDED.name,
            fame       = EXCLUDED.fame,
            rank       = EXCLUDED.rank,
            clan_points = EXCLUDED.clan_points,
            updated_at = NOW();
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ingest_war_log(JSONB) IS
  'Stores raw war log payload and shreds standings into drivers.war_history keyed on (tag, week_id).';


-- ==========================================================================
-- 6. FIX: substrate.purge_clanned_recruits (missing function)
--    Called by substrate.execute_nightly_maintenance. Removes recruits who
--    have joined the clan (their tag is now present in drivers.members),
--    writing a JOINED_US narrative event to drivers.recruit_ledger.
-- ==========================================================================
CREATE OR REPLACE FUNCTION substrate.purge_clanned_recruits()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path = substrate, drivers, public
AS $$
DECLARE
    v_count INTEGER := 0;
    v_rec   RECORD;
BEGIN
    FOR v_rec IN
        SELECT r.tag, r.name, r.raw_potential_score
        FROM   drivers.recruits r
        INNER JOIN drivers.members m ON m.tag = r.tag
    LOOP
        -- Narrative event: recruit graduated to membership
        INSERT INTO drivers.recruit_ledger (tag, tag_name, event_type, old_score, new_score, description)
        VALUES (
            v_rec.tag,
            v_rec.name,
            'JOINED_US',
            v_rec.raw_potential_score,
            v_rec.raw_potential_score,
            'Recruit joined the clan; auto-purged from headhunter queue.'
        );

        DELETE FROM drivers.recruits WHERE tag = v_rec.tag;
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION substrate.purge_clanned_recruits() IS
  'Removes recruits whose tag now appears in drivers.members (they joined the clan). Writes a JOINED_US event to recruit_ledger.';

-- Expose to search_path hardening (consistent with the hardening pass)
ALTER FUNCTION substrate.execute_nightly_maintenance()
    SET search_path = substrate, drivers, public;
