// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Sync outage investigation, October 5, 2026

The project remains on Supabase Free; no paid upgrade was authorized or made.

## Confirmed incident

- The 99 failed scheduled jobs in the morning failed with `job startup timeout`.
  Their start times span 06:25 to 10:50 UTC (08:25 to 12:50 Europe/Rome).
- Ingestion succeeded at 06:00 UTC and next at 11:00 UTC, a five-hour gap.
- Database logs show internal PostgREST schema discovery, Realtime, and
  monitoring queries timing out during that window, including simple queries.
  A database shutdown/restart at 07:40 to 07:43 UTC did not end the incident.
- Evening Android WebView roster and recruit reads returned HTTP 500 with
  Postgres code `57014`, statement timeout. During investigation, a full
  anonymous roster read failed even while management SQL and recruits worked.
- A later health report counted 101 startup failures, including two jobs
  scheduled at 21:15 UTC. A successful read after cleanup did not establish
  that the host issue had ended.

These establish a database/service outage. Reinstalling the app cannot repair
it. The exact trigger of the morning host outage is not established by the
available logs; index bloat and resource counters are evidence of avoidable
load, not proof that any one of them caused all five hours.

## Resource observations

The database host reports about 406.5 MiB usable RAM. At the initial healthy
sample, about 232 MiB was available, while roughly 407 MiB was in swap.
Cumulative disk wait represented about 20.5% of CPU time since host startup,
with substantial cumulative swap activity. Those lifetime counters must not be
presented as measurements of this incident alone or used to claim an active
out-of-memory condition. Connection usage was about 23 of 60.

The battle table had 103,979 live rows, with an 8-byte primary key. Its primary
key index occupied 45,023,232 bytes. Two other indexes duplicated access paths
provided by the existing unique `(player_tag, battle_time)` index.

## Changes applied to the live database

Migration `20261005211604_reduce_sync_battle_read_cost.sql` removes the redundant
player-tag and tag/time indexes and replaces the roster bridge's generic
six-counter battle aggregation with a targeted wins/battles query for active
members. It preserves the public signature and grants, private helper access,
the existing 30-day analytical window, and UTC boundaries. It uses a three-second
lock timeout to avoid queuing schema locks indefinitely.

The primary key was rebuilt with `REINDEX INDEX CONCURRENTLY`, using the checked
in standalone maintenance SQL. This changed physical storage, keeping the same
constraint and rows. Before/after verification found:

| Measurement | Before | After |
| :--- | ---: | ---: |
| Primary key index | 45,023,232 bytes | 2,351,104 bytes |
| Database size | 199,765,139 bytes | 141,749,395 bytes |
| Battle rows | 103,979 | 103,979 |
| Invalid drivers indexes | Not captured | 0 |

Together, compaction and index removal reclaimed about 55 MiB. Rollback tests
verified exact equivalence on existing roster data. The pgTAP regression suite
checks unique-index preservation, redundant-index removal, analytical date
boundaries, inactive-player isolation, no-history defaults, anonymous roster
access, private-helper restrictions, and non-UTC sessions. Newest-battle
lookups still use a backward scan on the retained unique index.

Operational configuration in `supabase/free-plan-postgres-config.toml` reduces
shared buffers from the observed 224 MiB to 96 MiB and maintenance work memory
from 32 MiB to 16 MiB. The shared-memory reduction leaves 128 MiB more room for
other processes; maintenance memory is a per-worker limit. The existing small
query work-memory and connection limits stay at the provider defaults. This
requires a database restart and subsequent verification; it is a resource
reduction whose effect on repeated outages must be observed, not a proven
explanation of the morning outage.

Postgres restarted at 21:21:27 UTC. Verification confirmed both overrides active
with no pending restart. Early recovery checks still observed a roster statement
timeout; at 21:25:58 UTC both complete anonymous reads succeeded (48 roster rows
and 250 recruits), and the 21:25 scheduled guard succeeded. No extended period
of stability has been established by these spot checks.

The next ingestion wrote new roster data at 21:30:26 UTC and completed at
21:31:31 UTC. All three cron jobs scheduled for 21:30 started successfully.
A complete roster read during that run still hit the original three-second
anonymous statement limit. Migration
`20261005213231_align_public_read_timeout.sql` raises that limit to six seconds
and reloads PostgREST configuration, keeping it below the client's eight-second
attempt deadline and 25-second whole-sync budget. The stored anonymous role
configuration was verified after application.
At 21:32:52 UTC, the complete anonymous roster and recruit probes both succeeded
with those settings active, and the health report showed the successful
21:31:31 ingestion. This confirms current operation, without erasing the earlier
101 recorded cron startup failures.

## Frontend recovery changes

`SupabaseTransport.ts` bounds each REST GET, including response-body consumption,
to eight seconds, retries transient failures per view, and honors cancellation
through the 25-second overall sync budget. Healthy views are not fetched again
because another view failed. Mutations are never replayed. The public-key client
bypasses unused GoTrue session initialization and its browser locks.

These frontend changes need the normal PWA deployment before existing installs
receive them. The database changes above already apply to existing clients.
CM Dev on Android 16 loaded 48 members from the live database. An injected
roster HTTP 500/`57014` recovered with two roster requests, one recruit request,
and no remaining sync error.
With a deliberately nonresponsive first roster fetch, it canceled the abandoned
request and populated from the live database in about nine seconds, again
fetching recruits once and finishing without a sync error.
After clearing only the localhost preview's IndexedDB and local storage in
CM Dev and reloading, it populated 48 members and 250 recruits directly from
Supabase with no sync error. The owner's installed app and its data were not
reset.

## Evidence on the next incident

Use `pnpm db:health --json` during the failure. It checks full anonymous app
reads, management SQL, ingestion freshness, cron startup failures, and host
metrics. It distinguishes current reachability from recorded recent failures.
For a prolonged repeat, preserve that report alongside Postgres/API logs and
compare swap/disk counter deltas over the same interval. If internal queries and
cron startup fail again despite the reduced workload, that evidence points to
the hosting service and should accompany a Supabase support report.
