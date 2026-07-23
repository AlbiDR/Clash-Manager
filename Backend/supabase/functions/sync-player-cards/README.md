// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# sync-player-cards

> Syncs a player's profile and card collection for the Laboratory, normalized to a common level scale and cached to protect the API.

**Trigger:** on demand from the [Laboratory](../../../../Frontend-PWA/src/features/laboratory/README.md) | **Auth:** internal bearer or Supabase anon key | **Persists:** `features.player_card_snapshots`

## What it does

1. **Cache check** - looks for a snapshot in `features.player_card_snapshots` less than 12 hours old and returns it on a hit.
2. **Fetch** - on a miss, fetches the player's profile through the Key Farm.
3. **Normalize** - converts each card's rarity-relative level to an absolute 1-16 scale (`absolute = baseMax - (apiMax - apiLevel)`), so cards of different rarities can be compared and scored consistently.
4. **Persist** - upserts the snapshot with a fresh `fetched_at` timestamp.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | The four-step sync, behind the shared handler. |
| `client.ts` | Supabase service client. |

## Gotchas

- The 12-hour TTL is a database-freshness cutoff compared against `fetched_at`, not an HTTP `Cache-Control` header.
- A snapshot with an unreadable `fetched_at` is treated as expired rather than trusted, so a corrupt timestamp can never serve stale data.

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md)
- Frontend consumer: [`@features/laboratory`](../../../../Frontend-PWA/src/features/laboratory/README.md) - the upgrade planner that triggers this sync and renders the card collection
- PWA client: [`@core/api`](../../../../Frontend-PWA/src/core/api/README.md) - `ProfileClient.ts` is the specific client that calls this Edge Function
