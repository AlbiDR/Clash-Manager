// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# features

> Layer 3: the four product features. Each owns its views, components, and composables. Features may import `@shared` and `@core`; they never import each other.

**Layer 3 (@features)** | may import `@shared`, `@core` | nothing may import from here except `@app`.

## Features

| Directory | What it does |
| :--- | :--- |
| [`roster/`](roster/README.md) | The leadership console: ranks every clan member by performance score, with trend charts and bulk Blitz. |
| [`headhunter/`](headhunter/README.md) | The scout feed: a live, scored list of clanless recruits with one-tap dismissal and batch recruiting. |
| [`laboratory/`](laboratory/README.md) | The upgrade planner: simulates the cheapest path to a target King Level. |
| [`settings/`](settings/README.md) | The command center: theme, preferences, Clan Voyage management, backend controls, and recovery. |

## Conventions

- No cross-feature imports. Features communicate through `@core` stores and shared state only.
- The one named exception: `RosterView` composes the shared `VoyageBanner` (a `@shared/ui` component backed by `@shared/composables`), not a Settings import.

## See also

- [Frontend README](../../README.md) | [`@shared`](../shared/README.md) | [`@core`](../core/README.md) | [`@app`](../app/README.md)
