<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Database improvement queue — 10 October 2026

Coordinator: **01 DB Coordinator**. The numbered chats are DB specialists,
not Jules Nightly stages. The reliability corrections are published on Beta in 14.53.0.
This queue records the specialist handoff after Beta deployment and artifact
verification; the coordinator owns branch integration and final verification.

Changes move through queued → running → ready for review → verified →
published. A completed analysis is not an implemented or deployed fix.
Blocked work is recorded separately. The coordinator owns this queue,
integration, live database probes and the publication slot.

| Owner | State | Concrete objective | Dependencies and next action |
| --- | --- | --- | --- |
| 02 Incident & Recovery | Published: documentation | Correlate outage windows with existing bounded evidence; separate service recovery, mitigation and root cause. | Completed source/evidence review and corrected unsupported causal claims in the operational handoff. Recurrence diagnosis remains queued. |
| 03 Queries & Indexes | Prepared; readiness reply received | Rank actual expensive query plans and propose measured improvements. | Establish a comparable baseline with 02/09 before choosing plans or indexes. |
| 04 Snapshots & Scoring | Ready for review: analysis | Trace snapshot refresh failures that leave successful heartbeat freshness ahead of published data. | Confirmed marker/heartbeat mismatch. Prepare a separate frontend publication-freshness change after the ingestion checkpoint. |
| 05 Ingestion & Edge Functions | Published: deployment verified | Correct successful completion reporting after required profile, members, race or warlog persistence fails. | Implemented the ingestion-local typed failure gate and timeout latch. Focused tests passed; 10 found no blocking source issue. |
| 06 Cron & Maintenance | Ready for review: analysis | Scope reductions in dormant epoch polling and redundant/overlapping maintenance work. | Confirmed declared 288/day epoch cadence; propose event gating with in-flight protection after baseline measurements. |
| 07 API, Realtime & Cache | Ready for review: analysis | Assess client reconnection, cache rendering and fresh-server recovery across the complete app path. | Returned a per-snapshot freshness implementation plan and separate Voyage reconnect gap. No frontend runtime changes in this checkpoint. |
| 08 Schema & Security | Published: deployment verified | Repair reproducibility of the private scanner feedback routine's service-role boundary. | Follow-up migration and 20 pgTAP assertions pass targeted clean reconstruction and idempotent reapplication. Immutable inventory registered. |
| 09 Metrics & Capacity | Analysis complete | Establish comparable resource/failure/freshness observations and free-tier headroom. | Confirmed one usable 229-second interval, active swap movement and 12 successful read samples; no causal or sustained-recovery claim supported. |
| 10 Review & Release Checks | Independent review complete | Independently review implemented ingestion and privilege corrections, rollback and regressions. | No blocking source findings. Target SQL evidence and generated signature checked; coordinator resolved the local Deno dependency gap with the exact passing CI command. |
| 11 GitHub & Verification | Beta release verified | Verify deployed checkpoint, prepared release prerequisites and automation writers. | Verified 14.53.0 tag, deployment, signed APK and post-APK PWA publication. Observe integration child runs; coordinator alone synchronizes. |
| 12 ADR | Ready for review: analysis | Choose architecture-compliant scope for ingestion completion handling and assess relevant ownership boundaries. | Recommends existing typed-error contract and an ingestion-local gate; no new ADR needed for this scoped correction. |

## Evidence and existing changes

- All eleven existing project chats have received assignments or preparation
  briefs and replied. 02, 05 and 08 prepared owned changes; 10 reviewed them
  independently; 11 verified publication. No temporary subagent is active.
