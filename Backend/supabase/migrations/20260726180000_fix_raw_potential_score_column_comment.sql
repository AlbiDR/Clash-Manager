-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260726180000_fix_raw_potential_score_column_comment.sql
--
-- Follow-up to 20260726170000_rpos_formula_restructure.sql. That migration
-- restructured the RPoS formula and calculateRpos() kernel in
-- _shared/utils.ts, but did not touch the inline column-doc comment on
-- drivers.recruits.raw_potential_score, which was set in the already-applied
-- 20260531232406_master_migration.sql and still describes the OLD, buggy
-- formula verbatim: "Trophies(1x) + Donations(0.1x) + (WarWins+500)*20".
--
-- Since master_migration.sql is a historical, already-applied migration, it
-- is not hand-edited retroactively. Instead this migration issues a
-- COMMENT ON COLUMN to bring the schema's own documentation in line with the
-- corrected calculateRpos() kernel (see _shared/utils.ts / _shared/config.ts):
--
--   trophies * RPOS_TROPHY_WEIGHT (1.0)
--   + lifetime_donations * RPOS_DONATION_WEIGHT (0.1)
--   + weightedWinRate * winRateWeight, where winRateWeight is
--       (trophies * RPOS_TROPHY_WEIGHT) * RPOS_WIN_RATE_RATIO (0.35)
--   + legacy_war_wins * RPOS_LEGACY_WAR_WEIGHT (10), no +500 offset
--   + min(challenge_cards_won, RPOS_CHALLENGE_CARD_CAP) * RPOS_CHALLENGE_CARD_WEIGHT (0.1)
--   + grandChallengeBonus (winRateWeight * RPOS_GC_BONUS_RATIO (0.4) when
--       challenge_max_wins >= GRAND_CHALLENGE_WIN_THRESHOLD (12), else 0)
-- =============================================================================

COMMENT ON COLUMN drivers.recruits.raw_potential_score IS 'Authoritative merit score (RPoS) calculated by the scoring kernel (calculateRpos() in _shared/utils.ts): trophies*RPOS_TROPHY_WEIGHT + lifetime_donations*RPOS_DONATION_WEIGHT + weightedWinRate*winRateWeight + legacy_war_wins*RPOS_LEGACY_WAR_WEIGHT + min(challenge_cards_won, RPOS_CHALLENGE_CARD_CAP)*RPOS_CHALLENGE_CARD_WEIGHT + grandChallengeBonus. No +500/*20 offset (removed bug).';
