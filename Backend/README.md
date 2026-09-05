// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager Backend

[![Backend](https://img.shields.io/badge/Backend-v14.50.21-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](README.md)
[![Deno](https://img.shields.io/badge/Edge-Deno-000000?style=flat-square&logo=deno&logoColor=white)](supabase/functions)
[![Postgres 17](https://img.shields.io/badge/Postgres-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)](supabase/migrations)

The Supabase project behind Clash Manager. It pulls clan, war, and battle data from the Clash Royale API, stores a permanent history, and computes the performance and potential scores the app reads.

> New here? The [root README](../README.md) explains what the product does and how the scores work. This document is the backend's technical map.

---

## What it does

- **Ingests** clan profiles, rosters, river-race standings, war history, and per-player battle logs from the Clash Royale API on a schedule.
- **Stores history.** Raw payloads land in one schema, get shredded into a normalized model, and are kept as a rolling window (battles) or a permanent ledger (wars).
- **Scores** members (performance) and recruits (potential) with Postgres views computed on read, so scores always reflect the latest data.
- **Discovers recruits** by continuously scanning tournaments and leaderboards for strong clanless players.
- **Serves** the [PWA](../Frontend-PWA/README.md) through row-level-secured views and a small set of RPCs, and maintains itself with scheduled pruning and health checks.

---

## Edge Functions

Five Deno functions live in [`supabase/functions/`](supabase/functions). All share the request handler, key-rotation, and secret-loading code in [`_shared/`](supabase/functions/_shared/README.md), authenticate service-to-service calls with an internal bearer token, and route every Clash Royale API request through a rotating pool of keys (the "Key Farm") behind the RoyaleAPI static-IP proxy.

| Function | Trigger | Purpose |
| :--- | :--- | :--- |
| [`ingest-royale-data`](supabase/functions/ingest-royale-data/README.md) | Scheduled + manual | The main sync pipeline: discover recruits, sync the clan and roster, and fetch battle logs. |
| [`headhunter-scanner`](supabase/functions/headhunter-scanner/README.md) | Scheduled (5-min guard) + manual | Discovers, profiles, and refreshes recruit candidates. |
| [`query-royale-api`](supabase/functions/query-royale-api/README.md) | On demand from the PWA | Harvests clanless players from the Path of Legends leaderboard without persisting them. |
| [`fetch-player-battlelog`](supabase/functions/fetch-player-battlelog/README.md) | On demand | Fetches one player's freshest battle log by querying every key in parallel. |
| [`sync-player-cards`](supabase/functions/sync-player-cards/README.md) | On demand from the Laboratory | Syncs a player's card collection, normalized to a 1-16 level scale. |

---

## Data model

The database is organized into four schemas, but only two are reachable through PostgREST: `public` and `features`. `substrate` and `drivers` are internal-only, reached exclusively through `public` RPCs and `features` views/RPCs -- never directly. Data flows strictly one way through all four.

| Schema | Role | Holds |
| :--- | :--- | :--- |
| `substrate` | Raw landing and orchestration | Raw JSON payloads (short retention), system config, telemetry, pipeline heartbeats, and the recruit-scan epoch state. Service-role only. |
| `drivers` | Normalized domain | Players and members, war activity and permanent war history, the 100-battle rolling window per player, daily snapshots, the recruit queue and blacklist, veteran heritage, and Clan Voyage data. |
| `features` | Presentation | The scoring and roster views, headhunter view, Voyage summaries, war analytics, and the player card snapshots for the Laboratory. This is what the app reads. |
| `public` | RPC bridge | The thin functions the Edge Functions and PWA actually call (raw ingest, player/recruit sync, telemetry, and PWA data reads). |

The pipeline moves data in four steps:

1. **Fetch.** An Edge Function calls the Clash Royale API and validates every payload against a Valibot schema.
2. **Land.** The raw JSON is inserted into a `substrate.raw_*` table.
3. **Shred.** An `AFTER INSERT` trigger decomposes the JSON and upserts it into the normalized `drivers` tables.
4. **Project.** The `features` views compute scores and aggregates on read; the app queries those views and a few RPCs.

### Data Shredding & Reliability Guards

The shredding triggers in the `substrate` schema implement critical transactional and analytical safeguards:

- **Three-Tier River Race Week ID Resolution:** Inside `substrate.shred_river_race()`, the target week identifier is resolved using a fallback hierarchy:
  1. *Tier 1 (Canonical):* Read `seasonId` directly from the live river race payload to ensure consistency with finished wars.
  2. *Tier 2 (Fallback):* Retrieve the latest completed war's `seasonId` from the `raw_war_log` table.
  3. *Tier 3 (Last Resort):* Use the system's current ISO calendar week formatted string.
  This hierarchy completely eliminates the risk of orphan ghost-rows at season boundaries.
- **Roster Monotonic Activity Guard:** Inside `substrate.shred_roster()`, member activity tracking is guarded against API cache lag. When updating `last_seen_at` in `drivers.members`, the trigger uses `GREATEST(drivers.members.last_seen_at, EXCLUDED.last_seen_at)` to guarantee that an older, cached API response cannot overwrite a more recent known activity timestamp.

The scoring formulas (RPeS/PeS for members, RPoS/PoS for recruits) are summarized in the [root README](../README.md#the-scoring-engine). RPoS is computed in TypeScript in [`_shared/utils.ts`](supabase/functions/_shared/README.md); everything else is computed in SQL views in the master migration.

---

## Security

- **Row-level security is on for every table**, deny-by-default. The `anon` role can only `SELECT` from `features` views.
- **Zero-trust ingress.** Every inbound payload passes a Valibot schema before it touches the database.
- **Secrets** are loaded from Supabase Vault at function start. Service-to-service calls require the internal bearer token; tag columns are `CHECK`-constrained to valid Clash Royale tag characters.

---

## Development

The backend is managed with the Supabase CLI.

```bash
supabase start                                              # local stack
supabase migration new <name>                              # new migration
supabase functions serve ingest-royale-data --no-verify-jwt # run a function locally
supabase test db                                           # run pgTAP tests
```

Migrations are the single source of truth: change the schema in a migration file, never in the dashboard. After any schema or RPC change, regenerate the TypeScript types.

### Deployment

`.github/workflows/deploy-supabase.yml` runs on pushes to `Beta` or `Stable` that touch `Backend/**`. It syncs secrets and the Vault, pushes migrations, and deploys all five Edge Functions.

---

## Environment

| Name | Kind | Role |
| :--- | :--- | :--- |
| `ROYALE_API_KEYS` | Secret | The Key Farm: a pool of Clash Royale API keys, rotated per request. |
| `INTERNAL_BEARER_TOKEN` | Secret | Service-to-service auth for the Edge Functions. |
| `SUPABASE_ACCESS_TOKEN` | Secret | CLI authentication for deploys. |
| `SUPABASE_DB_PASSWORD` | Secret | Migration push authentication. |
| `CLAN_TAG` / `PLAYER_TAG` | Variable | The clan and player the backend tracks. |
| `SUPABASE_PROJECT_ID` | Variable | The Supabase project reference. |

---

## See also

- [`supabase/functions/_shared/`](supabase/functions/_shared/README.md) - the shared kernel every function builds on
- [Root README](../README.md) - product overview and scoring
- [Frontend PWA](../Frontend-PWA/README.md) - the downstream consumer of all backend RPCs and realtime subscriptions
- [APK](../APK/README.md) - the Android wrapper that drives features through the same backend (indirectly via the PWA bridge)
- [CleanStack Architecture](../.github/authoritative-design-references/CleanStack%20Architecture.md) - the governing design rules
