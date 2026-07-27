-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260727020000_roster_win_rate_lifetime_kpi.sql
--
-- Corrects the Member Card lifetime-KPI row shipped in
-- 20260727010000_roster_lifetime_kpi_row.sql. That migration added
-- war_wins, but drivers.members.war_wins has never been populated by any
-- ingestion pipeline (substrate.shred_clan_members only writes player_tag,
-- name, role, exp_level, trophies, donations, donations_received, clan_rank,
-- last_seen_at, is_active). It reads 0 for every member regardless of their
-- real Clash Royale history, which is worse than merely stale -- it is
-- confidently wrong for members who do have real legacy war wins.
--
-- Recruits already show a Win Rate tile (from the RPoS restructure), sourced
-- from the Royale API player profile's lifetime wins/battleCount/
-- threeCrownWins. Members have no equivalent lifetime field ingested, but
-- deep-depth.ts already fetches and stores each member's recent battle log
-- in drivers.player_battles (rolling ~100 battles / 1 month, whichever is
-- smaller -- see ingest_player_battles). That data is real and populated.
--
-- Deliberately a PLAIN win rate (wins / battle_count), not the three-crown-
-- weighted formula recruits use: player_battles.team_crowns is on a
-- different, inflated scale for riverRaceDuel rows (summed round crowns,
-- see ingest_player_battles), so a flat "= 3" three-crown check would silently
-- misclassify duel wins. Not worth the complexity for a supplementary tile.
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
        ),
     battle_stats AS (
         SELECT player_tag,
                count(*) AS battle_count,
                count(*) FILTER (WHERE win_status) AS wins
           FROM drivers.player_battles
          GROUP BY player_tag
        )
 SELECT player_name,
    role,
    rs.player_tag,
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
    war_wins,
    COALESCE(bs.wins::numeric / NULLIF(bs.battle_count, 0)::numeric, 0::numeric) AS win_rate
   FROM roster_source rs
     LEFT JOIN battle_stats bs ON (bs.player_tag = rs.player_tag)
  ORDER BY raw_performance_score DESC NULLS LAST, performance_score DESC NULLS LAST;

COMMENT ON COLUMN features.roster_view.win_rate IS
  'Plain win rate (wins / battle_count) over the member''s recent battle log
   (drivers.player_battles, a rolling ~100-battle / 1-month window, not
   lifetime). Displayed as a lifetime/heritage KPI on the Member Card
   alongside RPeS. Superseded war_wins there, which was never populated by
   the ingestion pipeline and always read 0.';

-- No GRANT here: CREATE OR REPLACE VIEW preserves the existing privileges
-- features.roster_view already holds from the master migration.
