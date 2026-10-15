<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Recruit reliability checkpoint — 15 October 2026

Coordinator: 01 DB Coordinator. Goal: ship a verified, bounded repair for
recruit synchronization failures and unnecessary database work while keeping
app data correct on the existing Supabase Free project. This is interactive
DB-team work, not a Jules Nightly stage.

States: queued → running → ready for review → verified → published. Coordinator
owns integration, live probes, versioning and the single publication slot.
Unrelated Nightly files in the shared Beta checkout have a different writer;
never stage, stash, restore or overwrite them as part of this checkpoint.

| Job | Owner | State | Scope / stopping point |
| --- | --- | --- | --- |
| Lock/query analysis | 03 | Verified | Read-only source and saved evidence; recommend a minimal repair, including other writers and rotation behavior. |
| Recruit SQL repair | 08 | Ready for review | One new CLI-created migration, related behavioral/concurrency tests and repair runbook. No direct production changes; stop ready for review. |
| Discovery batching implementation | 05 | Ready for review | Bounded service-only RPC, per-keyword stage batching, route/types, SQL and stage tests; writer finished. |
| Independent release review | 10 | Verified | Review the finished migration, evidence, security, rollback and remaining risks. |
| Deployment verification | 11 | Queued (publication slot) | Verify exact published revision, migrations and workflow outcomes; coordinator owns actual live DB/app probes. |
| Integration / live evidence | 01 | Running | This queue, before/after evidence, targeted tests, publication and app verification. |

## Baseline

15 October 20:15 UTC: real app-facing reads succeeded (44 roster, 250 recruits,
653 blacklist rows); 553 cron runs and zero recorded failures in the rolling
24-hour window. Android subsequently fetched fresh Supabase data successfully.
This is availability at sampled times, not continuous uptime or completed
background work.

Provider logs for 14 October 20:00–15 October 20:00 UTC show nine
`sync_recruits` HTTP500s, five discovery-cache HTTP504s and other background
errors. PostgreSQL logged three deadlocks and nine statement timeouts.
Earlier detailed evidence identified opposite-order player upserts and a
rotation timeout at `CREATE TEMP TABLE elite_tags`. New retrospective context
must distinguish recurrence from inferred causality. Scanner completion can
still contain failed discovery stages.

The same full-day aggregate contains 19,441 discovery-cache write requests.
That is a workload optimization target, not evidence that every request can be
removed or that those calls cause every outage. The observer has substantial
schedule gaps; missing evidence cannot be reported as success.

## Completion gates

- Confirm live definitions and privileges against tracked migration history.
- Preserve source provenance, scoring/ranking, valid statuses, empty/no-op
  behavior, nested guard cleanup, transaction rollback and API privileges.
- Reproduce the targeted failure or unnecessary work locally and verify the
  replacement behavior, including relevant concurrent writers. No production
  failure injection, statistics reset or repeated restarts.
- Define forward migration, expected outcomes and rollback before deployment.
- Complete independent 10 review and required backend/deployment gates.
- Publish coherent owner-authored commits using the repository SemVer process;
  preserve all unfinished work and serialize release workflows.
- Verify the applied migration/definition and the complete database → API →
  Android app path. Retain failures as well as successful checks.
- State the observation window, sample count and unresolved mechanisms; a
  targeted mitigation is not a claim that all recurring outages are fixed.

Detailed artifacts live outside git under the coordinator visualization root,
`recruit-repair-checkpoint/`; the preceding `audit-2026-10-15/` retains the
read-only daily audit and the 02/09/11 specialist reviews.

## Integration evidence

Coordinator reproduced player-upsert deadlocks in all three old opposite-order
local pairs. The repaired ordering completed all six calls in three pairs.
This tests sync-vs-sync player locking, not every competing writer or rotation
lock. A separate 3,000-row synthetic ranking comparison retained the same
250-recruit boundary, excluded archived and null-score entries, and did not
assert a particular winner at unspecified score ties.

The first independent review caught a draft privilege broadening. 08 is
correcting rotation to preserve live invoker mode, ownership and ACLs, and
adding required configuration validation. The live configured limit is 250.
Batch SQL runtime assertions passed 17 cases in isolated PostgreSQL17; full
backend tests passed 400 and the frozen six-entrypoint Deno check passed.

03 additionally owns a narrow baseline projection correction: preserve the
original two-column heartbeat view before the historical August replacement;
the existing September migration still supplies the current five-column view.
This removes a pre-existing clean-replay blocker without changing the final
live view schema. Full unmodified replay and the final independent review
remain completion gates; the earlier local fixture required a documented
compatibility preparation and is not used to claim a clean full replay.

Clean verification subsequently applied all 77 migrations without historical
compatibility edits, and passed 27 recruit, 17 cache-batch and 10 scoring SQL
assertions. Migration audit now passes with zero violations and both new
migrations registered immutable. The canonical no-Docker baseline apply,
idempotency and full replay also pass; fold equivalence remains pending.

## Incoming branch integration

The already-running branch synchronization brought the same two-column
heartbeat baseline correction from Nightly. Coordinator preserved the full
incoming baseline (including its other changes); only the accurate two-column
projection comment remains a local baseline diff. No historical migration was
rewritten and no Nightly changes were discarded. Revalidation uses this merged
source, not only the earlier isolated patch.

Independent 10 final review and cache-order delta recheck both report ready.
The other release's canonical branch synchronization completed successfully;
its Stable deployment children remain running, so coordinator publication is
still serialized behind their completion. Integrated-source migration replay
again passed all 77 migrations, with current fold equivalence pending.

Release classification: patch. The new service-only batch RPC is an internal
implementation detail of existing discovery work; this checkpoint corrects
locking and lowers its request count without adding a user capability or
changing a public client contract. Version is read from the current package
manifest at publication; no tag-history inference is used.
