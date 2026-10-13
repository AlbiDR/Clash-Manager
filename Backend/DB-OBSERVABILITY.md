<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Bounded database and host observations

`.github/scripts/database/db-health.mjs` owns the canonical host-metric parser,
resource comparison, and health report. `db-observe.mjs` calls that collector
twice and delegates interval math to `compareResourceReports`; it must not
introduce a second parser or reset PostgreSQL/host statistics.

## Coordinator-run collection

The DB coordinator owns authorization and execution of live provider requests.
This CLI is not run by this change or its tests. After the coordinator has
selected a safe outage or healthy window, an explicitly authorized operator may execute:

```sh
node .github/scripts/database/db-observe.mjs \
  --output audit-YYYY-MM-DD/db-observation.json \
  --interval-seconds 300
```

The interval is bounded to 120–3600 seconds and is measured between starts of
the two whole health snapshots. Default is 300 seconds. The command writes one
JSON artifact even if either snapshot is degraded or its setup/probes fail; exit
status 1 means evidence is degraded or the resource interval is unusable. Output
uses a same-directory temporary file and rename. The coordinator should retain that
exit status alongside the artifact rather than treating a missing artifact as
success.

Supply `SUPABASE_ACCESS_TOKEN` and one project reference (`SUPABASE_PROJECT_REF`,
`PROJECT_REF`, or the linked `.temp/project-ref`). Supply frontend
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or their
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` forms), or
allow the local `Frontend-PWA/.env` fallback. URL host must match the project
ref. `GITHUB_SHA`, `GITHUB_REF`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`,
`RELEASE_VERSION`, `APP_VERSION`, or `VITE_APP_VERSION` are optional release
inputs. No git command is run and secrets are never written into output. Missing
provenance is null, not inferred from the current checkout.

For comparable days, invoke once in a coordinator-confirmed healthy period and
once during the observed incident window, keeping the same release/build,
project ref, sample interval, and cron/workload phase as far as possible. Save
separate artifacts with their original UTC acquisition windows. The report has:

- `samples[n].sampleWindow`, per-request `sampleCoverage`, `provenance`, and
  `evidenceCoverage`; each individual response includes only HTTP status and an
  allow-listed, syntax-checked request ID. Response bodies and credentials are
  not copied into error diagnostics.
- `samples[n].currentStatus` describes endpoint reachability, not metadata
  completeness. `databaseEvidenceStatus` is `AVAILABLE` only when the seeded
  roster/headhunter markers, both required ingestor/scanner heartbeat rows, and
  every expected database counter key validate. Missing evidence remains
  `UNAVAILABLE` in `evidenceCoverage` and makes observer exit nonzero while
  preserving endpoint reachability separately.
- `samples[n].freshness.publication`: generation, publication timestamp and
  age for each materialized snapshot. `freshness.heartbeats` separately records
  completion/trigger/failure times and ages. The SQL constructs a narrow JSON
  projection with component, status, timestamps, `is_data_perfect`, and
  sanitized stage/passed summaries. It never returns `last_message` or a raw
  validation report. Never substitute heartbeat success for successful
  snapshot publication.
- `comparison.resourceInterval`: canonical resource deltas, using the resource
  scrape acquisition timestamps and explicit host-boot or PostgreSQL-process
  continuity. Cumulative lifetime iowait is not an interval rate.
- `comparison.databaseCounters`: only counter deltas with same PostgreSQL
  postmaster start and equal, non-null `stats_reset`; a null or changed reset
  time, counter decrease, or missing counter is unavailable/degraded evidence.
- `providerLogs`: one separate Management API logs request for the previous
  complete UTC hour fixed at pair start. It stores HTTP status aggregates,
  PostgREST timeout log-entry counts, Postgres error counts by SQLSTATE, up to
  50 sanitized failed Data API records, and up to 50 structured
  `supabase_rpc_trace` events. `queryStatus` reports whether the API query succeeded;
  `sourceCoverage` distinguishes `EVENTS_OBSERVED`, `NO_EVENTS_OBSERVED`, and
  `UNAVAILABLE`. A successful query with zero function log rows or zero matching
  trace events is not proof that the source was recording or complete; the report
  retains the observed counts and adds an explicit unknown. Both detail lists report truncation and malformed
  rows. RPC records keep the native function-log event ID, parent execution ID,
  RPC response request ID and fixed route/outcome/status/duration fields. Failed
  gateway records keep the distinct gateway event ID, parent execution ID,
  native `log_attributes.request_id` for joining to RPC `responseRequestId`,
  separate `trace_id`, fixed route/method/status, and `cfRay` where valid. `cfRay`
  is not treated as a native request ID. Persisted routes must match the shared
  static route catalog; unknown relation names become `OTHER_DATA_API_ROUTE`
  and unknown RPC names become `OTHER_RPC`. Aggregate counts accept only
  nonnegative safe integers or canonical decimal strings; duplicate aggregate
  or group keys degrade evidence instead of overwriting it. Detail timestamps are rendered by
  ClickHouse explicitly in UTC and normalized to ISO UTC by the collector; rows
  without an explicit timezone are omitted. The SQL response includes bounded
  source event messages only so the local projection can extract the fixed RPC
  fields; raw `event_message` values are never saved in the report. SQL/error
  details, URL/query strings, headers, keys, payloads and player identifiers are
  never retained. An HTTP 200 with a non-null API `error`, malformed response, missing
  required aggregate, or HTTP/network failure is DEGRADED/UNAVAILABLE and makes
  the CLI exit nonzero without discarding the health pair.
