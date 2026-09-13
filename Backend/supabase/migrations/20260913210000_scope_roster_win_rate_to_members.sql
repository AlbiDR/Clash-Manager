-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Scope the win_rate aggregate to the roster: battle_stats grouped the whole of
-- drivers.player_battles, every player the Headhunter has scanned, then joined
-- down to the ~50 active members, so roster_view cost scaled with the scouting
-- archive and intermittently hit the role statement timeout (0.37s to 2.9s for
-- the same 48 rows, measured 2026-09-13). Output is unchanged: NULLIF(0,0) and
-- NULLIF(NULL,0) are both NULL, so a member with no battles still reads 0.

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
         SELECT pb.player_tag,
                count(*) AS battle_count,
                count(*) FILTER (WHERE pb.win_status) AS wins
           FROM drivers.player_battles pb
          WHERE pb.player_tag IN (SELECT rs_tags.player_tag FROM roster_source rs_tags)
          GROUP BY pb.player_tag
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
