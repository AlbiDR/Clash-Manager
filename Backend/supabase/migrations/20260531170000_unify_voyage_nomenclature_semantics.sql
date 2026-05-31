-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Unify Voyage Nomenclature Semantics
 *
 * Rationale:
 * - Rename contribution columns to be highly explicit, self-documenting, and compliant with Domain-Role prefixes:
 *   - `total_crowns` -> `manual_voyage_crowns`
 *   - `total_crowns_at` -> `manual_voyage_crowns_at`
 *   - `crowns` -> `total_voyage_crowns`
 *   - `voyage_crown_percentage` -> `percentage_voyage_crowns`
 * - Rename RPCs:
 *   - `set_voyage_total_crowns` -> `set_voyage_manual_crowns`
 */

BEGIN;

-- 1. Drop dependent views in correct dependency order
DROP VIEW IF EXISTS features.voyage_contributions CASCADE;
DROP VIEW IF EXISTS features.voyage_summary CASCADE;
DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;

-- 2. Drop old functions to avoid naming conflicts or signature clashes
DROP FUNCTION IF EXISTS drivers.set_voyage_total_crowns(TEXT, INTEGER);
DROP FUNCTION IF EXISTS features.set_voyage_total_crowns(TEXT, INTEGER);

-- 3. Rename columns in drivers.clan_voyage_contributions
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN total_crowns TO manual_voyage_crowns;
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN total_crowns_at TO manual_voyage_crowns_at;
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN crowns TO total_voyage_crowns;
ALTER TABLE drivers.clan_voyage_contributions RENAME COLUMN voyage_crown_percentage TO percentage_voyage_crowns;

-- 4. Rebuild trigger function: drivers.on_battle_recorded()
CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_id      BIGINT;
    v_target  INT;
    v_current INT;
    v_end     TIMESTAMPTZ;
    v_name    TEXT;
