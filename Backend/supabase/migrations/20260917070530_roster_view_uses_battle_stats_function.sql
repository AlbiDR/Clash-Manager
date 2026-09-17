-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Points roster_view's battle_stats at the new smart-folded rollup function
-- and wires the fold/purge into nightly maintenance. Rationale in the commit message.

BEGIN;

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
            s.avg_daily_donations,
            ltrim(m.player_tag, '#'::text) AS raw_tag
           FROM drivers.members m
             LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
          WHERE m.is_active = true AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
        ), battle_stats AS (
         -- [FIX] Was a live aggregation over every raw player_battles row;
         -- now reads the smart-folded daily rollup at the same 30-day window.
         SELECT gbs.player_tag,
            gbs.battles AS battle_count,
            gbs.wins
           FROM drivers.get_player_battle_stats(30, (SELECT array_agg(rs2.player_tag) FROM roster_source rs2)) gbs
        )
 SELECT rs.player_name,
    rs.role,
    rs.player_tag,
    rs.clan_rank,
    rs.trophies,
    rs.exp_level,
    rs.donations,
    rs.donations_received,
    rs.decks_used_today,
    rs.decks_used_weekly,
    rs.week_fame,
    rs.avg_fame,
    rs.voyage_index,
    rs.voyage_merit,
    COALESCE(rs.war_rate, 0::numeric) AS war_participation,
    rs.raw_performance_score,
    rs.performance_score,
    rs.stability_index,
    substrate.format_last_seen(rs.days_inactive) AS last_seen_label,
    substrate.format_tenure(rs.tenure_days) AS tenure_label,
    rs.last_seen_at,
    rs.last_ingested_at,
    rs.tenure_days,
    rs.hist,
    rs.v_hist,
    rs.avg_daily_donations,
    'https://link.clashroyale.com/en?player='::text || rs.raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || rs.raw_tag AS royaleapi_link,
    rs.war_wins,
    COALESCE(bs.wins::numeric / NULLIF(bs.battle_count, 0)::numeric, 0::numeric) AS win_rate
   FROM roster_source rs
     LEFT JOIN battle_stats bs ON bs.player_tag = rs.player_tag
  ORDER BY rs.raw_performance_score DESC NULLS LAST, rs.performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
BEGIN
    PERFORM substrate.pipeline_watchdog();

    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status            = 'RUNNING',
        last_triggered_at = EXCLUDED.last_triggered_at,
        last_message      = EXCLUDED.last_message;

    -- L0 Substrate Purges
    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    PERFORM substrate.finalize_expired_voyages();

    -- Consolidate voyage history before player purges fire so that
    -- contribution data is safely archived before cascade deletes run.
    PERFORM drivers.consolidate_voyage_history();

    -- L2 Domain Purges
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_inactive_members();
    PERFORM substrate.fold_player_battles();
    PERFORM substrate.purge_folded_player_battles();
    PERFORM substrate.purge_stale_member_snapshots();
    PERFORM substrate.purge_worst_recruits();
    PERFORM substrate.purge_orphan_players();

    -- Safety-net: log any history rows that survived beyond the cascade.
    PERFORM drivers.purge_stale_voyage_history();

    PERFORM substrate.purge_recruit_ledger();
    PERFORM substrate.purge_stale_recruits();

    PERFORM substrate.rotate_recruits();

    -- L3 Control-plane hygiene. Fold before prune, same ordering discipline as
    -- consolidate_voyage_history() above. Isolated so it cannot abort the rest.
    BEGIN
        PERFORM substrate.fold_cron_history();
        PERFORM substrate.purge_cron_history();
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('SYSTEM_PURGE', 'ERROR', 'Cron history maintenance failed: ' || SQLERRM);
    END;

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Raw logs, ledgers, battles, snapshots, orphans, voyage and cron history folded/pruned. Voyages finalized.',
        updated_at      = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';

EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MAINTENANCE_FAILURE', 'ERROR', SQLERRM);

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = SQLERRM,
        updated_at      = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';
    RAISE;
END;
$function$;

COMMIT;
