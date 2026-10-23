// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# ingest-royale-data

> The main sync pipeline: it pulls the clan, its roster, its war history, and members' battle logs from the Clash Royale API into the database.

**Trigger:** scheduled (via `substrate.run_ingest_royale_data()`, cadence configured in Supabase) and manual | **Auth:** internal bearer | **Persists:** raw JSON, shredded into `drivers` by database triggers

## What it does

The pipeline (`pipeline.ts`) runs three stages in order:

1. **Clan sync** (`stages/clan-sync.ts`) - persists the clan profile, member roster, current river race and last 12 war weeks first.
2. **Deep depth** (`stages/deep-depth.ts`) - polls all due members (all active members during a Voyage) before optional recruit battle logs. The target RPC selects at most 50 recruits, ordered by their durable last-poll timestamp and tag. Each actually attempted selected recruit is acknowledged through `record_recruit_battle_polls`, including failed or unchanged responses; an overlapping member/recruit is fetched once and acknowledged for both roles. Unstarted recruits remain eligible. Member writes still reschedule `next_poll_at`, including valid empty logs.
3. **Discovery** (`stages/discovery.ts`) - uses any remaining admission budget to harvest tournament recruits. Failure or deferral of this optional work does not undo earlier required writes.

One invocation budget starts before Vault setup: external admission closes at 90 seconds, stage writes stop at 120 seconds, and lifecycle RPCs (setup and final telemetry/heartbeat) stop at 145 seconds. The separate lifecycle signal leaves completion time after the work signal expires and a margin before the Free worker wall limit. Timers are disposed after the shared handler resolves. Fetches and PostgREST operations receive their respective signals; no stage races detached work against a timer. These are operational bounds, not guarantees of completed work during a provider stall. The shared incoming-body reader is unchanged; this checkpoint targets the authenticated scheduler's small JSON requests.

Required clan writes, member target acquisition/polls and attempted-recruit poll acknowledgements must succeed for the entry point to return a completed cycle. A failed or unstarted required member poll is explicit, and its polling timestamp is never advanced by the worker without a successful ingestion RPC. Optional recruitment work can be deferred without being treated as a required-write failure. Diagnostics retain stage durations, invocation elapsed time and attempted/failed/deferred polling counts. Successful dispatch or completed telemetry alone does not prove fresh snapshots or complete enrichment.

`RecruitWriter` deduplicates accepted tags within the invocation and serializes registry-before-recruit writes in chunks of at most 50, ordered by tag. Successful chunks remain durable if a later chunk fails. It retains a bounded pending payload and the seen-tag set, rather than whole-run player and recruit payload arrays. Errors remain visible; it does not retry failed chunks within the same invocation.

The four clan writes are separate RPC calls, not one transaction, so a failed cycle can leave earlier writes committed. A FAILED heartbeat preserves the previous `last_success_at`, and the app keeps showing the prior materialized snapshot because snapshots refresh on a COMPLETED heartbeat. That snapshot can therefore lag partial base-table writes until a later completed cycle. A successful heartbeat and its snapshot refresh are also not an atomic publication guarantee: snapshot refresh failures are recorded separately and can leave the snapshot marker unchanged.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | Entry point; loads secrets and runs the pipeline behind the [shared handler](../_shared/README.md). |
| `pipeline.ts` | Orchestrates the three stages. |
| `client.ts` | Supabase service client, request tracing wrapper, and Vault environment broker (`syncVault`). |
| `work-budget.ts` | Admission, work and lifecycle deadlines. |
| `recruit-writer.ts` | Deduplicated bounded registry/recruit checkpoints. |
| `stages/discovery.ts` | Recruit harvesting from tournaments. |
| `stages/clan-sync.ts` | Clan, roster, river race, and war history sync. |
| `stages/deep-depth.ts` | Per-player battle-log ingestion. |

## External calls

Via the Key Farm proxy: `/clans/{tag}`, `/clans/{tag}/members`, `/clans/{tag}/currentriverrace`, `/clans/{tag}/riverracelog?limit=12`, `/tournaments?name=`, `/tournaments/{tag}`, `/players/{tag}/battlelog`.

## Architecture and Reliability Guards

- **Recruit Ingestion Optimization (`isAlreadyIngested`):** Deep depth queries `get_latest_battle_times` RPC for recruit tags and compares lexical ISO 8601 timestamps (`YYYYMMDDTHHMMSS.mmmZ`). If all fetched battles in a recruit's log are provably already stored (`newestFetched <= latestStored`), the `ingest_player_battles` PostgREST RPC call is skipped, eliminating redundant database writes while continuing to harvest shadow leads. Member logs are never skipped because member RPCs also update tiered polling schedules (`next_poll_at`).
- **Two-Phase Shadow Lead Write Safeguard:** Shadow leads harvested from battle logs are persisted in two distinct steps: `sync_players` (universal player registry) followed by `sync_recruits` (shadow recruitment queue). Phase 2 is strictly gated on Phase 1 succeeding to prevent foreign key constraint violations (`drivers.recruits` referencing `drivers.players`).
- **Ghost Recruit Purging:** When a player API request returns an HTTP 404 status, the stage calls the `report_dead_recruit` RPC to purge ghost tags and conserve key farm API quota.

## Gotchas

- Persistence is delegated to `ingest_raw_*` RPCs; the function itself writes no normalized rows. Shredding happens in database triggers.
- The battle log the API returns is capped (roughly the 25 most recent battles); the 100-battle window is built up by accumulating across syncs.

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md) | [Root README](../../../../README.md) - the scoring engine this pipeline feeds
- Related functions: [`headhunter-scanner`](../headhunter-scanner/README.md) - the scheduled counterpart for deep recruit profiling | [`fetch-player-battlelog`](../fetch-player-battlelog/README.md) - the on-demand variant for single-player battle-log lookups
