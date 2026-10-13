<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Database traceability checkpoint — 13 October 2026

Coordinator: **01 DB Coordinator**, shared Beta checkout. Objective: collect
comparable availability, snapshot freshness and resource evidence over the
next several days, and correlate failed/slow backend calls without adding
database trace writes. This is DB team work, not a Jules Nightly stage.

One writer per file; coordinator owns integration, versioning, publication
and live probes. States: queued → running → ready for review → verified →
published. Blocked work is recorded separately. Selected models and reasoning
settings are preserved.

| Owner | State | Allowed files / scope | Dependencies / stopping point |
| --- | --- | --- | --- |
| 09 | Published on Beta in 14.55.0 | Canonical db-health script/SQL/tests; new db-observe script/tests; Backend/DB-OBSERVABILITY.md | Two bounded samples >=120 seconds apart, provenance, freshness, unavailable states and safe diagnostics. Fixture verification; no live probes. |
| 05 | Published on Beta in 14.55.0 | Shared transport tracing module/tests, protocol/tests/README; Edge client.ts wiring | Failed/slow RPC logs with safe response request IDs; no body/key logging, new DB writes or retries. Meaningful transport/concurrency tests and Deno graph check. |
| 12 | Verified: architecture review complete | Read-only architecture review; artifact handoff only | Check ownership/privacy/monitoring load and completion criteria; stop before workflow work begins. |
| 11 | Published on Beta in 14.55.0 | New scheduled observer workflow and associated workflow tests; exact APK failure diagnosis | Wait for collector CLI; preserve pipeline ownership/concurrency and upload failure evidence. Coordinator owns APK binary regeneration. |
| 10 | Verified; independent review complete | Independent read-only review of final implementation | Privacy, false-success handling, CI behavior, regression and rollback review proportional to scope. |
| 01 | Running | This queue, integration, package commands, release/version, centralized verification, generated APK Dex if required | Publish one verified checkpoint at a time; verify observation artifact, backend trace log and actual live app path. |

Other specialists remain idle unless a concrete independent task becomes useful.

## Baseline and constraints

The Tuesday audit is saved in the coordinator's `audit-2026-10-13` artifacts.
It found zero startup failures in 1,202 scheduler invocations since Sunday's
checkpoint and 104 recorded successful ingestion cycles, but continuing API
timeout logs, active swapping and concrete discovery-cache/recruit write errors.
A successful dispatch is not completed ingestion; current read success is not
continuous uptime. Counters need continuity/reset evidence and comparable
acquisition windows. Missing samples are missing evidence, never success.

Reuse existing Supabase/GitHub infrastructure. Keep captures bounded, avoid
expensive computed views and overlapping observers, retain structured evidence
without raw player rows, query bodies, API keys or credentials. Document the
sampling cadence, retention, maximum extra requests and gaps. No production
failure injection or schema change is currently proposed.

## Verification and publication gates

- Deterministic collector tests: missing/malformed data, failure evidence,
  provenance, safe diagnostics, resource resets and freshness separation.
- Transport tests: request/response/cancellation semantics, nonfatal logging,
  safe identifiers, normal-success log suppression and concurrent operations.
- Workflow review: existing credentials, read-only actions, serialized runs,
  bounded duration, artifact upload on failure and scheduled execution on Stable.
- Coordinator runs a bounded live capture, checks generated evidence and a
  completed remote workflow artifact; confirms live backend traceability and
  the Android app's server data/freshness path under repository device rules.
- Independent 10 review and relevant 11 deployed-workflow verification.
- Source and version commits follow tracked commit/release process and owner
  authorship. No assistant co-author trailers. Canonical SyncBranches only
  after competing writers/Nightly prerequisites are checked, with every child
  followed through completion.

Rollback: revert trace/collector/workflow source and redeploy through the
normal process. An observer can be disabled independently of app operation;
no new database schema or paid service should be needed.

Provider log retention is now part of 09’s scope: one bounded analytics query per hourly observer pair, with safe aggregate/error/request-ID/Edge trace projections. Preserve fixed UTC hour bounds, row caps and truncation. No extra PostgreSQL requests or writes.

Coordinator reproduced the APK source mismatch, rebuilt the committed Dex and verified all 52 compiled classes now match the unchanged Java source. The live CM Dev check from this session loaded 45 members and 250 recruits from Supabase. The rebuilt binary will follow the normal publication and runtime verification gates.

