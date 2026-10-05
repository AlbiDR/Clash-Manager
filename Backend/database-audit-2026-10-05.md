<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Database architecture audit, October 5, 2026

This is the first measured architecture baseline, taken after the live sync
incident fixes described in [the incident record](sync-outage-2026-10-05.md).
The project remains on Supabase Free. This audit introduces no additional live
schema changes or data deletion.

## Evidence and scope

The live inventory at 21:48 UTC contains 30 application tables, 10 views,
115 routines, 26 application triggers, 63 indexes and eight scheduled jobs.
All 30 tables now have purpose and lifecycle descriptions in
[database-map.json](database-map.json). The collector also records columns,
foreign keys, view dependencies, policy metadata, role privileges, retention
configuration, physical storage and the 40 query groups with the largest
recorded execution totals. It scans all 67 local migration files for source
navigation, reusing the existing parser.

The live database occupied about 135.1 MiB. The largest application tables were:

| Table | Physical storage | Meaning |
| --- | ---: | --- |
| `substrate.governance_telemetry` | 42.5 MiB | Operational diagnostics, about 38.4 MiB in overflow storage |
| `drivers.player_battles` | 39.4 MiB | Recent individual battle records and their indexes |
| `substrate.raw_war_log` | 9.8 MiB | Large original war response payloads |
| `drivers.recruit_ledger` | 6.9 MiB | Candidate and user-action history |
| `drivers.player_battle_daily` | 3.5 MiB | Daily summaries preserved after raw battle deletion |

Physical bytes include live data and reusable space. This inventory does not
establish how much of that space is reclaimable. A single observation also
cannot establish exponential growth or a historical growth rate.

There are positive structural findings: all ten application foreign keys have
supporting indexes, no application index is invalid, retention exists for raw
responses and telemetry, and cron matches its declared schedule. The scheduled
budget audit passed at 553 fixed launches per day against its declared budget
of 600. Event-gated voyage jobs were inactive. These checks do not prove that
scheduled functions finish or that every policy and query is correct.

## Ordered work list

| Order | Work | Evidence | Completion criteria |
| --- | --- | --- | --- |
| 1 | Make failures and data freshness independently visible | 101 cron startup timeouts in the last 24 hours; dispatch success precedes Edge completion; nightly failure logging rolls back on rethrow | Show launch, completion and freshness separately. Inject a maintenance failure and retain a durable failure signal. Correlate the next real slowdown with interval host metrics and API logs. |
| 2 | Repair late-arriving battle history folding | 888 raw battles older than the configured window; 840 lack a matching daily summary, 48 have one | Fold late arrivals without losing totals or double counting. Test duplicate ingestion, partially purged dates, retries and concurrent writes before allowing deletion. |
| 3 | Reduce telemetry write and payload cost | 42.5 MiB total; scanner metadata accounts for roughly 85% of retained metadata bytes | Preserve errors, stage timings and validation evidence; summarize successful payloads. Measure bytes per run, update frequency and query latency before and after. |
| 4 | Prove database reconstruction from source | 19 explicit live indexes lack a matching CREATE INDEX declaration in the local migration chain | Resolve origin, including dynamic DDL; rebuild a disposable database from tracked source and compare object definitions, constraints, grants, views and configuration. |
| 5 | Finish the public API permission matrix | Advisors flag 12 anon-executable owner-privileged routines, ten owner-privileged views and three mutable routine search paths | Classify intended reads and actions, internal operations and validation/abuse controls. Verify effective permissions using the publishable role. Fix unintended exposure through migrations without disabling intended app operations. |
| 6 | Define lifecycles for remaining history and caches | Daily battle aggregates and selected ledger events have no age-based purge; card cache freshness does not establish eviction | Name the product purpose and ownership of each retained history. Make applicable retention settings dynamic; preserve user actions and useful historical totals. |
| 7 | Remove proven redundant lookup structures | Four exact indexed-key signature groups retain an unnecessary-looking explicit copy next to a protected unique index | Verify plans and dependencies, retain constraints, remove eligible copies through a migration, and measure write/storage change. |
| 8 | Profile read and maintenance work under ingestion load | Recent recorded roster SQL mean about 766 ms, maximum about 2.94 s; nightly maintenance about 30 s | Inspect real endpoint query plans, buffer reads and temporary spills; compare equivalent workload intervals and confirm cold population plus steady refresh behavior. |

The ordering prioritizes diagnosis and data correctness before reclaiming small
amounts of space. It is a work list, not a claim that these changes are already
implemented.

### Failure reporting

