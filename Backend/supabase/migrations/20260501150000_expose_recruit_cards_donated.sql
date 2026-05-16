-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FIX: Expose recruit cards (challengeCardsWon) through the full pipeline
--
-- ROOT CAUSE (3 compounding gaps):
--
--   1. substrate.shred_scout_logs - the jsonb_to_recordset typelist did not
--      include a `cards` column, so the field was silently discarded even when
--      the profiler payload contained it.  The INSERT/UPDATE also omitted the
--      column, leaving drivers.recruits.cards perpetually at its DEFAULT (0).
--
--   2. features.headhunter_view - the SELECT never projected r.cards, so even
--      if the column were populated it would never reach the API layer.
--
--   3. SupabaseClient.ts (frontend) - mapSbHeadhunterRow hardcoded `cards: 0`.
--      That is fixed in the TypeScript layer independently.
--
-- This migration resolves gaps 1 and 2.  The TypeScript fix is a companion
-- change in Frontend-PWA/src/core/api/SupabaseClient.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rebuild shred_scout_logs to extract and persist cards
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION substrate.shred_scout_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_recruit RECORD;
    v_items JSONB;
    v_required_trophies INTEGER;
    v_managed_clan_tag TEXT;
BEGIN
    -- Get clan floor for status assignment (ACTIVE vs QUEUE)
    SELECT clan_tag, COALESCE(required_trophies, 0)
    INTO v_managed_clan_tag, v_required_trophies
    FROM drivers.clans
    LIMIT 1;

    -- Extract items from payload (support bare array or {items:[]} envelope)
    v_items := CASE
        WHEN jsonb_typeof(NEW.payload) = 'array' THEN NEW.payload
        WHEN NEW.payload ? 'items' AND jsonb_typeof(NEW.payload->'items') = 'array' THEN NEW.payload->'items'
        ELSE NULL
    END;

    IF v_items IS NULL THEN RETURN NEW; END IF;

    FOR v_recruit IN
        SELECT * FROM jsonb_to_recordset(v_items) AS x(
            tag         TEXT,
            name        TEXT,
            trophies    INTEGER,
            donations   INTEGER,
            cards       INTEGER,   -- challengeCardsWon, supplied by profiler.ts
            war         INTEGER,
            "rawScore"  NUMERIC
        )
    LOOP
        -- Skip blacklisted players
        IF NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist WHERE player_tag = v_recruit.tag) THEN

            -- Upsert into base registry
            INSERT INTO drivers.players (player_tag, player_name)
            VALUES (v_recruit.tag, v_recruit.name)
            ON CONFLICT (player_tag) DO UPDATE
                SET player_name = EXCLUDED.player_name,
                    updated_at  = now();

            INSERT INTO drivers.recruits (
                player_tag,
                player_name,
                trophies,
                donations,
                cards,
                war_wins,
                raw_potential_score,
                source,
                status,
                found_date,
                last_scan
            )
            VALUES (
                v_recruit.tag,
                v_recruit.name,
                COALESCE(v_recruit.trophies,   0),
                COALESCE(v_recruit.donations,  0),
                COALESCE(v_recruit.cards,      0),
                COALESCE(v_recruit.war,        0),
                COALESCE(v_recruit."rawScore", (
                    (COALESCE(v_recruit.trophies,  0) * 1.0)  +
                    (COALESCE(v_recruit.donations, 0) * 0.1)  +
                    ((COALESCE(v_recruit.war,      0) + 500) * 20.0)
                )),
                NEW.source,
                CASE
                    WHEN COALESCE(v_recruit.trophies, 0) < v_required_trophies
                        THEN 'QUEUE'::drivers.recruit_status
                    ELSE 'ACTIVE'::drivers.recruit_status
                END,
                NOW(),
                NOW()
            )
            ON CONFLICT (player_tag) DO UPDATE SET
                trophies            = EXCLUDED.trophies,
                donations           = EXCLUDED.donations,
                cards               = EXCLUDED.cards,
                war_wins            = EXCLUDED.war_wins,
                raw_potential_score = GREATEST(
                                          drivers.recruits.raw_potential_score,
                                          EXCLUDED.raw_potential_score
                                      ),
                source              = EXCLUDED.source,
                status              = CASE
                    WHEN EXCLUDED.trophies >= v_required_trophies
                         AND drivers.recruits.status = 'QUEUE'
                        THEN 'ACTIVE'::drivers.recruit_status
                    WHEN EXCLUDED.trophies < v_required_trophies
                         AND drivers.recruits.status = 'ACTIVE'
                        THEN 'QUEUE'::drivers.recruit_status
                    ELSE drivers.recruits.status
                END,
                last_scan           = NOW();
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2. Rebuild headhunter_view to expose the cards column
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS features.headhunter_view CASCADE;

