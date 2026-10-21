<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Bounded recruit battle polling

The old `get_ingestion_targets()` placed `LIMIT 50` after `jsonb_agg`, which
limited the single aggregate result instead of its input. It could return every
active recruit. Migration `20261021195547_bound_recruit_battle_poll_targets.sql`
moves the limit inside the recruit selection and adds an attempt cursor,
`drivers.recruits.last_battle_poll_at`, initially null.

`substrate.config.RECRUIT_BATTLE_POLL_BATCH_SIZE` defaults to 50, the existing
intended operational ceiling. Both selection and acknowledgment require an
integer from 1 through 50. Missing, malformed, overflowing or out-of-range
configuration raises SQLSTATE 22023. Existing config values are not overwritten.
The smallest setting is 1; disabling the pipeline belongs to its scheduler.

Selection orders active recruits by oldest attempt, null first, then player tag
using C collation. It does not advance the cursor. All eligible active members
remain included without a recruit-derived cap, ordered by oldest `next_poll_at`,
null first, then C tag ordering. An active voyage still bypasses member polling
deadlines. No additional index or change to the eligibility filters is included.

## Caller contract

Service-role callers acknowledge only recruit battle-log fetches actually
attempted through `public.record_recruit_battle_polls(p_player_tags text[])`.
The command returns void. A real failed fetch and a successful response with no
new battles both count as attempts, so a persistently failing player cannot
monopolize the first batch. A selected, queued or skipped target does not count.
This cursor records attempts, not successful ingestion or fresh battle data.

Input must be a non-null one-dimensional array of valid, non-null player tags,
with raw cardinality no greater than the configured batch. The empty array is
a safe no-op. Duplicate tags mark once. Unknown tags do not create recruits.
Validation precedes writes, and cursor updates roll back with the transaction.
The command locks existing recruit rows in C tag order. It does not update
scores or request recruit rotation. Existing update triggers remain enabled.

The new command has SECURITY DEFINER, an empty fixed search path and execution
restricted to service_role. The replaced selection function retains its live
postgres ownership, SECURITY DEFINER, fixed search path and existing ACL.

## Verification and deployment

The canonical no-Docker verifier passed baseline apply, baseline idempotency
and all 79 migrations in order. Baseline/full fold equivalence remains pending.
The resulting PostgreSQL 17 database passed all 28 assertions in
`supabase/tests/database/15_recruit_battle_poll_fairness.test.sql`, with real
production triggers enabled. The fixture required a complete clan record for
the voyage foreign key; the final run includes it. Platform cron/net/Vault
objects are structural shims, not an emulation of their execution behavior.

The tests exercise 301 active recruits: six cycles acknowledge 300 distinct
players, and the seventh cycle prioritizes the remaining unattempted player.
They also verify all 60 due members are returned, all 60 future-scheduled members
are returned during a voyage, selection leaves cursors unchanged, acknowledgment
requires no battle-data change, rollback, privileges and configuration errors.
This is controlled fairness evidence, not a measured production latency gain.

Deploy the tracked migration before the Edge caller that uses the new command.
Verify live selection bounds, untouched member eligibility, exact definitions
and grants, then observe actual attempted targets and cursor advancement. No
production mutation probes or ingestion calls are needed to validate DDL.
Rollback the Edge caller first; a later tracked migration can restore the old
selection function and remove the new command. Retain the nullable cursor until
no deployed caller depends on it. Restoring the old aggregate restores its
unbounded recruit selection and should be treated as a regression tradeoff.

This bounds recruit targets per invocation; it does not claim a global lock or
exclusive queue. Concurrent ingestors may select overlapping work before either
acknowledges attempts. A failed acknowledgment leaves a retryable old cursor;
callers must record that failure and avoid declaring fully successful completion.
The observed ingestor shutdowns were WallClockTime failures, with low CPU and
memory measurements. This change addresses excess I/O work; it does not claim
CPU or memory exhaustion was the cause, or that all outages are resolved.
