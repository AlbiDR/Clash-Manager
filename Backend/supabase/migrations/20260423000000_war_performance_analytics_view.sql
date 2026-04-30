-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Create features.war_performance_analytics_view
-- Extracts clinical performance metrics from raw JSON war logs for tracked clans.

CREATE OR REPLACE VIEW features.war_performance_analytics_view AS
WITH latest_logs AS (
    -- Deduplicate snapshots to get the latest state of each war week
    SELECT DISTINCT ON (item->>'seasonId', item->>'sectionIndex', standing->'clan'->>'tag')
        item->>'seasonId' as season_id,
        item->>'sectionIndex' as section_index,
        standing->'clan'->>'name' as clan_name,
        standing->'clan'->>'tag' as clan_tag,
        (standing->>'rank')::INT as rank,
        (standing->'clan'->>'fame')::INT as total_fame,
        standing->'clan'->'participants' as participants
    FROM substrate.raw_war_log,
         jsonb_array_elements(payload->'items') item,
         jsonb_array_elements(item->'standings') standing
    WHERE standing->'clan'->>'tag' IN (SELECT clan_tag FROM drivers.clans)
    ORDER BY item->>'seasonId', item->>'sectionIndex', standing->'clan'->>'tag', ingested_at DESC
),
player_stats AS (
    -- Flatten participants for metric calculation
    SELECT 
        season_id,
        section_index,
        clan_tag,
        clan_name,
        rank,
        total_fame,
        p->>'tag' as player_tag,
        p->>'name' as player_name,
        (p->>'fame')::INT as player_fame,
        (p->>'decksUsed')::INT as decks_used
    FROM latest_logs,
         jsonb_array_elements(participants) p
    WHERE (p->>'fame')::INT > 0
),
weekly_summary AS (
    -- Aggregate metrics per week
    SELECT 
        season_id,
        section_index,
        clan_tag,
        clan_name,
        rank,
        total_fame,
        count(player_tag) as active_participants,
        round(avg(decks_used), 2) as avg_decks_per_active,
        (array_agg(player_name || ' (' || player_fame || ')' ORDER BY player_fame DESC))[1:5] as top_contributors
    FROM player_stats
    GROUP BY season_id, section_index, clan_tag, clan_name, rank, total_fame
)
SELECT 
    season_id,
    section_index,
    clan_name,
    clan_tag,
    rank,
    total_fame,
    active_participants,
    avg_decks_per_active,
    top_contributors,
    (season_id || '-' || (section_index::INT + 1)) as week_label
FROM weekly_summary
ORDER BY season_id::INT DESC, section_index::INT DESC;

COMMENT ON VIEW features.war_performance_analytics_view IS 'Clinical analytics view providing historical performance trends for tracked clans, shredded from substrate.raw_war_log.';