CREATE VIEW features.headhunter_view
WITH (security_invoker = true)
AS
WITH corpus_benchmark AS (
    -- Normalization anchor for PoS (0-100 scale).
    -- Priority cascade (all data-driven, no hardcoded values):
    --   1. Max raw_potential_score of current ACTIVE recruits.
    --   2. Max raw_potential_score of recently dismissed recruits (blacklist,
    --      expires_at > now() - the 30-day persistence window).
    --   3. Max raw_potential_score across the entire corpus (all statuses).
    --   4. 1 - zero-division mathematical guard only.
    SELECT GREATEST(
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruits WHERE status = 'ACTIVE'),
            0
        ),
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruit_blacklist WHERE expires_at > now()),
            0
        ),
        COALESCE(
            (SELECT MAX(raw_potential_score) FROM drivers.recruits),
            1
        )
    ) AS value
),
heritage_context AS (
    -- Identifies recruits who were previously active members.
    -- is_fresh = seen within the last 30 days (returning veteran signal).
    SELECT
        player_tag,
        max_pes,
        tenure_days,
        (last_seen_at >= (now() - INTERVAL '30 days')) AS is_fresh
    FROM drivers.heritage_ledger
)
SELECT
    r.player_tag,
    r.player_name,
    ('https://link.clashroyale.com/en?player=' || ltrim(r.player_tag, '#')) AS ingame_link,
    ('https://royaleapi.com/player/'           || ltrim(r.player_tag, '#')) AS royaleapi_link,
    r.trophies,
    r.donations,
    r.cards,
    r.war_wins,
    r.found_date,
    -- Longevity: how long this recruit has been in the pipeline (minutes since found_date)
    (ROUND(EXTRACT(epoch FROM (now() - r.found_date)) / 60::numeric))::integer AS longevity,
    substrate.format_longevity(
        (ROUND(EXTRACT(epoch FROM (now() - r.found_date)) / 60::numeric))::integer
    ) AS longevity_label,
    r.raw_potential_score,
    r.raw_potential_score AS rpos,
    -- potential_score: 0-100, normalised against corpus_benchmark.
    -- Heritage blessing: 1.05x bonus for returning veterans with proven
    -- history (max_pes > 10000, seen within 30 days).
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE
                WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
                ELSE 1.0
              END
        ) / (SELECT value FROM corpus_benchmark) * 100::numeric
    )) AS potential_score,
    LEAST(100::numeric, ROUND(
        (r.raw_potential_score
            * CASE
                WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, false) THEN 1.05
                ELSE 1.0
              END
        ) / (SELECT value FROM corpus_benchmark) * 100::numeric
    )) AS pos,
    COALESCE(h.is_fresh AND h.max_pes > 10000, false) AS has_heritage_blessing,
    CASE
        WHEN r.raw_potential_score >= 12000::numeric THEN 'ELITE'
        WHEN r.raw_potential_score >= 10500::numeric THEN 'HIGH'
        ELSE 'MID'
    END AS tier,
    r.last_scan AS last_seen_at,
    CASE
        WHEN h.player_tag IS NOT NULL AND h.is_fresh THEN 'RETURNING_VETERAN'
        WHEN h.player_tag IS NOT NULL                THEN 'FORMER_MEMBER'
        ELSE 'NEW_CANDIDATE'
    END AS heritage_status
FROM drivers.recruits r
LEFT JOIN heritage_context h ON h.player_tag = r.player_tag
WHERE r.status = 'ACTIVE'::drivers.recruit_status
  AND NOT EXISTS (
      SELECT 1 FROM drivers.recruit_blacklist bl
      WHERE bl.player_tag = r.player_tag
  )
ORDER BY r.raw_potential_score DESC;

GRANT SELECT ON features.headhunter_view TO authenticated, anon, service_role;
