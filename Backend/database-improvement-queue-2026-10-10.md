<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Database improvement queue — 10 October 2026

Coordinator: **01 DB Coordinator**. The numbered chats are DB specialists,
not Jules Nightly stages. The ingestion and private ACL corrections are locally verified; the
coordinator is serializing publication and release verification.

Changes move through queued → running → ready for review → verified →
published. A completed analysis is not an implemented or deployed fix.
Blocked work is recorded separately. The coordinator owns this queue,
integration, live database probes and the publication slot.

| Owner | State | Concrete objective | Dependencies and next action |
| --- | --- | --- | --- |
| 02 Incident & Recovery | Ready for publication: documentation | Correlate outage windows with existing bounded evidence; separate service recovery, mitigation and root cause. | Completed source/evidence review and corrected unsupported causal claims in the operational handoff. Recurrence diagnosis remains queued. |
| 03 Queries & Indexes | Prepared; readiness reply received | Rank actual expensive query plans and propose measured improvements. | Establish a comparable baseline with 02/09 before choosing plans or indexes. |
| 04 Snapshots & Scoring | Ready for review: analysis | Trace snapshot refresh failures that leave successful heartbeat freshness ahead of published data. | Confirmed marker/heartbeat mismatch. Prepare a separate frontend publication-freshness change after the ingestion checkpoint. |
| 05 Ingestion & Edge Functions | Verified locally; awaiting publication | Correct successful completion reporting after required profile, members, race or warlog persistence fails. | Implemented the ingestion-local typed failure gate and timeout latch. Focused tests passed; 10 found no blocking source issue. |
| 06 Cron & Maintenance | Ready for review: analysis | Scope reductions in dormant epoch polling and redundant/overlapping maintenance work. | Confirmed declared 288/day epoch cadence; propose event gating with in-flight protection after baseline measurements. |
| 07 API, Realtime & Cache | Ready for review: analysis | Assess client reconnection, cache rendering and fresh-server recovery across the complete app path. | Returned a per-snapshot freshness implementation plan and separate Voyage reconnect gap. No frontend runtime changes in this checkpoint. |
| 08 Schema & Security | Verified locally; awaiting publication | Repair reproducibility of the private scanner feedback routine's service-role boundary. | Follow-up migration and 20 pgTAP assertions pass targeted clean reconstruction and idempotent reapplication. Immutable inventory registered. |
| 09 Metrics & Capacity | Analysis complete | Establish comparable resource/failure/freshness observations and free-tier headroom. | Confirmed one usable 229-second interval, active swap movement and 12 successful read samples; no causal or sustained-recovery claim supported. |
| 10 Review & Release Checks | Independent review complete | Independently review implemented ingestion and privilege corrections, rollback and regressions. | No blocking source findings. Target SQL evidence and generated signature checked; coordinator resolved the local Deno dependency gap with the exact passing CI command. |
| 11 GitHub & Verification | Ready for review: analysis | Verify deployed checkpoint, prepared release prerequisites and automation writers. | Deployment ca63744aa verified; types/version 14.53.0 remain uncommitted. Recheck automation after changes; coordinator alone publishes and synchronizes. |
| 12 ADR | Ready for review: analysis | Choose architecture-compliant scope for ingestion completion handling and assess relevant ownership boundaries. | Recommends existing typed-error contract and an ingestion-local gate; no new ADR needed for this scoped correction. |

## Evidence and existing changes

- The actual 05, 08 and 11 project chats accepted their assignments, executed
  them and returned read-only reports. Their selected models and reasoning
  settings were preserved.
- Beta checkpoint `ca63744aa` has a successful Supabase deployment in
  [run 38063056225](https://github.com/AlbiDR/Clash-Manager/actions/runs/38063056225).
  This establishes deployment and the workflow's sampled live reads, not
  sustained availability or resolution of recurring outages.
- The public scanner feedback bridge and resource comparison improvements
  are committed and pushed. Generated public RPC types and version stamps
  for 14.53.0 are prepared locally, not published.
- 08 found that the public bridge is restricted correctly, but tracked SQL
  does not explicitly remove default PUBLIC execution from the private
  implementation. Live privileges alone do not establish clean-replay parity.
- 05 owns only ingestion `index.ts`, `index.spec.ts`, a new required-write
  completion integration spec, and the ingestion README. The shared protocol
  and its prepared version stamp are outside this assignment.
- 08 owns only a new ACL follow-up migration and
  `12_anchor_yield_api.test.sql`. The coordinator owns migration-quality
  inventory/hash registration and this queue. No specialist owns production
  probes, commits or publication.

## Publication blocker and preservation

The private ACL reconstruction gap is repaired in the prepared follow-up.
Final integrated publication, SyncBranches and separately dispatched
deployment/artifact workflows must be observed through completion.

Preserve the unrelated dirty
`.github/nightly-logs/10-apk-integrity-coverage.log`; exclude it from this
checkpoint. Do not stash, reset or overwrite unfinished worker changes.
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
  statements; version audit confirmed prepared 14.53.0 parity.
- SQL verification is targeted reconstruction on disposable PostgreSQL 17,
  not a full Supabase migration-chain replay; Docker/Supabase extensions were
  unavailable locally. Production behavior must still be checked after deploy.
