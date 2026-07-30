-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260801000000_member_battle_log_backfill.sql
--
-- Forces a battle log re-ingestion pass for every active clan member who has
-- no rows in drivers.player_battles. This is the primary fix for members
-- displaying a 0% win rate on the Member Card despite having played battles.
--
-- Root cause (documented in win-rate-recalculation-SSOT.md Section 2.1):
-- features.roster_view computes win_rate via a LEFT JOIN against
-- drivers.player_battles. When no rows exist for a member, COALESCE returns
-- 0 -- identical to a genuine zero-win player, making the condition invisible.
-- Affected populations:
--   - Members who joined between two successive deep-depth.ts cron runs.
--   - Members whose battle log fetch failed silently (rate limit, API error,
--     Valibot validation rejection).
--   - Members who play very infrequently and whose battles fall outside the
--     rolling 100-battle / 1-month window.
--
-- Fix strategy:
-- Set next_poll_at = NULL for affected members. Per the column comment on
-- drivers.members.next_poll_at, NULL means "poll immediately on the next
-- ingestion run." The get_ingestion_targets RPC used by deep-depth.ts selects
-- members WHERE next_poll_at IS NULL OR next_poll_at <= NOW(), so these
-- members are fetched on the very next ingest-royale-data invocation (pg_cron
-- every 30 minutes).
--
-- Why not UPDATE drivers.members.win_rate directly:
-- drivers.members has no win_rate column. Win rate is computed on read from
-- drivers.player_battles inside features.roster_view. This is correct
-- architecture -- the source of truth lives in the event-sourced table.
--
-- Scope:
-- Targets only is_active = true members with zero rows in player_battles.
-- Members who already have battle log data, even if win_rate reads 0 due to
-- genuine losses, are not affected.
--
-- Verification (run after the next ingest-royale-data cron fires):
--   SELECT count(*) FROM features.roster_view WHERE win_rate = 0;
-- The count should drop significantly. Residual zeros are genuine cases
-- (members who truly have no competitive battles in the rolling window).
-- =============================================================================

UPDATE drivers.members
   SET next_poll_at = NULL
 WHERE is_active = true
   AND player_tag NOT IN (
       SELECT DISTINCT player_tag FROM drivers.player_battles
   );
