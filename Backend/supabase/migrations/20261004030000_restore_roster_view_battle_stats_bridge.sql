-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

-- `features.roster_view` is intentionally readable by the PWA's anon role, but
-- PostgreSQL still checks EXECUTE on a function used inside that view against
-- the querying role. The previous hardening migration correctly revoked the
-- generic drivers helper, then unintentionally made the public roster view
-- fail on every fresh data load. Do not re-grant that helper: it accepts
-- arbitrary player tags and lookback windows.
--
-- This zero-argument bridge exposes only the win-rate projection that
-- `roster_view` already publishes for active, valid roster members. It keeps
-- the generic helper private while allowing the view to remain readable.
CREATE OR REPLACE FUNCTION features.get_active_roster_win_rates()
RETURNS TABLE (
  player_tag text,
  win_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    stats.player_tag,
    COALESCE(stats.wins::numeric / NULLIF(stats.battles, 0)::numeric, 0::numeric)
  FROM drivers.get_player_battle_stats(
    30,
    ARRAY(
      SELECT members.player_tag
      FROM drivers.members AS members
      WHERE members.is_active
        AND members.player_tag ~ '^#[0289CGJLPQRUVY]+$'
    )
  ) AS stats(
    player_tag,
    battles,
    wins,
    fame_earned_sum,
    team_crowns_sum,
    opponent_crowns_sum
  );
$function$;

COMMENT ON FUNCTION features.get_active_roster_win_rates() IS
  'Publicly executable, zero-argument projection used only to supply the active roster win rates already exposed by features.roster_view. Keeps drivers.get_player_battle_stats private because that generic helper accepts caller-selected tags and windows.';

REVOKE ALL ON FUNCTION features.get_active_roster_win_rates()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION features.get_active_roster_win_rates()
  TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW features.roster_view AS
WITH roster_source AS (
  SELECT
    members.id,
    members.player_tag,
    members.player_name,
    members.role,
    members.exp_level,
    members.last_seen_at,
    members.updated_at,
    members.snapshot_date,
    members.trophies,
    members.donations,
    members.donations_received,
    members.joined_at,
    members.star_points,
    members.best_trophies,
    members.total_donations,
    members.war_day_wins,
    members.clan_cards_collected,
    members.challenge_max_wins,
    members.card_count,
    members.elite_wild_cards,
    members.war_wins,
    members.week_fame,
    members.decks_used_today,
    members.clan_rank,
    members.last_ingested_at,
    members.is_active,
    members.decks_used_weekly,
    members.current_clan_tag,
    scoring.avg_fame,
    scoring.war_rate,
    scoring.voyage_index,
    scoring.voyage_merit,
    scoring.raw_performance_score,
    scoring.performance_score,
    scoring.stability_index,
    scoring.days_inactive,
    scoring.tenure_days,
    scoring.hist,
    scoring.v_hist,
    scoring.avg_daily_donations,
    ltrim(members.player_tag, '#'::text) AS raw_tag
  FROM drivers.members AS members
  LEFT JOIN features.scoring_view AS scoring ON scoring.player_tag = members.player_tag
  WHERE members.is_active
    AND members.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text
), battle_stats AS (
  SELECT
    roster_win_rates.player_tag,
    roster_win_rates.win_rate
  FROM features.get_active_roster_win_rates() AS roster_win_rates
)
SELECT
  roster.player_name,
  roster.role,
  roster.player_tag,
  roster.clan_rank,
  roster.trophies,
  roster.exp_level,
  roster.donations,
  roster.donations_received,
  roster.decks_used_today,
  roster.decks_used_weekly,
  roster.week_fame,
  roster.avg_fame,
  roster.voyage_index,
  roster.voyage_merit,
  COALESCE(roster.war_rate, 0::numeric) AS war_participation,
  roster.raw_performance_score,
  roster.performance_score,
  roster.stability_index,
  substrate.format_last_seen(roster.days_inactive) AS last_seen_label,
  substrate.format_tenure(roster.tenure_days) AS tenure_label,
  roster.last_seen_at,
  roster.last_ingested_at,
  roster.tenure_days,
  roster.hist,
  roster.v_hist,
  roster.avg_daily_donations,
  'https://link.clashroyale.com/en?player='::text || roster.raw_tag AS ingame_link,
  'https://royaleapi.com/player/'::text || roster.raw_tag AS royaleapi_link,
  roster.war_wins,
  COALESCE(battle_stats.win_rate, 0::numeric) AS win_rate
FROM roster_source AS roster
LEFT JOIN battle_stats ON battle_stats.player_tag = roster.player_tag
ORDER BY roster.raw_performance_score DESC NULLS LAST, roster.performance_score DESC NULLS LAST;

GRANT SELECT ON features.roster_view TO anon, authenticated, service_role;

COMMIT;
