// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# headhunter-scanner

> Discovers strong clanless players, profiles them, scores their potential, and keeps the [recruit pool](../../../../Frontend-PWA/src/features/headhunter/README.md) fresh.

**Trigger:** scheduled (a 5-minute pg_cron guard re-fires it when the last run found no new top candidates) and manual (`run-headhunter.yml`) | **Auth:** internal bearer | **Persists:** `drivers.recruits`

## What it does

The scanner (`scanner.ts`) runs five stages:

| Stage | File | What it does |
| :--- | :--- | :--- |
| S0 Ghost purge | `stages/ghost-purge.ts` | Evicts recruits who have since joined a clan, keeping the active pool to free agents only. |
| S1 Shadow scout | `stages/shadow-scout.ts` | Turns recent battle-log opponents of tracked players into leads (via `get_shadow_discovery_targets`, up to 75). |
| S2 Tournament discovery | `stages/tournament-finder.ts` | Searches open tournaments by keyword (from `get_active_discovery_anchors`) and harvests their members. |
| S3 Profiler | `stages/profiler.ts` | Deep-profiles each candidate, computes the raw potential score (RPoS), and persists those who pass. |
| S4 Rescan | `stages/rescan.ts` | Refreshes the active recruit pool and drops recruits who go stale or fall below threshold. |

It reports the outcome of each run into `substrate.headhunter_epoch_state`, which drives the 5-minute retry guard.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | Entry point behind the [shared handler](../_shared/README.md). |
| `scanner.ts` | Orchestrates the five stages. |
| `client.ts` | Supabase service client for database calls. |
| `stages/` | One file per stage (see the table above). |

## External calls

Via the Key Farm proxy: `/tournaments*`, `/players/{tag}`, and `/players/{tag}/battlelog` (shadow scouting).

## Gotchas

- Tournament discovery only runs when the payload contains the `"AUTO"` sentinel; it never takes tournament tags from the request body.
- Trophy gating is deferred to the profiler (S3), which has the full ladder profile; earlier stages filter only on clan status and the exclusion set.
- **Logging & Telemetry Hygiene:** Profiling telemetry and post-ingestion fate-check status traces are logged strictly using `console.log` to prevent polluting cloud logging streams with false-positive alerts, reserving `console.error` exclusively for actual database, validation, or fatal execution errors.

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md) | [Root README](../../../../README.md) - the RPoS/PoS scoring formula this scanner computes
- Related functions: [`ingest-royale-data`](../ingest-royale-data/README.md) - the scheduled pipeline that also discovers recruit leads in its discovery stage | [`query-royale-api`](../query-royale-api/README.md) - the on-demand leaderboard harvest (vs this scanner's tournament harvest)
- Frontend consumer: [`@features/headhunter`](../../../../Frontend-PWA/src/features/headhunter/README.md) - the PWA feature that reads and surfaces this scanner's recruit pool
