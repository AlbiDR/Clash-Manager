-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR




CREATE TABLE IF NOT EXISTS drivers.player_voyage_history (
    player_tag  text        NOT NULL,
    history     text        NOT NULL DEFAULT '',
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT player_voyage_history_pkey
        PRIMARY KEY (player_tag),
    CONSTRAINT player_voyage_history_player_tag_fkey
        FOREIGN KEY (player_tag)
        REFERENCES drivers.players (player_tag)
        ON DELETE CASCADE
);

ALTER TABLE drivers.player_voyage_history ENABLE ROW LEVEL SECURITY;



ALTER TABLE drivers.clan_voyage_contributions
    DROP CONSTRAINT IF EXISTS clan_voyage_contributions_player_tag_fkey;

ALTER TABLE drivers.clan_voyage_contributions
    ADD CONSTRAINT clan_voyage_contributions_player_tag_fkey
        FOREIGN KEY (player_tag)
        REFERENCES drivers.players (player_tag)
        ON DELETE CASCADE;



CREATE OR REPLACE FUNCTION drivers.consolidate_voyage_history()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_anchor_id BIGINT;
    v_count     INTEGER := 0;
    v_rec       RECORD;
    v_existing  TEXT;
    v_merged    TEXT;
BEGIN
    -- 1. Determine the anchor voyage to keep as individual rows.
    --    Prefer any non-completed voyage (ACTIVE or PENDING); fall back to
    --    the most recently completed voyage.
    SELECT id
    INTO   v_anchor_id
    FROM   drivers.clan_voyage
    WHERE  status IN ('ACTIVE', 'PENDING')
    ORDER  BY start_at DESC
    LIMIT  1;

    IF v_anchor_id IS NULL THEN
        SELECT id
        INTO   v_anchor_id
        FROM   drivers.clan_voyage
        WHERE  status = 'COMPLETED'
        ORDER  BY end_at DESC
        LIMIT  1;
    END IF;

    -- Nothing to consolidate when there are no voyages at all.
    IF v_anchor_id IS NULL THEN
        RETURN;
    END IF;

    -- 2. Process each player that has completed contribution rows outside the anchor.
    FOR v_rec IN
        SELECT
            c.player_tag,
            string_agg(
                v.id::text          || '|' ||
                c.total_voyage_crowns::text || '|' ||
                v.target_crowns::text        || '|' ||
                TO_CHAR(v.end_at, 'YYYY-MM-DD'),
                ','
                ORDER BY v.end_at DESC
            ) AS new_entries
        FROM   drivers.clan_voyage_contributions c
        JOIN   drivers.clan_voyage v ON v.id = c.voyage_id
        WHERE  c.voyage_id <> v_anchor_id
          AND  v.status    =  'COMPLETED'
        GROUP  BY c.player_tag
    LOOP
        -- Load any pre-existing history for this player.
        SELECT history
        INTO   v_existing
        FROM   drivers.player_voyage_history
        WHERE  player_tag = v_rec.player_tag;

        -- Merge new entries with existing ones, then deduplicate by voyage_id
        -- keeping the entry with the highest voyage_id in case of collision.
        SELECT string_agg(entry, ',' ORDER BY (regexp_split_to_array(entry, '\|'))[1]::bigint DESC)
        INTO   v_merged
        FROM (
            SELECT DISTINCT ON ((regexp_split_to_array(entry, '\|'))[1])
                entry
            FROM unnest(
                string_to_array(
                    v_rec.new_entries ||
                    CASE
                        WHEN v_existing IS NOT NULL AND v_existing <> ''
                        THEN ',' || v_existing
                        ELSE ''
                    END,
                    ','
                )
            ) AS entry
            WHERE entry <> ''
            ORDER BY (regexp_split_to_array(entry, '\|'))[1] DESC
        ) deduped;

        -- Upsert consolidated history. The DELETE below only runs if this succeeds.
        INSERT INTO drivers.player_voyage_history (player_tag, history, updated_at)
        VALUES (v_rec.player_tag, COALESCE(v_merged, ''), NOW())
        ON CONFLICT (player_tag) DO UPDATE
            SET history    = EXCLUDED.history,
                updated_at = NOW();

        -- Remove the individual source rows that were just archived.
        DELETE FROM drivers.clan_voyage_contributions
        WHERE  player_tag = v_rec.player_tag
          AND  voyage_id  <> v_anchor_id
          AND  voyage_id  IN (
                  SELECT id FROM drivers.clan_voyage WHERE status = 'COMPLETED'
              );

        v_count := v_count + 1;
    END LOOP;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES (
            'VOYAGE_CONSOLIDATION',
            'INFO',
            'Consolidated voyage history for ' || v_count || ' players into player_voyage_history.'
        );
    END IF;