Coordinator integration additionally owns db-observe-report.mjs/tests and package commands. The coverage report preserves missing/invalid slots, duplicate captures and degraded retakes; it never derives continuous uptime from sparse samples. Observer checkout is pinned to github.sha so captured provenance identifies the actual executing source.


## Verified implementation and first evidence

- Coordinator published APK consistency repair `a8047731a07ebd0eb9da92274a93db4d38c2b4f1`.
  Native-Layer Integrity run 38467110259 and Attribution run 38467110232 passed.
  Local source comparison passed all 52 compiled classes; emulator runtime loaded
  the app and server rows. Push gates passed 397 backend and 2,342 frontend tests.
- New observer, health, archive, coverage and workflow tests pass 51 cases.
  Independent 10 recheck passed all 51 plus 49 protocol/trace cases and found
  all five previous blockers resolved. Exact locked Deno command passed all six
  Edge entrypoint graphs. The route catalog is shared by runtime tracing and
  the archive sanitizer; arbitrary route names are grouped.
- First live pair preserved a real HTTP500 recruit read and unavailable host
  metrics, then later successful reads. It correctly exited degraded rather
  than discarding that failure. The second pair returned reachable reads,
  complete required metadata, a valid resource interval and successful log
  capture. These are bounded observations, not sustained recovery.
- Retrospective log capture for 17:00–18:00 UTC preserved seven failed writes
  with safe static routes and native request IDs; no malformed detail records.
  Provider source bounds and record caps remain attached to every capture.
- The coverage report uses declared archive windows across hour boundaries,
  retains degraded retakes and duplicate windows, and labels missing evidence.
  Ordinary fast RPC successes stay silent; failed/slow RPCs add console events
  without extra requests, retries or database trace writes. Abrupt worker exits
  can still leave no final console event.

Release classification is **minor**: this adds new operational observation and
comparison commands plus scheduled evidence retention. Coordinator owns the
14.54.4 → 14.55.0 source/version publication and verification. New public UI
behavior or database schema changes are not introduced by these components.
Nightly integration remains a separate canonical workflow prerequisite.

Next owned work after publication: 01/02/09 assess actual hourly coverage and
compare equivalent intervals in several days; 03/05 use correlated failure
IDs to scope recruitment lock ordering, nested rotation and discovery-cache
timeouts; 06 measures background overlap/cadence; 10/08/12 review concrete
changes proportionally. No outage-root-cause resolution is claimed here.


## Published Beta evidence — 13 October

Source `2928124019ab81a68c2a43bbdc645b7746afa697` and version
`45e78044de93e6dbb19293c217ab76069a0b465a` are pushed. Full push gates passed
398 backend and 2,342 frontend tests. Source deployment 38470670754 passed;
version Supabase 38471312810, Auto Tag 38471312705, native integrity 38471313024
and attribution 38471312844 passed. Tag v14.55.0 resolves to the version commit.
APK 38471509475 passed and published commit
`eecf8cba7319f44a1b2d05102c66cf1c777eea83`; its replacement PWA
38471666354 passed after the earlier PWA was superseded.

The served 14.55.0+504 APK matched metadata at 23:43:49 Europe/Rome:
3,982,503 bytes, SHA-256
`795689d286899516104d3ea41eceddc8d50d16181067e45d6ef97e534a10ffbe`.
CM Dev loaded live PWA 14.55.0 with successful Supabase reads, 45 members,
250 recruits and the DB indicator. Its combined publication time equalled the
older of the two known snapshot times. Earlier transient 44-member rendering
with unknown publication metadata is retained separately; it is not presented
as a fresh-data success.

Live console traces were observed during the ordinary 23:30 Rome jobs.
Two response request IDs matched exact gateway log entries for approximately
seven-second successful initialization reads. This proves deployed correlation;
it does not prove an outage cause. 05/03 should investigate initialization
lookup cost as well as recruitment/discovery failures after comparable data
accumulates, preserving credential rotation and access boundaries.

The final canonical SyncBranches and child deployments, and the first actual
Stable observer artifact, are still publication completion gates. Their run IDs,
branch parity, coverage and artifact contents will be retained in coordinator
final-publication.json rather than triggering another release only to record
workflow completion. Collection begins when Stable receives this workflow;
three days of coverage are a follow-up measurement, not a claim made today.
