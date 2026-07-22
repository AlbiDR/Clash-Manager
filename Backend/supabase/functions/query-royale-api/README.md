// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# query-royale-api

> Harvests clanless players from the Path of Legends leaderboard on demand, without saving them to the database.

**Trigger:** on demand from the PWA (Headhunter's Global/Local harvest) | **Auth:** internal bearer or Supabase anon key | **Persists:** nothing (results are returned to the caller)

## What it does

- **Global harvest** reads the live worldwide Path of Legends board. If it is empty early in a season, it merges rankings across major countries until it has enough candidates.
- **Local harvest** resolves the clan's registered location from `CLAN_TAG` and reads that country's board. If the clan is registered as International, it shuffles the country catalog and queries up to 15 countries in parallel for geographic variety.
- Both paths filter out players who are already in a clan and validate every API response before returning.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | Entry point: validates the request, syncs the Vault, and delegates to the harvester. |
| `harvester.ts` | The leaderboard query endpoints, clan-status filtering, and the concurrent country-rotation loop. |
| `client.ts` | Supabase service client. |

## Why Path of Legends, not the trophy ladder?

The legacy `/rankings/players` leaderboard was retired with the 2025 Trophy Road rework and now returns an empty list for most locations. The season-scoped form (`/pathoflegend/{season}/rankings/players`) is global-only and exposes only completed seasons. The season-less `/pathoflegend/players` form used here is the only endpoint that serves the live, in-progress board, and it accepts both `global` and individual country IDs. The old ladder is kept only as a per-region fallback.

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md)