The live `substrate.execute_nightly_maintenance()` function updates its failure
heartbeat and inserts failure telemetry in its exception handler, then raises
the exception again. The failing transaction cannot retain those writes. Cron
can still record the failure separately; `last_failure_at` in that transaction
is not durable evidence. This follows from the inspected function and
[PostgreSQL transaction rollback behavior](https://www.postgresql.org/docs/17/tutorial-transactions.html).

The function also catches cron history maintenance failures in an inner block
and continues to a `COMPLETED` heartbeat. A completed maintenance heartbeat
therefore does not establish that every maintenance subtask succeeded.

The long host-wide outage remains a separate investigation. Simple system
queries, scheduling and schema-cache refreshes failed alongside app reads.
Today's evidence does not establish a single initiating cause. The incident
record preserves the timeline and applied resource reductions.

### Late-arriving battles

`substrate.fold_player_battles()` selects older dates only when no daily
summary exists anywhere for that date, or when the date falls within the
configured revision window. An older date with some existing summaries can
therefore be skipped when new player/day/type records arrive. The 840 unmatched
old raw records are consistent with this eligibility gap. The deletion safety
guard retains them, which protects data but leaves a backlog.

The follow-up check found that all 840 unmatched records span 35 dates that
already have other daily summaries. That confirms that the date-level
existence test excludes exactly these dates from an older-history backfill.

This is not evidence that the 20,000-row purge batch is too small: only 48 old
records were eligible for deletion at inspection. A safe repair must also deal
with late records for existing summaries. Recomputing a summary from remaining
raw rows after part of its history was already deleted would lose totals.

### Telemetry

The snapshot counted 3,529 telemetry rows. The configured retention is seven
days, with nightly pruning; the oldest row was September 28 at 03:00 UTC,
consistent with that cadence. This table is bounded by age, not growing without
any cleanup.

The stored metadata occupied about 22.4 MiB by `pg_column_size`, of which
headhunter scan events accounted for about 18.9 MiB. The shared protocol sends
the accumulated `audit_log` and current results at intermediate heartbeats,
then replaces the metadata again at completion. That creates repeated large
writes. Physical overflow bytes alone do not quantify the removable portion;
payload-level measurement is required before choosing a reduction.

A follow-up breakdown of scanner metadata found about 142.6 MiB in materialized
`audit_log` values and 16.7 MiB in materialized `validation_report` values across
the retained scan events. These are expanded JSON values after extraction, not
physical table storage. Compression explains why they exceed the retained
metadata's physical size. This makes repeated serialization, parsing and
rewriting a concrete optimization target even with a bounded seven-day window.

Reproduce this breakdown without exporting the payloads:

```sql
SELECT field.key, count(*) AS events,
       sum(pg_column_size(field.value)) AS materialized_value_bytes
FROM substrate.governance_telemetry AS telemetry
CROSS JOIN LATERAL jsonb_each(telemetry.metadata) AS field
WHERE telemetry.event_type = 'HEADHUNTER_SCAN'
  AND jsonb_typeof(telemetry.metadata) = 'object'
GROUP BY field.key
ORDER BY materialized_value_bytes DESC;
```

### Reproducibility and access

The existing live drift audit returned drift, but its comparison is scoped to
the master baseline. Some live-only objects, including the voyage foreign-key
indexes, are declared in later tracked migrations. The architecture collector
checks definition sightings across the whole local chain and explicitly avoids
claiming that sightings prove replay equivalence. Nineteen non-constraint live
indexes still lack such a declaration. Dynamic SQL and externally provisioned
objects must be considered before concluding they were created manually.

Supabase security advisors reported five internal tables with RLS enabled and
no policy, ten owner-privileged views, three functions with mutable search paths
and twelve anon-executable owner-privileged functions. The no-policy cases can
be intentional deny-by-default boundaries. Public views and actions likewise
need contextual review rather than blanket revocation.

Some internal tables have anon write grants, but inspected RLS policies allow
only `service_role` writes. Their schemas are not exposed through PostgREST.
Those grants are not proof of an anonymous write vulnerability. The permission
matrix must distinguish grants, schema exposure, policies and owner-privileged
RPC behavior. The existing credential inspection found no anon-callable
Vault-reading routine; publishable key literals are not privileged secrets.

### Index review

Four exact signature groups pair explicit non-unique indexes with protected
unique indexes: recruits by player tag, members by player tag, blacklist by tag
and war activity by player/week. Their explicit copies consume roughly half a
MiB together. They are concrete review candidates but much smaller than the
telemetry cost. The report never recommends removal based only on zero scans.

The Supabase performance advisor identified thirteen recently unused indexes.
Statistics had restarted around 21:21 UTC, so that observation window is short.
Several of those indexes support retention or infrequent maintenance. The audit
keeps those duties visible and labels usage as an observation.

## Verification and unfinished coverage

The read-only collector ran against the live project and produced JSON plus a
standalone HTML atlas. Its analyzer tests cover estimate/count confusion,
protected indexes, incomplete evidence, reset-aware comparisons, incremental
source navigation, missing configuration and safe HTML embedding. The atlas
was opened in headless Chrome: selecting tables and queries and filtering
routines worked without browser errors.

Two representative JSON-producing endpoint queries were profiled under `anon`
inside explicitly read-only transactions with an eight-second statement limit:

| Query | Planning | Execution | Shared block hits | Disk block reads | Temporary writes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full roster, 48 rows | 86.4 ms | 323.0 ms | 2,830 | 0 | 0 |
| Recruit view, limit 250 | 27.5 ms | 64.0 ms | 272 | 0 | 0 |

These warm-cache samples exclude HTTP transit, PostgREST orchestration and
client processing. They establish representative database costs, not latency
under every ingestion workload. The roster's win-rate function accounted for
about 225 ms of that execution sample; the next plan review should inspect its
internals and compare them during ingestion.

The local recovery command `pnpm test:database-baseline:nodocker` was attempted
on a disposable PostgreSQL cluster. It failed before applying the baseline
because this installation does not provide the `pg_cron` extension. Its stubs
do not bypass the baseline's extension creation statement. That is a test
environment limitation, not proof that the live baseline is invalid. Recovery
equivalence and the full replay were not verified.

Two inventory snapshots taken about six minutes apart measured no change in
database or application table physical bytes. That interval is too short to
characterize growth; it does not substitute for measurements across complete
ingestion and maintenance cycles.

Full endpoint authorization tests, plan checks during ingestion, a completed
recovery rehearsal and multi-day growth measurements remain unfinished. The
default atlas identifies plans and recovery as outside its capture scope; the
separate experiments above are recorded here. The user-facing connection
changes from today's earlier work still require the normal frontend release;
this audit does not deploy them.

See [the database guide](database-architecture.md) for regeneration, snapshot
comparison and the architecture change procedure.