- `limitations`: exporter scrape age and provider disk budget / burst credits
  remain uncollected. This report cannot establish a provider quota or outage
  cause by itself. A missing log record is not evidence that no event occurred:
  retention, source recording, malformed source fields and per-kind caps remain
  coverage limits.

## Bounded request and database work

Each health sample performs at most five outbound requests concurrently: one read-only
Management API SQL request using `db-health.sql`, one Management API metrics
request, and the three existing app-facing GET reads from
`verify-app-availability.mjs` (materialized roster, materialized headhunter,
blacklist). After both samples, exactly one GET to the Management API project
logs endpoint runs with ClickHouse SQL and `iso_timestamp_start` /
`iso_timestamp_end` set to the previous complete UTC hour at pair start. The
endpoint accepts at most 24 hours; this collector always requests one hour.
There are no retries. Each of the five calls per sample and the one pair-level
log call has a 25-second request timeout; the logs query performs no Postgres call. At the
hourly schedule this adds 24 analytics requests/day and zero Postgres calls.
The log query filters only `edge_logs`, `postgrest_logs`, `postgres_logs`, and
`function_logs`; it caps per-status/SQLSTATE groups and detail rows. An explicit
source/hour window is included in output. The
samples are separated by at least the requested interval. Each SQL
pass reads current database size, connection count, one relation size, the
24-hour cron summary, heartbeat and two-row publication metadata, current DB
statistics, and active client query summaries. It does not scan application
tables or invoke application functions. Keep the existing app read projections
and do not switch them to computed scoring views.

Expected artifact shape:

```json
{
  "schemaVersion": 1,
  "generatedAt": "UTC timestamp",
  "collector": "db-observe",
  "requestedIntervalSeconds": 300,
  "sampleCount": 2,
  "samples": [{ "observedAt": "...", "currentStatus": "REACHABLE", "databaseEvidenceStatus": "AVAILABLE", "sampleWindow": {}, "provenance": {}, "sampleCoverage": [], "freshness": {}, "evidenceCoverage": {} }],
  "comparison": { "resourceInterval": {}, "databaseCounters": {}, "sampleStartSeparationSeconds": 300 },
  "providerLogs": { "status": "SUCCESS", "window": { "hourKey": "..." }, "sourceCoverage": {}, "aggregates": {}, "failedDataApiRequests": {}, "rpcTraces": {}, "unknowns": [] },
  "limitations": []
}
```

The log query follows the [Management API project-logs endpoint](https://supabase.com/docs/reference/api/v1-get-project-logs)
and [ClickHouse log-query guide](https://supabase.com/docs/guides/observability/advanced-log-filtering).

## Rollback

Rollback is file-only: revert the observer implementation and regression-test
changes in `.github/scripts/database/db-health.mjs`, `db-health.sql`, `db-health.test.mjs`,
`db-observe.mjs`, `db-observe.test.mjs`, `db-observe-logs.mjs`,
`db-observe-logs.test.mjs`, and this document. Workflow and package wiring are
coordinator-owned and are not part of this rollback. The collector creates no
database objects and changes no database runtime state. Delete generated JSON
artifacts only under their audit retention policy; never clean them as part of
rollback.


## Scheduled evidence and comparison

The tracked `db-observe.yml` workflow runs on Stable hourly at minute 17 UTC
and accepts manual dispatch. It pins checkout to the event commit, runs the
collector tests first, serializes observation runs and keeps artifacts for
30 days. Its 120-second pair adds at most 144 app REST reads and 120 Management
API requests per day (SQL, metrics and one analytics query per pair).
GitHub schedules can be delayed or missed. Count actual artifacts and retain
missing hours as missing evidence. No continuous uptime percentage follows
from these samples.

Download individual runs without changing application state:

```sh
gh run download <run-id> --name db-observation-<run-id>-1 --dir observations/<run-id>
pnpm db:observe:report observations --from 2026-10-14T00:00:00Z --to 2026-10-16T00:00:00Z
pnpm db:observe:report observations --from 2026-10-14T00:00:00Z --to 2026-10-16T00:00:00Z --json
```

Use the actual run attempt in the artifact name. The comparison command reads
only local saved artifacts. It keeps duplicate captures and degraded retakes,
uses declared provider-log windows across UTC hour boundaries and reports
missing/invalid slots. Seeing events from all four log sources is distinct
from proving an exhaustive log stream. No source event, request or failure
is erased by a later successful sample.

The static route catalog in `requestTraceRoutes.json` is shared by backend
transport tracing and the archive normalizer. Add legitimate diagnostic routes
there when introducing a new RPC. Arbitrary route names are grouped; request
and execution IDs remain available for targeted provider investigation.
No raw URL queries, request/response bodies, keys or private heartbeat error
messages belong in an observation artifact. Resource gauges/counters, snapshot
publication ages, worker completion and API read success remain separate facts.
