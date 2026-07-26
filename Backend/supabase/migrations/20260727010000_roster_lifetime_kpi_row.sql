-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260727010000_roster_lifetime_kpi_row.sql
--
-- Companion database migration for the Member Card "lifetime KPIs" row
-- (RPeS + Legacy War Wins), the deferred Section 5a follow-up to the RPoS
-- formula restructure (20260726170000_rpos_formula_restructure.sql).
--
-- RPeS is already exposed by features.roster_view as raw_performance_score,
-- so no scoring change is needed for it. Legacy War Wins is not: drivers.
-- members.war_wins is already joined into roster_view's roster_source CTE
-- (used internally for stability_index et al.), but was never threaded
-- through to the view's final SELECT, so the column has never left the
-- database.
--
-- Appended at the END of the final SELECT list -- CREATE OR REPLACE VIEW
-- can only add columns there; inserting one earlier shifts every subsequent
-- column's ordinal position and Postgres rejects it (SQLSTATE 42P16, hit
-- and documented while shipping 20260726170000_rpos_formula_restructure.sql).
-- =============================================================================

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
           FROM (drivers.members m
             LEFT JOIN features.scoring_view s ON ((s.player_tag = m.player_tag)))
          WHERE ((m.is_active = true) AND (m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text))
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
    COALESCE(war_rate, (0)::numeric) AS war_participation,
    raw_performance_score,
    performance_score,
    stability_index,
    substrate.format_last_seen(days_inactive) AS last_seen_label,
    substrate.format_tenure((tenure_days)::numeric) AS tenure_label,
    last_seen_at,
    last_ingested_at,
    tenure_days,
    hist,
    v_hist,
    avg_daily_donations,
    ('https://link.clashroyale.com/en?player='::text || raw_tag) AS ingame_link,
    ('https://royaleapi.com/player/'::text || raw_tag) AS royaleapi_link,
    war_wins
   FROM roster_source
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

COMMENT ON COLUMN features.roster_view.war_wins IS
  'Legacy Clan War 1 day-wins (drivers.members.war_wins). Frozen at each
   member''s value as of 2020-08-31 since CW1 retired; displayed as a
   lifetime/heritage KPI on the Member Card, not an active performance
   signal. See RPoS formula restructure SSOT Section 2 for why this same
   field is deliberately excluded from the scoring formula.';

-- No GRANT here: CREATE OR REPLACE VIEW preserves the existing privileges
-- features.roster_view already holds from the master migration.
