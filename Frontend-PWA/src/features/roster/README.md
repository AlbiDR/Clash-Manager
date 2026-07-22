// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Roster (@features/roster)

> The leadership console: ranks every clan member by performance and shows the history behind each score.

**Layer 3 (@features)** | imports `@shared`, `@core` | never another feature. One deliberate exception: `RosterView` composes the shared `VoyageBanner` in its top slot.

## What it does

- Lists members ranked by Performance Score, sortable by Performance, Momentum, Trophies, Donations, Tenure, Name, or Last Seen, with search by name or tag.
- Expands each member to show war rate, average fame, average daily donations, and last-seen, each benchmarked against the clan average.
- Draws per-member trend charts (war and Voyage) with a best-fit line and a predicted next value.
- Supports bulk selection (including "select by score") to open or Blitz many members at once.

## The score

- **RPeS** (Raw Performance Score) is the absolute, weighted sum of a member's fame, donations, trophies, and participation.
- **PeS** (Performance Score, 0-100) normalizes RPeS against the clan's top member, so the leaderboard stays meaningful as the meta shifts. Full formula in the [root README](../../../../README.md#the-scoring-engine).

## Contents

| Path | Role |
| :--- | :--- |
| `views/RosterView.vue` | The console view; binds the roster to the shared list layout. |
| `components/MemberCard.vue` | A member row: identity, score, expandable stats, and history charts. |
| `composables/useLeaderboard.ts` | Configures the list controller (sorts, deep links, bulk selection) and bridges the clan store. |

## How it works

`useLeaderboard` observes the `members` store in `@core`, configures the shared list controller, and renders cards through progressive time-slicing. Charts and prediction come from `@shared/composables/useHistoryChart`. The Roster only reads: every persistent change goes through a `@core` API service.

## See also

- [`@features`](../) | [`@shared/ui`](../../shared/ui/README.md) | [scoring in the backend](../../../../Backend/README.md)