BEGIN
    SELECT v.id, v.target_crowns, v.end_at
    INTO v_id, v_target, v_end
    FROM drivers.clan_voyage v
    WHERE v.status = 'ACTIVE'
    AND v.start_at <= NEW.battle_time
    AND v.end_at >= NEW.battle_time
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        -- Only record voyage contribution if the player is currently an active clan member
        SELECT player_name INTO v_name
        FROM drivers.members
        WHERE player_tag = NEW.player_tag
          AND is_active = true
        LIMIT 1;

        IF v_name IS NOT NULL THEN
            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id, 
                player_tag, 
                player_name, 
                total_voyage_crowns, 
                percentage_voyage_crowns
            )
            VALUES (
                v_id,
                NEW.player_tag,
                v_name,
                NEW.team_crowns,
                LEAST(ROUND((NEW.team_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
            )
            ON CONFLICT (voyage_id, player_tag)
            DO UPDATE SET 
                total_voyage_crowns = drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns,
                percentage_voyage_crowns = LEAST(ROUND(((drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
                player_name = v_name,
                updated_at = now();
        END IF;

        SELECT SUM(total_voyage_crowns) INTO v_current
        FROM drivers.clan_voyage_contributions
        WHERE voyage_id = v_id;

        IF v_current >= v_target OR now() >= v_end THEN
            UPDATE drivers.clan_voyage
            SET status = 'COMPLETED',
                updated_at = now()
            WHERE id = v_id;
        END IF;
    ELSE
        UPDATE drivers.clan_voyage
        SET status = 'COMPLETED',
            updated_at = now()
        WHERE status = 'ACTIVE'
        AND end_at <= now();
    END IF;

    RETURN NEW;
END;
$$;

-- 5. Rebuild calculations function: drivers.refresh_voyage_contributions()
CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'drivers', 'public'
 AS $function$
DECLARE
    v_id         BIGINT;
    v_start      TIMESTAMPTZ;
    v_end        TIMESTAMPTZ;
    v_target     INTEGER;
    v_window_end TIMESTAMPTZ;
BEGIN
    SELECT id, start_at, end_at, target_crowns
    INTO v_id, v_start, v_end, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;

    v_window_end := COALESCE(v_end, now());

    -- 1. Strict Pruning: Remove any contribution records for players who are not currently active clan members
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

    -- 2. Calculate and update the correct live scores.
    --    We perform this in a clean UPDATE pass that handles both players with and without overrides.
    UPDATE drivers.clan_voyage_contributions c
    SET
        total_voyage_crowns = COALESCE(c.manual_voyage_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns)
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
              AND (
                  -- If there's a manual override, only count subsequent battles
                  (c.manual_voyage_crowns IS NOT NULL AND b.battle_time > c.manual_voyage_crowns_at)
                  OR
                  -- Otherwise, count everything since voyage start
                  (c.manual_voyage_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    -- 3. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET percentage_voyage_crowns = LEAST(ROUND((total_voyage_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;

-- 6. Create new secure RPC: drivers.set_voyage_manual_crowns()
CREATE OR REPLACE FUNCTION drivers.set_voyage_manual_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    v_id      BIGINT;
    v_target  INTEGER;
    v_name    TEXT;
    v_now     TIMESTAMP WITH TIME ZONE := now();
BEGIN
    SELECT id, target_crowns
    INTO v_id, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'No ACTIVE clan voyage found.'
        );
    END IF;

    IF p_crowns < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'crowns must be non-negative.'
        );
    END IF;

    -- Strict Guard: Only active clan members can have manual overrides
    SELECT player_name INTO v_name
    FROM drivers.members
    WHERE player_tag = p_player_tag
      AND is_active = true
    LIMIT 1;

    IF v_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Player is not an active clan member.'
        );
    END IF;

    INSERT INTO drivers.clan_voyage_contributions (
        voyage_id, 
        player_tag, 
        player_name, 
        manual_voyage_crowns, 
        manual_voyage_crowns_at, 
        total_voyage_crowns, 
        percentage_voyage_crowns
    )
    VALUES (
        v_id,
        p_player_tag,
        v_name,
        p_crowns,
        v_now,
        p_crowns,
        LEAST(ROUND((p_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    )
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        manual_voyage_crowns    = EXCLUDED.manual_voyage_crowns,
        manual_voyage_crowns_at = EXCLUDED.manual_voyage_crowns_at,
        total_voyage_crowns     = EXCLUDED.total_voyage_crowns,
        percentage_voyage_crowns = EXCLUDED.percentage_voyage_crowns,
        updated_at               = v_now;

    PERFORM drivers.refresh_voyage_contributions();

    RETURN jsonb_build_object(
        'success',             true,
        'voyage_id',           v_id,
        'player_tag',          p_player_tag,
        'manual_voyage_crowns', p_crowns
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. Create new proxy RPC: features.set_voyage_manual_crowns()
CREATE OR REPLACE FUNCTION features.set_voyage_manual_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
BEGIN
    RETURN drivers.set_voyage_manual_crowns(p_player_tag, p_crowns);
END;
$$;

GRANT EXECUTE ON FUNCTION features.set_voyage_manual_crowns(TEXT, INTEGER)
    TO anon, authenticated;

-- 8. Rebuild finalizer function: substrate.finalize_expired_voyages()
CREATE OR REPLACE FUNCTION substrate.finalize_expired_voyages()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
    v_rec   RECORD;
BEGIN
    -- For each voyage that is about to be auto-finalized
    FOR v_rec IN (
        SELECT id, target_crowns 
        FROM drivers.clan_voyage 
        WHERE status = 'ACTIVE' AND end_at <= now()
    ) LOOP
        -- 1. One-time pre-population of 0-crown rows for all active members who did not participate
        INSERT INTO drivers.clan_voyage_contributions (
            voyage_id, 
            player_tag, 
            player_name, 
            total_voyage_crowns, 
            percentage_voyage_crowns
        )
        SELECT 
            v_rec.id, 
            m.player_tag, 
            m.player_name, 
            0, 
            0.0
        FROM drivers.members m
        WHERE m.is_active = true
          AND m.player_tag NOT IN (
              SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_rec.id
          )
        ON CONFLICT (voyage_id, player_tag) DO NOTHING;
    END LOOP;

    -- 2. Transition voyages to COMPLETED
    UPDATE drivers.clan_voyage
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE status = 'ACTIVE'
    AND end_at <= now();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 3. Clean up the database: prune any 0-crown contribution records of players who are no longer active
    DELETE FROM drivers.clan_voyage_contributions
    WHERE total_voyage_crowns = 0
      AND (
          player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true)
          OR player_name IS NULL
      );

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('VOYAGE_FINALIZATION', 'SUCCESS', 'Auto-finalized ' || v_count || ' expired Clan Voyages.');
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Recreate Features Views in correct dependency order
CREATE OR REPLACE VIEW features.scoring_view AS
 WITH voyage_history AS (
          SELECT c.player_tag,
             c.total_voyage_crowns AS crowns,
             v.target_crowns,
             v.end_at,
             row_number() OVER (PARTITION BY c.player_tag ORDER BY v.end_at DESC) AS recency_rank
           FROM drivers.clan_voyage_contributions c
             JOIN drivers.clan_voyage v ON v.id = c.voyage_id
          WHERE v.status = 'COMPLETED'::text
        ),
  voyage_factuals AS (
          SELECT voyage_history.player_tag,
             sum(
               voyage_history.crowns::numeric / voyage_history.target_crowns::numeric
               * GREATEST(0.5, 1.0 - (voyage_history.recency_rank - 1)::numeric * 0.05)
             ) AS weighted_voyage_index,
             ( SELECT string_agg(sub.crowns::text || ' ' || TO_CHAR(sub.end_at, 'YYYY-MM-DD'), ' | ' ORDER BY sub.end_at DESC)
               FROM (
                 SELECT crowns, end_at
                 FROM voyage_history vh_sub
                 WHERE vh_sub.player_tag = voyage_history.player_tag
                 ORDER BY end_at DESC
                 LIMIT 52
               ) sub
             ) AS v_hist
            FROM voyage_history
           GROUP BY voyage_history.player_tag
         ),
  factual_logs AS (
          SELECT
             m.player_tag,
             count(DISTINCT wa.week_id) AS recorded_weeks,
             avg(wa.fame)              AS avg_fame,
             avg(wa.decks_used) / 4.0 * 100.0 AS avg_war_rate,
             ( SELECT string_agg(sub.fame::text || ' ' || sub.week_id, ' | ' ORDER BY sub.max_recorded DESC)
               FROM (
                 SELECT wa2.week_id,
                        max(wa2.fame)        AS fame,
                        max(wa2.recorded_at) AS max_recorded
                 FROM drivers.war_activity wa2
                 WHERE wa2.player_tag = m.player_tag
                 GROUP BY wa2.week_id
                 ORDER BY max(wa2.recorded_at) DESC
               ) sub
             ) AS hist
            FROM drivers.members m
            LEFT JOIN drivers.war_activity wa ON wa.player_tag = m.player_tag
           WHERE m.is_active = true
           GROUP BY m.player_tag
         ),
  benchmarking_context AS (
          SELECT
             ( SELECT COALESCE(NULLIF(max(w.recorded_weeks), 0), 12::bigint)
                 FROM ( SELECT count(DISTINCT war_activity.week_id) AS recorded_weeks
                          FROM drivers.war_activity
                         GROUP BY war_activity.player_tag) w
             ) AS max_history_weeks,
             ( SELECT COALESCE(percentile_cont(0.25) WITHIN GROUP (ORDER BY t.tenure_days::double precision), 14::double precision)
                 FROM ( SELECT GREATEST(0::numeric, EXTRACT(day FROM now() - members.joined_at)) AS tenure_days
                          FROM drivers.members
                         WHERE members.is_active = true) t
             ) AS rookie_window_days,
             ( SELECT max(s.baseline_raw_score)
                 FROM ( SELECT round(
                                 COALESCE(m.week_fame, 0)::numeric * 3.0
                                 + COALESCE(fl2.avg_fame, 0::numeric) * 15.0
                                 + m.donations::numeric * 100.0
                                 + m.trophies::numeric * 0.1
                                 + COALESCE(fl2.avg_war_rate, 0::numeric) * 150.0
                               ) AS baseline_raw_score
                          FROM drivers.members m
                          LEFT JOIN (
                            SELECT war_activity.player_tag,
                                   avg(war_activity.fame)               AS avg_fame,
                                   avg(war_activity.decks_used) / 4.0 * 100.0 AS avg_war_rate
                              FROM drivers.war_activity
                             GROUP BY war_activity.player_tag
                          ) fl2 ON m.player_tag = fl2.player_tag
                         WHERE m.is_active = true) s
             ) AS clan_max_baseline
         ),
  base_stats AS (
          SELECT m.player_tag,
             m.player_name AS name,
             m.trophies,
             m.donations,
             m.joined_at,
             m.last_seen_at,
             m.war_wins,
             GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.last_seen_at) / 86400.0) AS days_inactive,
             GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.joined_at) / 86400.0)    AS tenure_days,
             COALESCE(m.week_fame, 0)              AS current_fame,
             COALESCE(fl.avg_fame, 0::numeric)     AS avg_fame,
             COALESCE(fl.avg_war_rate, 0::numeric) AS war_rate,
             COALESCE(fl.recorded_weeks, 0::bigint) AS recorded_weeks,
             COALESCE(fl.hist, '-'::text)           AS hist,
             COALESCE(vf.v_hist, '-'::text)         AS v_hist,
             COALESCE(vf.weighted_voyage_index, 0::numeric) AS voyage_index
            FROM drivers.members m
              LEFT JOIN factual_logs fl ON m.player_tag = fl.player_tag
              LEFT JOIN voyage_factuals vf ON m.player_tag = vf.player_tag
           WHERE m.is_active = true
         ),
  weighted_calculations AS (
          SELECT bs.*,
             LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric) AS stability_index,
             LEAST(1.10, 1.0 + bs.tenure_days / 30.0 * 0.01)                        AS loyalty_multiplier,
             round(bs.voyage_index * bc.clan_max_baseline)                           AS voyage_merit,
             round(
               bs.current_fame::numeric * 3.0
               + bs.avg_fame * 15.0
               + bs.donations::numeric * 100.0
               + bs.trophies::numeric * 0.1
               + bs.war_rate * 150.0
             ) AS core_baseline_score,
             power(1.0 - 0.08, GREATEST(0::numeric, bs.days_inactive - 4.0)) AS decay_multiplier,
             bc.rookie_window_days
            FROM base_stats bs
              CROSS JOIN benchmarking_context bc
         ),
  clinical_layer AS (
          SELECT wc.*,
             round((wc.core_baseline_score + wc.voyage_merit) * wc.loyalty_multiplier * wc.decay_multiplier) AS raw_performance_score,
             CASE
                 WHEN wc.tenure_days::double precision < wc.rookie_window_days
                     THEN (wc.trophies::numeric * 1.0 + wc.donations::numeric * 0.1 + (wc.war_wins + 500)::numeric * 20.0)::double precision
                          * power((wc.rookie_window_days - wc.tenure_days::double precision) / wc.rookie_window_days, 2::numeric::double precision)
                          / 5.0
                 ELSE 0::numeric::double precision
             END AS heritage_bonus
            FROM weighted_calculations wc
         ),
  final_scoring AS (
          SELECT *,
             raw_performance_score::double precision + heritage_bonus AS total_combined_score,
             max(raw_performance_score::double precision + heritage_bonus) OVER () AS global_max_score
            FROM clinical_layer
         )
 SELECT
    player_tag,
    name,
    trophies,
    donations,
    joined_at,
    last_seen_at,
    war_wins,
    days_inactive,
    tenure_days,
    current_fame,
    avg_fame,
    war_rate,
    recorded_weeks,
    voyage_index,
    voyage_merit,
    loyalty_multiplier,
    stability_index,
    core_baseline_score AS baseline_raw_score,
    decay_multiplier,
    raw_performance_score,
    heritage_bonus,
    hist,
    v_hist,
    CASE
        WHEN global_max_score > 0::numeric::double precision
            THEN round(total_combined_score / global_max_score * 100.0::double precision)
        ELSE 0::numeric::double precision
    END AS performance_score
   FROM final_scoring;

GRANT SELECT ON features.scoring_view TO authenticated, anon, service_role;

CREATE OR REPLACE VIEW features.roster_view AS
 WITH roster_source AS (
         SELECT m.id,
            m.player_tag,
            m.player_name,
            m.role,
            m.exp_level,
            m.last_seen_at,
            m.updated_at,
            m.snapshot_date,
            m.trophies,
            m.donations,
            m.donations_received,
            m.joined_at,
            m.star_points,
            m.best_trophies,
            m.total_donations,
            m.war_day_wins,
            m.clan_cards_collected,
            m.challenge_max_wins,
            m.card_count,
            m.elite_wild_cards,
            m.war_wins,
            m.week_fame,
            m.decks_used_today,
            m.clan_rank,
            m.last_ingested_at,
            m.is_active,
            m.decks_used_weekly,
            m.current_clan_tag,
            s.avg_fame,
            s.war_rate,
            s.voyage_index,
            s.voyage_merit,
            s.raw_performance_score,
            s.performance_score,
            s.stability_index,
            s.days_inactive,
            s.tenure_days,
            s.hist,
            s.v_hist,
            ltrim(m.player_tag, '#'::text) AS raw_tag
           FROM drivers.members m
             LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
          WHERE m.is_active = true AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
        )
 SELECT player_name,
    role,
    player_tag,
    clan_rank,
    trophies,
    exp_level,
    donations,
    donations_received,
    decks_used_today,
    decks_used_weekly,
    week_fame,
    avg_fame,
    voyage_index,
    voyage_merit,
    COALESCE(war_rate, 0::numeric) AS war_participation,
    raw_performance_score,
    performance_score,
    stability_index,
    substrate.format_last_seen(days_inactive) AS last_seen_label,
    substrate.format_tenure(tenure_days)       AS tenure_label,
    last_seen_at,
    last_ingested_at,
    tenure_days,
    hist,
    v_hist,
    'https://link.clashroyale.com/en?player='::text || raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || raw_tag AS royaleapi_link
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT 
    c.player_tag,
    s.name AS player_name,
    c.total_voyage_crowns,
    c.percentage_voyage_crowns,
    s.performance_score
FROM drivers.clan_voyage_contributions c
JOIN features.scoring_view s ON s.player_tag = c.player_tag
WHERE c.voyage_id = (SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1);

GRANT SELECT ON features.voyage_contributions TO authenticated, anon, service_role;

CREATE OR REPLACE VIEW features.voyage_summary AS
WITH current_voyage AS (
    SELECT *
    FROM drivers.clan_voyage
    WHERE status IN ('PENDING', 'ACTIVE')
    ORDER BY CASE WHEN status = 'ACTIVE' THEN 1 ELSE 2 END ASC, created_at DESC
    LIMIT 1
), total_stats AS (
    SELECT
        v.id AS voyage_id,
        COALESCE(SUM(c.total_voyage_crowns), 0) AS total_crowns
    FROM current_voyage v
    LEFT JOIN drivers.clan_voyage_contributions c ON c.voyage_id = v.id
    GROUP BY v.id
)
SELECT
    (SELECT jsonb_build_object(
        'id',            v.id,
        'clan_tag',      v.clan_tag,
        'status',        v.status,
        'target_crowns', v.target_crowns,
        'start_at',      v.start_at,
        'end_at',        v.end_at,
        'is_victory',    (ts.total_crowns >= v.target_crowns)
    ) FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id) AS event,
    COALESCE((SELECT ts.total_crowns FROM total_stats ts), 0) AS total_crowns,
    COALESCE(
        (SELECT (ts.total_crowns::numeric / NULLIF(v.target_crowns, 0)::numeric)
         FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id),
        0
    ) AS progress_ratio;

GRANT SELECT ON features.voyage_summary TO authenticated, anon, service_role;

COMMIT;