END;
$function$;



CREATE OR REPLACE FUNCTION drivers.purge_stale_voyage_history()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM drivers.player_voyage_history pvh
    WHERE NOT EXISTS (
        SELECT 1 FROM drivers.players p WHERE p.player_tag = pvh.player_tag
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES (
            'MAINTENANCE_PURGE',
            'INFO',
            'Purged ' || v_count || ' stale drivers.player_voyage_history rows (no matching player).'
        );
    END IF;
END;
$function$;



CREATE OR REPLACE FUNCTION drivers.get_rolling_voyage_performance(p_tag text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    RETURN (
        SELECT COALESCE(AVG(pct), 0)
        FROM (
            SELECT pct
            FROM (
                -- Source A: individual rows still present in the contributions table.
                SELECT
                    percentage_voyage_crowns                             AS pct,
                    voyage_id                                            AS sort_key
                FROM drivers.clan_voyage_contributions
                WHERE player_tag = p_tag

                UNION ALL

                -- Source B: entries parsed from the archived history string.
                -- Percentage is derived from the stored crowns and target fields.
                SELECT
                    LEAST(
                        ROUND(
                            (regexp_split_to_array(entry, '\|'))[2]::numeric
                            / NULLIF((regexp_split_to_array(entry, '\|'))[3]::numeric, 0)
                            * 100,
                            2
                        ),
                        100.0
                    )                                                    AS pct,
                    (regexp_split_to_array(entry, '\|'))[1]::bigint      AS sort_key
                FROM   drivers.player_voyage_history pvh
                CROSS  JOIN LATERAL unnest(string_to_array(pvh.history, ',')) AS entry
                WHERE  pvh.player_tag = p_tag
                  AND  pvh.history   <> ''
            ) all_voyages
            ORDER BY sort_key DESC
            LIMIT 3
        ) top3
    );
END;
$function$;



DROP VIEW IF EXISTS features.scoring_view CASCADE;
CREATE OR REPLACE VIEW features.scoring_view AS
 WITH
  voyage_history AS (
      SELECT
          c.player_tag,
          c.total_voyage_crowns                               AS crowns,
          v.target_crowns,
          v.end_at,
          v.id                                                AS voyage_id
        FROM drivers.clan_voyage_contributions c
          JOIN drivers.clan_voyage v ON v.id = c.voyage_id
       WHERE v.status = 'COMPLETED'::text

      UNION ALL

      SELECT
          pvh.player_tag,
          (regexp_split_to_array(entry, '\|'))[2]::integer               AS crowns,
          (regexp_split_to_array(entry, '\|'))[3]::integer               AS target_crowns,
          ((regexp_split_to_array(entry, '\|'))[4]::date)::timestamptz  AS end_at,
          (regexp_split_to_array(entry, '\|'))[1]::bigint                AS voyage_id
        FROM   drivers.player_voyage_history pvh
        CROSS  JOIN LATERAL unnest(string_to_array(pvh.history, ',')) AS entry
       WHERE   pvh.history <> ''
  ),
  voyage_ranked AS (
      SELECT
          player_tag,
          crowns,
          target_crowns,
          end_at,
          voyage_id,
          row_number() OVER (
              PARTITION BY player_tag ORDER BY end_at DESC
          ) AS recency_rank
        FROM voyage_history
  ),
  voyage_factuals AS (
      SELECT vh.player_tag,
             sum(
                 vh.crowns::numeric / NULLIF(vh.target_crowns::numeric, 0)
                 * GREATEST(0.5, 1.0 - (vh.recency_rank - 1)::numeric * 0.05)
             ) AS weighted_voyage_index,
             ( SELECT string_agg(
                           sub.crowns::text || ' ' || TO_CHAR(sub.end_at, 'YYYY-MM-DD'),
                           ' | '
                           ORDER BY sub.end_at DESC
                       )
               FROM (
                   SELECT crowns, end_at
                     FROM voyage_ranked vh_sub
                    WHERE vh_sub.player_tag = vh.player_tag
                    ORDER BY end_at DESC
                    LIMIT 52
               ) sub
             ) AS v_hist
        FROM voyage_ranked vh
       GROUP BY vh.player_tag
  ),

  war_weekly AS (
      SELECT wa.player_tag,
             wa.week_id,
             max(wa.fame)                      AS fame,
             avg(wa.decks_used) / 16.0 * 100.0 AS decks_pct,
             max(wa.recorded_at)               AS max_recorded
        FROM drivers.war_activity wa
       GROUP BY wa.player_tag, wa.week_id
  ),
  war_ranked AS (
      SELECT player_tag,
             week_id,
             fame,
             decks_pct,
             max_recorded,
             row_number() OVER (
                 PARTITION BY player_tag ORDER BY max_recorded DESC
             ) AS recency_rank
        FROM war_weekly
  ),
  war_factuals AS (
      SELECT player_tag,
             count(*)                                                                          AS recorded_weeks,
             substrate.weighted_avg(ARRAY_AGG(fame::numeric      ORDER BY recency_rank))               AS avg_fame,
             substrate.weighted_avg(ARRAY_AGG(decks_pct           ORDER BY recency_rank))               AS avg_war_rate,
             string_agg(fame::text || ' ' || week_id, ' | ' ORDER BY max_recorded DESC)       AS hist
        FROM war_ranked
       GROUP BY player_tag
  ),

  donation_weekly AS (
      SELECT player_tag,
             DATE_TRUNC('week', snapshot_date) AS week_start,
             MAX(donations)                    AS max_donations
        FROM drivers.member_snapshots
       GROUP BY player_tag, DATE_TRUNC('week', snapshot_date)
  ),
  donation_ranked AS (
      SELECT player_tag,
             week_start,
             max_donations,
             row_number() OVER (
                 PARTITION BY player_tag ORDER BY week_start DESC
             ) AS recency_rank
        FROM donation_weekly
  ),
  donation_factuals AS (
      SELECT player_tag,
             substrate.weighted_avg(ARRAY_AGG(max_donations::numeric ORDER BY recency_rank)) / 7.0
                 AS avg_daily_donations
        FROM donation_ranked
       GROUP BY player_tag
  ),

  benchmarking_context_base AS (
      SELECT
          ( SELECT COALESCE(NULLIF(max(w.recorded_weeks), 0), 12::bigint)
              FROM ( SELECT count(DISTINCT drivers.war_activity.week_id) AS recorded_weeks
                       FROM drivers.war_activity
                      GROUP BY drivers.war_activity.player_tag) w
          ) AS max_history_weeks,
          ( SELECT COALESCE(
                       percentile_cont(0.25) WITHIN GROUP (ORDER BY t.tenure_days::double precision),
                       14::double precision
                   )
              FROM ( SELECT GREATEST(0::numeric, EXTRACT(day FROM now() - drivers.members.joined_at))
                             AS tenure_days
                       FROM drivers.members
                      WHERE drivers.members.is_active = true) t
          ) AS rookie_window_days
  ),
  benchmarking_context AS (
      SELECT
          bcb.max_history_weeks,
          bcb.rookie_window_days,
          ( SELECT max(s.baseline_raw_score)
              FROM ( SELECT round(
                                COALESCE(m.week_fame, 0)::numeric  * 3.0
                                + COALESCE(wf2.avg_fame,     0::numeric) * 15.0
                                    * LEAST(1.0, COALESCE(wf2.recorded_weeks, 0)::numeric / bcb.max_history_weeks::numeric)
                                + COALESCE(df2.avg_daily_donations, m.donations::numeric / 7.0, 0::numeric) * 805.0
                                    * LEAST(1.0, COALESCE(wf2.recorded_weeks, 0)::numeric / bcb.max_history_weeks::numeric)
                                + m.trophies::numeric * 0.1
                                + COALESCE(wf2.avg_war_rate, 0::numeric) * 600.0
                                    * LEAST(1.0, COALESCE(wf2.recorded_weeks, 0)::numeric / bcb.max_history_weeks::numeric)
                            ) AS baseline_raw_score
                       FROM drivers.members m
                       LEFT JOIN war_factuals      wf2 ON m.player_tag = wf2.player_tag
                       LEFT JOIN donation_factuals df2 ON m.player_tag = df2.player_tag
                      WHERE m.is_active = true) s
          ) AS clan_max_baseline
        FROM benchmarking_context_base bcb
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
             GREATEST(0::numeric, EXTRACT(epoch FROM now() - m.joined_at)    / 86400.0) AS tenure_days,
             COALESCE(m.week_fame, 0)                                                    AS current_fame,
             COALESCE(wf.avg_fame,      0::numeric)                                     AS avg_fame,
             COALESCE(wf.avg_war_rate,  0::numeric)                                     AS war_rate,
             COALESCE(wf.recorded_weeks, 0::bigint)                                     AS recorded_weeks,
             COALESCE(wf.hist,          '-'::text)                                      AS hist,
             COALESCE(vf.v_hist,        '-'::text)                                      AS v_hist,
             COALESCE(vf.weighted_voyage_index, 0::numeric)                             AS voyage_index,
             COALESCE(df.avg_daily_donations, m.donations::numeric / 7.0, 0::numeric)  AS avg_daily_donations
        FROM drivers.members m
          LEFT JOIN war_factuals      wf ON m.player_tag = wf.player_tag
          LEFT JOIN voyage_factuals   vf ON m.player_tag = vf.player_tag
          LEFT JOIN donation_factuals df ON m.player_tag = df.player_tag
       WHERE m.is_active = true
  ),

  weighted_calculations AS (
      SELECT bs.*,
             LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric) AS stability_index,
             LEAST(1.10, 1.0 + bs.tenure_days / 30.0 * 0.01)                        AS loyalty_multiplier,
             round(bs.voyage_index * bc.clan_max_baseline)                           AS voyage_merit,
             round(
                 bs.current_fame::numeric   *   3.0
                 + bs.avg_fame              *  15.0 * LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)
                 + bs.avg_daily_donations   * 805.0 * LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)
                 + bs.trophies::numeric     *   0.1
                 + bs.war_rate             * 600.0 * LEAST(1.0, bs.recorded_weeks::numeric / bc.max_history_weeks::numeric)
             ) AS core_baseline_score,
             power(1.0 - 0.08, GREATEST(0::numeric, bs.days_inactive - 4.0)) AS decay_multiplier,
             bc.rookie_window_days
        FROM base_stats bs
          CROSS JOIN benchmarking_context bc
  ),

  clinical_layer AS (
      SELECT wc.*,
             round(
                 (wc.core_baseline_score + wc.voyage_merit)
                 * wc.loyalty_multiplier
                 * wc.decay_multiplier
             ) AS raw_performance_score,
             CASE
                 WHEN wc.tenure_days::double precision < wc.rookie_window_days
                     THEN (
                         wc.trophies::numeric * 1.0
                         + wc.donations::numeric * 0.1
                         + (wc.war_wins + 500)::numeric * 20.0
                     )::double precision
                     * power(
                         (wc.rookie_window_days - wc.tenure_days::double precision)
                         / wc.rookie_window_days,
                         2::numeric::double precision
                     )
                     / 5.0
                 ELSE 0::numeric::double precision
             END AS heritage_bonus
        FROM weighted_calculations wc
  ),

  final_scoring AS (
      SELECT *,
             raw_performance_score::double precision + heritage_bonus AS total_combined_score,
             max(raw_performance_score::double precision + heritage_bonus) OVER ()
                 AS global_max_score
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
    avg_daily_donations,
    CASE
        WHEN global_max_score > 0::numeric::double precision
            THEN round(total_combined_score / global_max_score * 100.0::double precision)
        ELSE 0::numeric::double precision
    END AS performance_score
   FROM final_scoring;

GRANT SELECT ON features.scoring_view TO authenticated, anon, service_role;



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
             s.hist,
             s.v_hist,
             s.avg_daily_donations,
             ltrim(m.player_tag, '#'::text) AS raw_tag
        FROM drivers.members m
          LEFT JOIN features.scoring_view s ON s.player_tag = m.player_tag
       WHERE m.is_active = true
         AND m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
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
    avg_daily_donations,
    'https://link.clashroyale.com/en?player='::text || raw_tag AS ingame_link,
    'https://royaleapi.com/player/'::text || raw_tag          AS royaleapi_link
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

DROP VIEW IF EXISTS features.voyage_contributions CASCADE;
CREATE OR REPLACE VIEW features.voyage_contributions AS
SELECT c.player_tag,
       s.name AS player_name,
       c.total_voyage_crowns,
       c.percentage_voyage_crowns,
       s.performance_score
  FROM drivers.clan_voyage_contributions c
  JOIN features.scoring_view s ON s.player_tag = c.player_tag
 WHERE c.voyage_id = (
     SELECT id FROM drivers.clan_voyage WHERE status = 'ACTIVE' LIMIT 1
 );

GRANT SELECT ON features.voyage_contributions TO authenticated, anon, service_role;



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
    PERFORM substrate.purge_stale_battles();
    PERFORM substrate.purge_worst_recruits();
    PERFORM substrate.purge_orphan_players();

    -- Safety-net: log any history rows that survived beyond the cascade.
    PERFORM drivers.purge_stale_voyage_history();

    PERFORM substrate.purge_recruit_ledger();
    PERFORM substrate.purge_stale_recruits();

    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Raw logs, ledgers, stale battles, orphans, and voyage history pruned. Voyages finalized.',
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
