-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260726170000_rpos_formula_restructure.sql
--
-- Companion database migration for the RPoS (Raw Potential Score) formula
-- restructure. See rpos-formula-restructure-SSOT.md Sections 5, 5a and 8 for
-- the full research trail and decisions this migration implements.
--
--   1. Adds drivers.recruits.win_rate -- the weighted win rate is now a
--      first-class displayed metric on the recruit card (replacing the War
--      Wins tile), so it is persisted the same way raw_potential_score
--      already is, computed once at profiler/rescan time.
--   2. Fixes the heritage_bonus formula inside features.scoring_view, which
--      duplicated the OLD, buggy RPoS formula
--      `(war_wins + 500) * 20.0` as a pre-join quality proxy. The `+500`
--      offset was a bug (see SSOT Section 2): warDayWins/war_wins froze at 0
--      for every player who started after Clan Wars 1 retired on 2020-08-31,
--      turning the offset into a hidden, universal `+10,000` inflation with
--      zero differentiating signal. This migration replaces it with the same
--      no-offset legacy-war micro-bonus now used by calculateRpos() in
--      _shared/utils.ts: `legacy_war_wins * RPOS_LEGACY_WAR_WEIGHT`.
--   3. Threads win_rate through features.headhunter_view -- the view the
--      frontend actually reads (SELECT * against it via SupabaseClient.ts /
--      RecruitClient.ts). Adding the column to drivers.recruits alone is not
--      sufficient: the view's CTEs project an explicit column list, so
--      win_rate would otherwise never reach the API response and the recruit
--      card's Win Rate tile would always read 0.
--   4. Fixes public.sync_recruits(p_recruits jsonb) -- the only RPC that
--      writes to drivers.recruits -- to include win_rate in its INSERT column
--      list, SELECT values, ON CONFLICT UPDATE SET, and write-optimization
--      WHERE clause. Without this, profiler.ts/rescan.ts compute and send
--      win_rate in every payload, but it is silently dropped and the column
--      stays at its DEFAULT 0.0 forever.
--
-- drivers.recruit_blacklist needs NO schema change: it already carries a
-- flexible `snapshot jsonb` column ("Full JSONB snapshot of player stats ...
-- for historical review") that can hold win_rate alongside the other
-- historical fields without a new column (SSOT Section 5a).
-- =============================================================================


-- =============================================================================
-- Phase 1: Add drivers.recruits.win_rate
--
-- Precomputed weighted win rate (performanceWins / battleCount, with
-- three-crown wins weighted at RPOS_THREE_CROWN_MULT -- see
-- calculateWeightedWinRate() in _shared/utils.ts), persisted at
-- profiler/rescan time, the same compute stage that already produces
-- raw_potential_score. Deriving it later by inverting raw_potential_score was
-- considered and rejected: inverting a multi-term formula to recover one
-- component is fragile and breaks the moment any weight changes (SSOT
-- Section 5a).
-- =============================================================================

ALTER TABLE drivers.recruits
    ADD COLUMN win_rate numeric DEFAULT 0.0;

-- An inline `/* ... */` token on the column definition itself is discarded by
-- Postgres at parse time and never reaches pg_description -- the same gap
-- 20260726180000_fix_raw_potential_score_column_comment.sql exists to correct
-- for raw_potential_score. A real COMMENT ON COLUMN is used here instead so
-- the documentation actually lands as DB metadata from the start.
COMMENT ON COLUMN drivers.recruits.win_rate IS 'Precomputed weighted win rate (wins/battleCount, three-crown wins weighted at RPOS_THREE_CROWN_MULT), persisted at profiler/rescan time for display on the recruit card. See calculateWeightedWinRate() in _shared/utils.ts.';


-- =============================================================================
-- Phase 2: Fix the heritage_bonus formula in features.scoring_view
--
-- Authoritative live source: the CREATE OR REPLACE VIEW for features.scoring_view
-- inside 20260705030000_voyage_history_pruning.sql. That file's timestamp is
-- later than 20260531232406_master_migration.sql's own scoring_view definition,
-- so its body is what is actually live in the database today -- the master
-- migration's CREATE OR REPLACE VIEW for this same view was superseded the
-- moment 20260705030000 ran. The two definitions are otherwise identical; only
-- the heritage_bonus CASE expression below is being changed.
--
-- Every other CTE (voyage_history, voyage_ranked, voyage_factuals, war_weekly,
-- war_ranked, war_factuals, donation_weekly, donation_ranked, donation_factuals,
-- benchmarking_context_base, benchmarking_context, base_stats,
-- weighted_calculations, final_scoring) and the final SELECT are reproduced
-- verbatim, unchanged, from that authoritative definition.
--
-- The output column list, names, order and types are identical to the live
-- view, so CREATE OR REPLACE VIEW is used directly -- no DROP ... CASCADE is
-- needed, and features.roster_view / features.voyage_contributions (which
-- both read FROM features.scoring_view) are left untouched.
--
-- ---------------------------------------------------------------------------
-- What heritage_bonus approximates, and why only a SUBSET of the new RPoS
-- formula is replicated here (not the full formula):
--
-- heritage_bonus is a temporary bonus applied only while a member is still
-- within the clan's rookie_window_days, meant to approximate the member's
-- pre-join recruit-pool quality using an old snapshot of the RPoS formula. The
-- full new RPoS formula (SSOT Section 5) adds a weighted-win-rate term
-- (wins/battleCount with a three-crown multiplier), a capped challenge-card
-- micro-bonus, and a Grand Challenge bonus derived from the win-rate weight.
-- None of those can be reproduced here: they all require raw CR API profile
-- fields (wins, battleCount, threeCrownWins, challengeCardsWon,
-- challengeMaxWins) that are fetched ONLY during headhunter recruit scanning
-- (profiler.ts / rescan.ts) and, per SSOT Section 5a/10, are explicitly kept
-- as compute-time-only inputs -- never persisted to drivers.recruits (aside
-- from the new win_rate column added in Phase 1) and never persisted to
-- drivers.members at all. drivers.members does carry columns named
-- war_day_wins, total_donations and challenge_max_wins that look like they
-- could supply this data, but none of them are ever written by any ingestion
-- trigger or Edge Function in this codebase (verified by inspecting
-- substrate.shred_clan_members() and every other INSERT/UPDATE against
-- drivers.members) -- they sit permanently at their DEFAULT 0, so even if
-- referenced here they would contribute no real signal today.
--
-- What IS available on this view's base_stats/weighted_calculations rows is
-- exactly what the OLD formula already used: wc.trophies, wc.donations and
-- wc.war_wins. So the reasonable equivalent subset is: keep the trophy and
-- donation terms unchanged, and fix only the legacy-war term to match the new
-- calculateRpos() kernel (no +500 offset, weight renamed/repurposed to
-- RPOS_LEGACY_WAR_WEIGHT). This is a narrow, faithful fix of the duplicated
-- bug -- not a reintroduction of the full new formula, which this view's data
-- model cannot support.
--
-- Known, pre-existing, OUT-OF-SCOPE caveat (not changed by this migration):
-- wc.donations here resolves to drivers.members.donations, the WEEKLY
-- donation counter (resets weekly, observed range roughly 0-1,000) -- NOT the
-- lifetime totalDonations that RPOS_DONATION_WEIGHT (0.1) is calibrated
-- against in the TypeScript kernel (lifetime range roughly 20,000-350,000,
-- see SSOT Section 1 "Critical input mapping"). This mismatch predates this
-- migration (it is untouched from the original heritage_bonus formula) and is
-- outside the scope of the SQL migration note this migration implements,
-- which only calls out the war_wins/+500/*20 duplicate. Flagged here for a
-- future, separate cleanup pass.
-- =============================================================================

CREATE OR REPLACE VIEW features.scoring_view AS
 WITH
  -- -- Voyage pipeline -----------------------------------------------------------
  voyage_history AS (
      -- Source A: individual rows still in the live contributions table.
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

      -- Source B: entries parsed from the consolidated history archive.
      -- Format per entry: voyage_id|crowns|target_crowns|end_date (YYYY-MM-DD).
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

  -- -- War pipeline: recency-decayed (replaces flat AVG factual_logs) ----------
  -- Level 1: aggregate to one row per (player, war section week)
  war_weekly AS (
      SELECT wa.player_tag,
             wa.week_id,
             max(wa.fame)                      AS fame,
             avg(wa.decks_used) / 16.0 * 100.0 AS decks_pct,
             max(wa.recorded_at)               AS max_recorded
        FROM drivers.war_activity wa
       GROUP BY wa.player_tag, wa.week_id
  ),
  -- Level 2: assign recency rank (1 = most recent section)
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
  -- Level 3: compute decayed weighted averages and display history
  war_factuals AS (
      SELECT player_tag,
             count(*)                                                                          AS recorded_weeks,
             substrate.weighted_avg(ARRAY_AGG(fame::numeric      ORDER BY recency_rank))               AS avg_fame,
             substrate.weighted_avg(ARRAY_AGG(decks_pct           ORDER BY recency_rank))               AS avg_war_rate,
             string_agg(fame::text || ' ' || week_id, ' | ' ORDER BY max_recorded DESC)       AS hist
        FROM war_ranked
       GROUP BY player_tag
  ),

  -- -- Donation pipeline: recency-decayed weekly peaks expressed as daily avg --
  -- Level 1: extract the weekly donation peak from daily snapshots
  donation_weekly AS (
      SELECT player_tag,
             DATE_TRUNC('week', snapshot_date) AS week_start,
             MAX(donations)                    AS max_donations
        FROM drivers.member_snapshots
       GROUP BY player_tag, DATE_TRUNC('week', snapshot_date)
  ),
  -- Level 2: assign recency rank (1 = most recent calendar week)
  donation_ranked AS (
      SELECT player_tag,
             week_start,
             max_donations,
             row_number() OVER (
                 PARTITION BY player_tag ORDER BY week_start DESC
             ) AS recency_rank
        FROM donation_weekly
  ),
  -- Level 3: compute decayed weighted average, divide by 7 for daily rate
  donation_factuals AS (
      SELECT player_tag,
             substrate.weighted_avg(ARRAY_AGG(max_donations::numeric ORDER BY recency_rank)) / 7.0
                 AS avg_daily_donations
        FROM donation_ranked
       GROUP BY player_tag
  ),

  -- -- Benchmarking context: clan-wide maximum baseline ------------------------
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

  -- -- Base stats: per-player resolved values -----------------------------------
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
             -- Recency-decayed daily avg; falls back to live weekly / 7 for members
             -- with no snapshot history (cold-start guard)
             COALESCE(df.avg_daily_donations, m.donations::numeric / 7.0, 0::numeric)  AS avg_daily_donations
        FROM drivers.members m
          LEFT JOIN war_factuals      wf ON m.player_tag = wf.player_tag
          LEFT JOIN voyage_factuals   vf ON m.player_tag = vf.player_tag
          LEFT JOIN donation_factuals df ON m.player_tag = df.player_tag
       WHERE m.is_active = true
  ),

  -- -- Weighted calculations ----------------------------------------------------
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

  -- -- Clinical layer: raw performance + heritage bonus ------------------------
  --
  -- heritage_bonus: pre-join recruit-pool quality proxy for members still
  -- inside rookie_window_days of joining. RPoS-consistent subset (see the
  -- Phase 2 header comment above for why the win-rate/challenge-card/GC terms
  -- of the new formula are not, and cannot be, reproduced here):
  --
  --   trophies    * 1.0   -- RPOS_TROPHY_WEIGHT       = 1.0  (unchanged)
  --   donations   * 0.1   -- RPOS_DONATION_WEIGHT      = 0.1  (unchanged; see
  --                           the WEEKLY-vs-lifetime caveat above -- untouched,
  --                           out of scope for this fix)
  --   war_wins    * 10.0  -- RPOS_LEGACY_WAR_WEIGHT    = 10   (FIXED: no more
  --                           `+ 500` offset, no more `* 20.0` weight -- that
  --                           was the hidden +10,000 bug this migration removes;
  --                           zero war_wins now contributes exactly zero, same
  --                           as the corrected calculateRpos() kernel)
  --
  -- The `power(...) / 5.0` tenure-decay envelope wrapping the bracket is a
  -- separate, pre-existing rookie-window decay curve, unrelated to any RPoS
  -- config.ts constant -- reproduced verbatim, not part of this fix.
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
                         wc.trophies::numeric * 1.0     -- RPOS_TROPHY_WEIGHT = 1.0 (trophy weight coefficient)
                         + wc.donations::numeric * 0.1   -- RPOS_DONATION_WEIGHT = 0.1 (donation weight coefficient; unchanged, see WEEKLY-vs-lifetime caveat above)
                         + wc.war_wins::numeric * 10.0   -- RPOS_LEGACY_WAR_WEIGHT = 10 (legacy CW1 war win micro-bonus; no +500 offset, no *20 -- bug removed)
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

  -- -- Final scoring: normalize to 0-100 PeS ------------------------------------
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


-- =============================================================================
-- Phase 3: Thread win_rate through features.headhunter_view
--
-- Authoritative live source: the CREATE OR REPLACE VIEW for
-- features.headhunter_view inside 20260531232406_master_migration.sql -- it is
-- never redefined by any later migration (grep-confirmed), so that body is
-- what is actually live today. Reproduced verbatim below, with win_rate added
-- in the three places a view column must be threaded through: the
-- base_calculations CTE (source column), the scoring_layer CTE (pass-through),
-- and the final SELECT (exposed column). No other column, join, filter, or
-- ordering is changed.
-- =============================================================================

CREATE OR REPLACE VIEW features.headhunter_view AS
WITH benchmarking_context AS (
         SELECT GREATEST(COALESCE(( SELECT max(drivers.recruits.raw_potential_score) AS max
                   FROM drivers.recruits
                  WHERE (drivers.recruits.status = 'ACTIVE'::drivers.recruit_status)), (0)::numeric), COALESCE(( SELECT max(drivers.recruit_blacklist.raw_potential_score) AS max
                   FROM drivers.recruit_blacklist
                  WHERE (drivers.recruit_blacklist.expires_at > now())), (0)::numeric), COALESCE(( SELECT max(drivers.recruits.raw_potential_score) AS max
                   FROM drivers.recruits), (1)::numeric)) AS max_corpus_score
        ), heritage_context AS (
         SELECT drivers.heritage_ledger.player_tag,
            drivers.heritage_ledger.max_pes,
            drivers.heritage_ledger.tenure_days,
            (drivers.heritage_ledger.last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
           FROM drivers.heritage_ledger
        ), base_calculations AS (
         SELECT r.player_name,
            r.player_tag,
            r.trophies,
            r.donations,
            r.cards,
            r.war_wins,
            r.raw_potential_score,
            r.found_date,
            r.last_scan AS last_seen_at,
            ((EXTRACT(epoch FROM (now() - r.found_date)))::integer / 60) AS raw_longevity_mins,
            (h.player_tag IS NOT NULL) AS is_former_member,
            COALESCE((h.is_fresh AND (h.max_pes >= 80)), false) AS has_blessing,
            h.tenure_days AS heritage_tenure_days,
            r.win_rate
           FROM (drivers.recruits r
             LEFT JOIN heritage_context h ON ((h.player_tag = r.player_tag)))
          WHERE ((r.status = 'ACTIVE'::drivers.recruit_status) AND (NOT (EXISTS ( SELECT 1
                   FROM drivers.recruit_blacklist bl
                  WHERE (bl.player_tag = r.player_tag)))) AND (r.trophies > 0) AND (r.raw_potential_score > (0)::numeric))
        ), scoring_layer AS (
         SELECT bc.max_corpus_score,
            b.player_name,
            b.player_tag,
            b.trophies,
            b.donations,
            b.cards,
            b.war_wins,
            b.raw_potential_score,
            b.found_date,
            b.last_seen_at,
            b.raw_longevity_mins,
            b.is_former_member,
            b.has_blessing,
            b.heritage_tenure_days,
            LEAST((100)::numeric, round((((b.raw_potential_score *
                CASE
                    WHEN b.has_blessing THEN 1.05
                    ELSE 1.0
                END) / bc.max_corpus_score) * (100)::numeric))) AS potential_score,
            b.win_rate
           FROM (base_calculations b
             CROSS JOIN benchmarking_context bc)
        )
 SELECT player_name,
    player_tag,
    trophies,
    donations,
    cards,
    war_wins,
    raw_potential_score,
    potential_score,
    substrate.format_longevity(raw_longevity_mins) AS longevity_label,
    raw_longevity_mins AS longevity,
    substrate.format_tenure((heritage_tenure_days)::numeric) AS tenure_label,
    heritage_tenure_days AS tenure_days,
        CASE
            WHEN (potential_score >= (90)::numeric) THEN 'ELITE'::text
            WHEN (potential_score >= (75)::numeric) THEN 'HIGH'::text
            ELSE 'MID'::text
        END AS tier,
        CASE
            WHEN has_blessing THEN 'RETURNING_VETERAN'::text
            WHEN is_former_member THEN 'FORMER_MEMBER'::text
            ELSE 'NEW_CANDIDATE'::text
        END AS heritage_status,
    has_blessing AS has_heritage_blessing,
    last_seen_at,
    found_date,
    ('https://link.clashroyale.com/en?player='::text || ltrim(player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(player_tag, '#'::text)) AS royaleapi_link,
    win_rate
   FROM scoring_layer
  ORDER BY raw_potential_score DESC;


-- =============================================================================
-- Phase 4: Persist win_rate through public.sync_recruits(p_recruits jsonb)
--
-- Authoritative live source: 20260531232406_master_migration.sql, never
-- redefined since (grep-confirmed) -- this is the ONLY function that writes to
-- drivers.recruits. Reproduced verbatim below with win_rate added to the
-- INSERT column list, the SELECT value list (same COALESCE-to-zero pattern
-- used for the other numeric columns), the ON CONFLICT UPDATE SET clause, and
-- the write-optimization WHERE guard. Part A (drivers.players upsert) is
-- unchanged and omitted from the diff reasoning below since it never touched
-- recruit metrics.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    -- A. Ensure all players exist in the universal registry (FK Safety)
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name = EXCLUDED.player_name,
        updated_at  = NOW();

    -- B. Upsert recruit metrics with strict payload enforcement and write optimization
    INSERT INTO drivers.recruits (
        player_tag,
        player_name,
        trophies,
        donations,
        war_wins,
        win_rate,
        cards,
        raw_potential_score,
        source,
        status,
        last_scan
    )
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT,
        COALESCE((val->>'trophies')::INTEGER, 0),
        COALESCE((val->>'donations')::INTEGER, 0),
        COALESCE((val->>'war_wins')::INTEGER, 0),
        COALESCE((val->>'win_rate')::NUMERIC, 0.0),
        COALESCE((val->>'cards')::INTEGER, 0),
        (val->>'raw_potential_score')::NUMERIC,
        (val->>'source')::TEXT,
        COALESCE((val->>'status')::drivers.recruit_status, 'ACTIVE'::drivers.recruit_status),
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    WHERE (val->>'raw_potential_score') IS NOT NULL
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name         = EXCLUDED.player_name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        war_wins            = EXCLUDED.war_wins,
        win_rate            = EXCLUDED.win_rate,
        cards               = EXCLUDED.cards,
        raw_potential_score = EXCLUDED.raw_potential_score,
        source              = EXCLUDED.source,
        status              = EXCLUDED.status,
        last_scan           = NOW()
    WHERE
        drivers.recruits.trophies IS DISTINCT FROM EXCLUDED.trophies OR
        drivers.recruits.donations IS DISTINCT FROM EXCLUDED.donations OR
        drivers.recruits.war_wins IS DISTINCT FROM EXCLUDED.war_wins OR
        drivers.recruits.win_rate IS DISTINCT FROM EXCLUDED.win_rate OR
        drivers.recruits.cards IS DISTINCT FROM EXCLUDED.cards OR
        drivers.recruits.raw_potential_score IS DISTINCT FROM EXCLUDED.raw_potential_score OR
        drivers.recruits.status IS DISTINCT FROM EXCLUDED.status OR
        drivers.recruits.last_scan < NOW() - INTERVAL '15 minutes';
END;
$function$;
