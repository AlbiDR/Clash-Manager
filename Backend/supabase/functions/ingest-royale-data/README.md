// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# ingest-royale-data

> The main sync pipeline: it pulls the clan, its roster, its war history, and members' battle logs from the Clash Royale API into the database.

**Trigger:** scheduled (via `substrate.run_ingest_royale_data()`, cadence configured in Supabase) and manual | **Auth:** internal bearer | **Persists:** raw JSON, shredded into `drivers` by database triggers

## What it does

The pipeline (`pipeline.ts`) runs three stages in order:

1. **Discovery** (`stages/discovery.ts`) - harvests fresh recruit candidates from open tournaments before the clan sync begins.
2. **Clan sync** (`stages/clan-sync.ts`) - fetches the clan profile, member list, current river race, and the last 12 war weeks, then upserts the clan, roster (including joins and leaves), weekly war activity, and permanent war history.
3. **Deep depth** (`stages/deep-depth.ts`) - fetches battle logs for members whose poll interval has elapsed (or all members during an active Voyage) plus active recruits, and records them into the 100-battle rolling window. Bypasses redundant PostgREST RPC calls when recruit battle logs are unchanged (`isAlreadyIngested` via `get_latest_battle_times`), while continuing to harvest clanless opponents as shadow leads.

Each stage runs under a 10-minute timeout and reports progress to the governance telemetry.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | Entry point; loads secrets and runs the pipeline behind the [shared handler](../_shared/README.md). |
| `pipeline.ts` | Orchestrates the three stages. |
| `client.ts` | Supabase service client for database calls. |
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
