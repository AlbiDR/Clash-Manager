// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# query-royale-api

> Harvests clanless players from the Path of Legends leaderboard on demand, without saving them to the database.

**Trigger:** on demand from the [PWA](../../../../Frontend-PWA/README.md) ([Headhunter](../../../../Frontend-PWA/src/features/headhunter/README.md)'s Global/Local harvest) | **Auth:** internal bearer or Supabase anon key | **Persists:** nothing (results are returned to the caller)

## What it does

- **Global harvest** reads the live worldwide Path of Legends board. If it holds fewer clanless players than the harvest floor early in a season, it adds the verified recruits of the newest completed worldwide season. It never reads a country board.
- **Local harvest** resolves the clan's registered location from `CLAN_TAG` and reads that country's board. If the clan is registered as International, it shuffles the country catalog and queries up to 15 countries in parallel for geographic variety.
- Both paths filter out players who are already in a clan and validate every API response before returning.
- Scope is strict in both directions. A local harvest returns only the clan's own region and reports an empty board as empty; it is never backfilled from the worldwide season. A global harvest returns only worldwide boards. When the completed season contributes, the harvester follows ranking cursors through that board and checks each candidate's current profile before queueing them, excluding players who have since joined a clan or deleted their account, and the returned region reads `Global (completed season YYYY-MM)`.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | Entry point: validates the request, syncs the Vault, and delegates to the harvester. |
| `harvester.ts` | The leaderboard query endpoints, clan-status filtering, and the concurrent country-rotation loop, utilizing typed error catch parameters (`harvestError`, `countryError`, `globalPolError`, `localError`) for standardized error routing. |
| `client.ts` | Supabase service client. |

## Why Path of Legends, not the trophy ladder?

The legacy `/rankings/players` leaderboard was retired with the 2025 Trophy Road rework and now returns an empty list for most locations. The season-scoped form (`/pathoflegend/{season}/rankings/players`) is global-only and exposes completed seasons. The season-less `/pathoflegend/players` form serves the live, in-progress board and accepts both `global` and individual country IDs, but can be empty after the monthly reset. Because the season-scoped board is global-only, it can back the global harvest but not a local one: a local harvest after the reset legitimately returns nobody until the regional board repopulates.

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md)
- Frontend caller: [`@features/headhunter`](../../../../Frontend-PWA/src/features/headhunter/README.md) - the PWA feature that triggers Global/Local harvest and renders the results
- Scheduled counterpart: [`headhunter-scanner`](../headhunter-scanner/README.md) - automated tournament-based discovery vs this function's on-demand leaderboard harvest
