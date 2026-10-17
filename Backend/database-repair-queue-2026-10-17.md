<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Exclusion maintenance and truthful diagnostics checkpoint

Coordinator: 01 DB Coordinator. This is interactive DB-team work, not an
autonomous Jules Nightly stage. Production probes and publication are centralized.

| Job | Owner | State | Scope |
| --- | --- | --- | --- |
| Exclusion cache maintenance | 08 | Verified | New tracked migration; skip same-tag updates, preserve source-union membership and privileges; behavior and local contention tests. |
| Shadow integrity reporting | 05 | Verified | Emit schema-valid successful integrity entries; preserve real validation failures and strict shared schema. |
| Observer history | 11 | Verified locally | Recover bounded missing provider-log windows from archived observations without extra database probes; preserve failed acquisitions. |
| Independent review | 10/12 | Ready | Migration safety, diagnostics correctness, permissions and architectural consistency. |
| Integration and release | 01 | Running | Verify complete evidence, migration registration, deployment and app-facing reads; one publication slot. |

## Baseline and expected result

The 17 October audit found a timeout in exclusion-cache insertion triggered by
updating only a member's polling schedule. Both source-table triggers currently
run on every update. The repair must avoid cache access when the tag is unchanged,
while preserving correct member/blacklist union membership, transaction rollback,
and existing invoker security, owner and grants. At 15:13:35 UTC, a bounded live
union comparison found 1,004 source tags and 1,004 cached tags, with zero missing
or extra entries. No production reconciliation is required for that observation.

SHADOW_SCOUT currently emits `passed: true` with `issues: null` after successful
validation. The strict integrity schema permits an omitted field or an array,
so the protocol wrongly classifies that event as failed. Correct the producer,
not the shared validation rule. A successful shadow check does not make unrelated
tournament or profiling checks successful.

The observer's hourly schedule produced only ten archived hourly windows out of
42 in the audit range. Missing evidence must remain visible. Recover provider
logs through bounded, deduplicated history catch-up, separately from the current
two-sample host observation. Retain acquisition provenance and degraded attempts;
do not represent recovered log hours as recovered historical host measurements.

## Verification and rollback

- Locally verify cache maintenance on insert, delete, overlap, genuine tag change
  and rollback; reproduce the unnecessary lock wait and show a scheduling-only
  update avoids it after repair. Check current ownership, ACL and security mode.
- Exercise successful empty/nonempty shadow payloads and malformed/RPC failures
  through the actual producer and strict shared integrity schema.
- Verify history gaps, bounded work, duplicate hours, failed acquisition retention,
  corrupt/unavailable artifacts and provider time-window limits without live
  failure injection.
- Run migration audit, clean replay, relevant application/observer tests and
  frozen Edge type checks. Independently review before publication.
- Deploy only through the repository workflow. Verify the live function body,
  migration history, source-union equality, naturally completed scanner telemetry
  and app-facing HTTP reads. Compare bounded observations without an uptime claim.
- Roll back SQL through a new forward migration restoring the prior reviewed
  trigger function, preserving grants/security. Revert the shadow producer or
  observer history integration through source and normal deployment if needed;
  retain collected evidence. Do not edit an applied migration.

## Scope boundaries

Remaining recruit-upsert contention, discovery concurrency, truncated profiling,
password-protected tournament semantics, event-gated cron bursts and daily outage
duration remain separate owned follow-ups. This checkpoint does not raise resource
limits, restart the database or claim all outages fixed.

Existing Nightly-maintenance work has a different writer. Its source, version and
branch updates must finish before this checkpoint takes the publication slot.
Never stage another worker's changes or stash their unfinished work for a sync.

Detailed evidence is retained in the coordinator archive under
`exclusion-checkpoint-2026-10-17/`; the read-only audit is in `audit-2026-10-17/`.

## Verification checkpoint

Independent SQL, shadow-reporting and observer reviews report ready. Local
verification passed 406 backend tests, 65 observer/health checks, 111 migration
quality tests, the frozen six-entrypoint Edge type check and migration audit
with zero violations. Clean replay applied all 78 migrations; all 16 new SQL
assertions then passed against that full schema with production triggers
present. An initial fixture omitted a player name required by the heritage
trigger; the corrected realistic fixture passes without disabling triggers.
Baseline/full fold equivalence remains pending; local cron/net/Vault shapes do
not emulate managed Supabase runtime behavior.

The held-cache-lock reproduction timed out in all three old-body attempts and
completed all three repaired attempts. This establishes removal of the local
lock dependency, not a production-wide performance claim. Both disposable local
PostgreSQL clusters were stopped and removed.

The actual GitHub artifact-history reader successfully loaded three existing
observer archives with zero malformed or cross-project records. The actual
Stable workflow and provider catch-up archive remain deployment checks. The
publication slot is held by the separate Nightly-maintenance owner for release
14.55.5 and SyncBranches 39044262804; DB changes remain uncommitted until that
owner completes its branch updates.

## Publication and continuation

All implementation and independent review gates are complete. The separate
Nightly-maintenance owner has returned the next publication slot, conditional
on merge bookkeeping run 39045111455 and final watchdog 39045174764 becoming
terminal. Do not cancel either run or discard their tag/history/ledger updates.
Owner 01 publishes this checkpoint after that boundary, then verifies applied
SQL, scanner telemetry, app-facing reads and the actual Stable observer artifact.

Exact source/version commits, deployment outcomes, artifact checks, final
canonical synchronization and actual three-branch parity belong to the external
checkpoint's `publication.json` and final report. A reviewed local implementation
is not proof of deployment or resolved daily outages. Preserve the handover and
original failed evidence alongside successful checks.
