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
| Recruit SQL repair | 08 | Published on Beta | One new CLI-created migration, related behavioral/concurrency tests and repair runbook. No direct production changes; stop ready for review. |
| Discovery batching implementation | 05 | Published on Beta | Bounded service-only RPC, per-keyword stage batching, route/types, SQL and stage tests; writer finished. |
| Independent release review | 10 | Verified | Review the finished migration, evidence, security, rollback and remaining risks. |
| Deployment verification | 11 | Verified source / release artifacts | Verify exact published revision, migrations and workflow outcomes; coordinator owns actual live DB/app probes. |
| Integration / live evidence | 01 | Beta published; final promotion tracked externally | This queue, before/after evidence, targeted tests, publication and app verification. |

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

## Published Beta checkpoint

Source `7008c540260b2ae49f4bf3b01fc21f5634cebd5a` and version
`eabb8c7284d3ecaf465218aaebc23c8d4aea28ef` are pushed. Version is **14.55.3**.
Source Supabase run 38804548685, control-plane 38804548692 and attribution
38804548775 passed. Both new migration timestamps were applied in that run.
The live catalog matches all three reviewed function bodies, preserves both
existing function ACLs and owners, and retains rotation as invoker-security.

Version Supabase 38805178986, Auto Tag 38805179326, native integrity
38805179393 and attribution 38805179258 passed. Signed Android build
38805493020 published `14.55.3+509`, 3,982,503 bytes, SHA-256
`4a841e7815f45c5786e4978009b5ec4dd02924d9ea48fad4f04493e3101dc090`.
The post-APK PWA deployment is 38805651702. Final workflow, served artifact,
branch-content and Android checks are recorded in the coordinator's external
`recruit-repair-checkpoint/publication.json` and final report; a dispatched
promotion alone is not success.

During natural traffic from 20:49:13 to 20:50:58 UTC, provider logs recorded
16 successful batch RPCs, 30 successful keyword-yield reports and one successful
recruit sync, with no old single-row cache calls in that captured window.
This is early runtime evidence, not a daily savings percentage or proof of
continuous availability. Push gates passed 404 backend and 2,350 frontend tests.

## Owned follow-ups beyond this checkpoint

- 02/03: observe recruit failures and investigate other writers, rotation row
  contention and materialized-refresh timeouts if they recur. Sorted sync input
  is a targeted mitigation, not a universal locking protocol.
- 05/09: compare complete, similarly loaded 24-hour windows for old/new cache
  requests, failures, freshness and resource pressure. Scanner completion and
  stage integrity remain distinct; external/schema failures are not cured by
  cache batching alone.
- 11: resolve the observer's hourly schedule gaps; retain missing evidence.
- The independent Nightly-maintenance chat owns its unpublished promotion
  verification fix in `/private/tmp/cm-nightly-promotion-20261015` on branch
  `ADR/nightly-promotion-identity`. It is held outside this publication slot;
  preserve it and release the slot after this DB checkpoint closes.

No paid upgrade, database restart, statistics reset or production failure
injection was used. Local PostgreSQL test resources belong to the coordinator
and are removed after verification; test evidence remains outside git.
