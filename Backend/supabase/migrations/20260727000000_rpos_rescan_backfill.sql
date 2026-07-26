-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Migration: 20260727000000_rpos_rescan_backfill.sql
--
-- One-time backfill that forces the corpus onto the restructured RPoS formula
-- introduced by 20260726170000_rpos_formula_restructure.sql.
--
-- Why this is needed
-- ------------------
-- The formula change only takes effect for a recruit when the scanner next
-- re-profiles them, because raw_potential_score is computed in the Edge
-- Function and persisted, not derived on read. public.get_stale_recruits only
-- returns rows whose last_scan is older than 48 hours, and the scanner (every
-- 30 minutes via pg_cron) keeps the pool fresh enough that no row was ever
-- 48 hours stale. The corpus would therefore have taken ~48 hours to converge
-- on its own, one trickle at a time.
--
-- That interim state is not merely slow, it is wrong: features.headhunter_view
-- normalises potential_score against max_corpus_score, so a handful of
-- new-formula scores set the ceiling while the untouched majority are still
-- carrying old-formula values. The published 0-100 ranking mixes the two.
--
-- What this does
-- --------------
-- Backdates last_scan past the staleness threshold so the existing, already
-- tested rescan stage picks these rows up on its next few cycles. No scoring
-- logic lives here: the Edge Function remains the single source of truth for
-- the formula, and its own batching and API-key rotation still throttle the
-- work. This is a scheduling nudge, not a recalculation.
--
-- Scope is limited to rows still holding the win_rate default of 0, so the
-- recruits already re-profiled under the new formula are not re-fetched.
-- Blacklisted recruits (drivers.recruit_blacklist) are deliberately excluded:
-- get_stale_recruits does not cover that table, they are absent from
-- headhunter_view, and their entries expire within 30 days.
-- =============================================================================

UPDATE drivers.recruits
   SET last_scan = NOW() - INTERVAL '49 hours'
 WHERE status IN ('ACTIVE', 'BENCHED', 'QUEUE')
   AND win_rate = 0;