- The integrated fixes at `8d57419e3` deployed successfully in
  [run 38066113776](https://github.com/AlbiDR/Clash-Manager/actions/runs/38066113776).
  This establishes deployment and the workflow's sampled live reads, not
  sustained availability or resolution of recurring outages.
- The scanner feedback bridge, resource comparisons, ingestion failure gate,
  private ACL correction and generated public RPC type are committed and
  pushed. Version 14.53.0 is committed as `699b45d42`; its CI-created tag points
  to that commit. Deployment and PWA publication passed.
- 08 repaired the missing tracked private-function revocation in follow-up
  migration `20261010153623`. The live migration history confirms application;
  both wrapper and private routine deny browser execution and retain service
  execution. Target reconstruction proves the default-ACL regression and fix.
- 05 owns only ingestion `index.ts`, `index.spec.ts`, a new required-write
  completion integration spec, and the ingestion README. The shared protocol
  and its prepared version stamp are outside this assignment.
- 08 owns only a new ACL follow-up migration and
  `12_anchor_yield_api.test.sql`. The coordinator owns migration-quality
  inventory/hash registration and this queue. No specialist owns production
  probes, commits or publication.

## Publication and preservation

The private ACL reconstruction gap is repaired and deployed. The signed
14.53.0+488 APK, its tracked metadata and uploaded artifact match at
3,982,503 bytes and SHA-256
`879c1d82ced86adf8bfaef51b297c20a7efd68a6c5003ce32e531c2534f9b0f4`.
The post-APK PWA publication succeeded in
[run 38066533591](https://github.com/AlbiDR/Clash-Manager/actions/runs/38066533591).
SyncBranches and its separately dispatched children require coordinator
verification; workflow dispatch alone never establishes completion.

The unrelated Stage 10 failed-startup log entry was inspected on 11 October,
preserved at `/private/tmp/cm-stale-stage10-2026-10-10.patch`, and removed rather
than published. The official Nightly log arrived through synchronization. Do
not stash, reset or overwrite unfinished worker changes.
Recurring outage root cause, sustained recovery and Android-visible fresh
data remain unverified.

## Verification before publication

- Ingestion writer: four focused Vitest files, 25 tests passed; independent
  reviewer reran the entrypoint and integration files, 15 tests passed.
- Real target definitions from the tracked master reproduced two private ACL
  assertion failures before the follow-up. After the follow-up, 20/20 pgTAP
  assertions passed, including another 20/20 after idempotent reapplication.
- Real tracked heartbeat SQL passed five additional assertions for preserved
  success timestamps and truthful failed-run status.
- Exact deployment Deno command passed all six Edge Function import graphs.
- Migration audit passed 74 migrations with zero violations or unsupported
  statements; version audit confirmed 14.53.0 parity. The push gate also passed 377
  backend and 2,320 frontend tests, frontend type checking and lint.
- SQL verification is targeted reconstruction on disposable PostgreSQL 17,
  not a full Supabase migration-chain replay; Docker/Supabase extensions were
  unavailable locally. Deployment live-read gates passed, and the coordinator
  confirmed live ACLs and a write-free backend ping returning 14.53.0.
- At 18:09:40 Europe/Rome, one bounded capture returned 46 roster rows,
  250 headhunter rows and 562 blacklist rows in successful requests. Historical
  rolling-window startup timeouts remain a separate observation; their falling
  count is not evidence of an improvement. Failure injection was local, not
  production. No Android runtime or sustained-recovery claim is made.

## Next owned actions

1. **02/09**, with live probes owned by **01**: make recurring outages the next
   availability checkpoint. Capture comparable incident and healthy intervals,
   app-read failures and provider evidence before attributing the cause. A
   preview sync timed out during the freshness checkpoint; later live app reads
   succeeded. Neither observation proves sustained recovery.
2. **06**, coordinated with **09**: establish the live epoch retry baseline,
   then consider event gating and in-flight suppression with retry/idempotence
   coverage. The declared idle cadence is 288/day; actual avoided work is not
   yet measured.
3. **03**: use the bounded workload baseline to rank expensive queries and
   execution plans before proposing indexes.
4. **07/04**: the per-snapshot publication freshness correction is implemented
   and reviewed. Voyage reconnect recovery remains a separate follow-up.
5. **10/11**: review concrete changes and relevant deployed artifacts; **12**
   checks architecture when the scope warrants it.

## Published freshness checkpoint — 11 October 2026

The coordinator completed canonical SyncBranches run 38148686337 and its
Supabase deployment child 38148991442 before starting this checkpoint. Beta,
Stable and Nightly had identical tracked content at 14.53.0; local Beta was
clean. APK/PWA deploy jobs were correctly skipped for that synchronization.

| Owner | State | Checkout / scope | Evidence and next step |
| --- | --- | --- | --- |
| 07 | Published in 14.53.1 | Shared Beta checkout; frontend API, payload schema/types, sync/store, directly associated specs and frontend/API README | Implemented per-view markers, bounded consistency verification, legacy-cache normalization and blacklist-safe reconciliation; 181 focused tests, lint/type checking passed. Source and version publication verified. |
| 04 | Queued; execution not yet observed | Read-only marker migration and frontend contract | Coordinator confirmed atomic marker/refresh transaction, seeded-null behavior and bounded public API availability while awaiting the specialist response. |
| 10 | Verified; independent review complete | Read-only final frontend diff | Both initial blockers corrected. Independently passed 181 tests across five focused specs; no remaining blocking findings. |
| 01 | Release verified; final synchronization pending | Queue, integration, release/version and centralized runtime verification | Preserve ownership; verify app behavior in CM Dev, publish coherent changes and verify workflows/artifacts. |
| 11 | Verified; final synchronization review pending | Read-only release verification | Source/version deployment families, actual APK checkout and published APK hash independently confirmed; verify final SyncBranches children next. |

Other DB work remains queued. Voyage reconnect changes are a separate item;
no database migration or outage-cause claim is part of this freshness change.

Verification before this checkpoint's publication: the production PWA build
passed. CM Dev on Android 16 rendered the same roster rows under four controlled
publication-date scenarios: fresh → DB; one stale snapshot → STALE; missing
freshness → UNVERIFIED; legacy payload → UNVERIFIED. The initial live sync during
preview setup timed out; controlled cases prove presentation and data retention,
not sustained backend recovery. Bounded public marker and heartbeat reads had
returned HTTP 200 earlier at 17:04:50 Europe/Rome. No production writes or
failure injection were performed.

Request-count evidence from the reviewed implementation and focused tests:
unchanged verified memory snapshots use two reads (marker and blacklist),
versus three before (which included heartbeat). Cold verified snapshots use
five reads, the same count as before: the removed heartbeat is replaced with
a bounded post-read marker check. This is a request-count reduction in the
warm-cache path, not a measured CPU, latency or availability improvement.

Rollback is a normal frontend revert/redeployment; no database schema change
is included. Per-snapshot fields are optional for older cached payloads. The
coordinator owns patch version 14.53.1 publication and its verification.


Published source commit `f0a58424b6126d759a3ac9b67bf4aded0e118c1b` and
version commit `3bb98fa8a77841017fbafff13459e4635232d937` passed the full
push gates: 382 backend and 2,330 frontend tests, lint, type checking and
architecture dependency checks. The initial push was stopped locally by an
outdated transport request-count assertion; that expectation was corrected
and its 11 focused tests passed before publication. Tag `v14.53.1` resolves
to the version commit. Source and version PWA/Supabase/native/attribution
workflows completed successfully, independently checked by 11.

APK run [38151775631](https://github.com/AlbiDR/Clash-Manager/actions/runs/38151775631)
built the actual Beta version commit and published `14.53.1+490` in
`4b9e3997117cf612219d8b0243b05de0be7a3a99`. Its replacement PWA deployment
[38151868393](https://github.com/AlbiDR/Clash-Manager/actions/runs/38151868393)
completed successfully. At 17:40:42 Europe/Rome, the served PWA, metadata and
APK returned HTTP 200; the downloaded APK matched the tracked metadata:
3,982,503 bytes, SHA-256
`6a1916e6b198a5492d72735082cbe2b40676e9d0486635ad49609b18d32ce349`.

CM Dev verified live PWA and native version 14.53.1 at 17:36:26 Europe/Rome,
with successful reads displaying 45 roster members and 250 recruits. Both
publication times were known and the combined time equalled their older
value. One observed warm refresh at 17:32:37 made exactly two REST reads
(marker and blacklist). This sample of one confirms that request path only;
it does not establish sustained availability or resource savings. Detailed
screenshots and structured evidence are retained in the coordinator's
`freshness-checkpoint` artifact directory.

The final canonical SyncBranches and separately dispatched deployments remain
the coordinator's publication completion gate. Their final run IDs, branch
content parity and served artifact verification will be retained in the
coordinator's final publication evidence, avoiding another release solely
for recording workflow completion. The additional 04 read-only request was
not observed executing; it is not counted as a completed specialist review.
