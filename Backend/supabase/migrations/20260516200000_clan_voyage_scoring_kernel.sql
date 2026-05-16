-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Clan Voyage Scoring Kernel Integration (Final Polish)
 * 
 * Logic:
 * 1. Decayed Participation Index: Most recent voyage is worth 100%, -5% per prior, floor at 50%.
 * 2. Dynamic Scaling: Voyage merit is scaled against the current clan core performance ceiling.
 * 3. Atomic Views: Rebuilds roster_view to incorporate voyage metrics while preserving existing labels.
 * 4. Operational Gating: Fixes on_battle_recorded to handle voyage expiration automatically.
 */

-- 1. UPDATE: drivers.on_battle_recorded
CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_id BIGINT;
    v_target INT;
    v_current INT;
    v_end TIMESTAMPTZ;
BEGIN
    SELECT v.id, v.target_crowns, v.end_at
    INTO v_id, v_target, v_end
    FROM drivers.clan_voyage v
    WHERE v.status = 'ACTIVE'
    AND v.start_at <= NEW.battle_time
    AND v.end_at >= NEW.battle_time
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, crowns)
        VALUES (v_id, NEW.player_tag, NEW.team_crowns)
        ON CONFLICT (voyage_id, player_tag)
        DO UPDATE SET 
            crowns = drivers.clan_voyage_contributions.crowns + EXCLUDED.crowns,
            updated_at = now();

        SELECT SUM(crowns) INTO v_current
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

-- 2. REBUILD: features.roster_view (using exact current definition + voyage metrics)
DROP VIEW IF EXISTS features.roster_view CASCADE;

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
    substrate.format_tenure(tenure_days) AS tenure_label,
    last_seen_at,
    last_ingested_at,
    tenure_days,
    'https://link.clashroyale.com/en?player='::text || raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || raw_tag AS royaleapi_link
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

-- 3. INTEGRATE: Maintenance Logic
CREATE OR REPLACE FUNCTION substrate.finalize_expired_voyages()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE drivers.clan_voyage
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE status = 'ACTIVE'
    AND end_at <= now();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('VOYAGE_FINALIZATION', 'SUCCESS', 'Auto-finalized ' || v_count || ' expired Clan Voyages.');
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void AS $$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE 
    SET status = 'RUNNING', last_triggered_at = EXCLUDED.last_triggered_at, last_message = EXCLUDED.last_message;

    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    PERFORM substrate.finalize_expired_voyages();
    
    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat 
    SET status = 'COMPLETED', 
        last_success_at = NOW(), 
        last_message = 'Maintenance complete. Voyage finalization executed.',
        updated_at = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';

EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MAINTENANCE_FAILURE', 'ERROR', SQLERRM);

    UPDATE substrate.pipeline_heartbeat 
    SET status = 'FAILED', 
        last_failure_at = NOW(), 
        last_message = SQLERRM,
        updated_at = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: initialize_voyage
-- Enables the PWA to trigger a new event.
CREATE OR REPLACE FUNCTION drivers.initialize_voyage(
    target_crowns INTEGER,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_id BIGINT;
    v_clan_tag TEXT;
BEGIN
    -- Fetch the authoritative clan tag
    SELECT clan_tag INTO v_clan_tag FROM drivers.clans LIMIT 1;

    IF v_clan_tag IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No clan found in drivers.clans');
    END IF;

    -- 1. Finalize any existing ACTIVE voyage
    UPDATE drivers.clan_voyage 
    SET status = 'COMPLETED', updated_at = now()
    WHERE status = 'ACTIVE';

    -- 2. Insert new voyage with the fetched clan_tag
    INSERT INTO drivers.clan_voyage (clan_tag, target_crowns, start_at, end_at, status)
    VALUES (v_clan_tag, target_crowns, start_at, end_at, 'ACTIVE')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'voyage_id', v_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. VIEWS: voyage_summary & voyage_contributions
-- SSOT for the PWA dashboard.
CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT 
    c.player_tag,
    c.crowns,
    s.performance_score
FROM drivers.clan_voyage_contributions c
JOIN features.scoring_view s ON s.player_tag = c.player_tag
WHERE c.voyage_id = (SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1);

CREATE OR REPLACE VIEW features.voyage_summary AS
WITH active_voyage AS (
    SELECT * FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1
), total_stats AS (
    SELECT 
        v.id AS voyage_id,
        COALESCE(SUM(c.crowns), 0) AS total_crowns
    FROM active_voyage v
    LEFT JOIN drivers.clan_voyage_contributions c ON c.voyage_id = v.id
    GROUP BY v.id
)
SELECT 
    jsonb_build_object(
        'id', v.id,
        'status', v.status,
        'target_crowns', v.target_crowns,
        'start_at', v.start_at,
        'end_at', v.end_at,
        'is_victory', (ts.total_crowns >= v.target_crowns)
    ) AS event,
    ts.total_crowns,
    (ts.total_crowns::numeric / v.target_crowns::numeric) AS progress_ratio
FROM active_voyage v
JOIN total_stats ts ON ts.voyage_id = v.id;
