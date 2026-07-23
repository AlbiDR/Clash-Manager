// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Headhunter (@features/headhunter)

> The scout feed: a live, scored list of clanless recruits, with one-tap dismissal and batch recruiting.

**Layer 3 (@features)** | imports `@shared`, `@core` | never another feature.

## What it does

- Shows the top prospects (windowed to the 50 highest potential), sortable by Potential, Trophies, Donations, Recency, or Name, with expandable stats benchmarked against the clan.
- Dismisses a recruit instantly with an undo toast; dismissals persist for 30 days and sync across devices (Supabase realtime) and browser tabs (BroadcastChannel).
- Harvests clanless players from the global or local leaderboard on demand and queues them for recruiting.
- Blitzes selected recruits: opens each profile in Clash Royale in sequence, and on Android taps invite automatically.
- Raises a notification and app badge when new recruits cross the score threshold.

## Contents

| Path | Role |
| :--- | :--- |
| `views/HeadhunterView.vue` | The console view and empty-state "Scan Again" action. |
| `components/RecruitCard.vue` | A recruit row: identity, potential score, expandable stats. |
| `composables/useRecruiter.ts` | The main engine: list config, manual and background sync, Blitz setup. |
| `composables/useHeadhunter.ts` | The dismissal lifecycle and realtime/broadcast sync. |
| `composables/useLeaderboardScraper.ts` | On-demand global/local leaderboard harvesting via `query-royale-api`. |
| `composables/useRecruitBlacklist.ts` | In-memory tombstones that hide a recruit between the tap and realtime confirmation. |

## How it works, and why

1. `useRecruiter` syncs the recruit pool (scored server-side in the headhunter view).
2. Recruits are filtered against local tombstones and rendered in the shared list layout.
3. Dismissing a recruit injects a tombstone, sends the Supabase request, and broadcasts to other tabs.

- **Why manual ingest?** The backend scans around the clock, but a manual trigger lets leadership force a full-pool refresh on demand.
- **Why in-memory tombstones, not LocalStorage?** A dismissed recruit must never flash back if a stale background payload arrives first. Authoritative state is the realtime subscription, so tombstones intentionally reset on reload.
- **No cross-feature imports.** Headhunter knows about recruits, not clan members; comparison against the clan happens server-side.

## See also

- [Frontend README](../../../README.md) | [`@features`](../README.md) | [`@shared/ui`](../../shared/ui/README.md)
- Backend: [`headhunter-scanner`](../../../../Backend/supabase/functions/headhunter-scanner/README.md) - the scheduled scanner that builds the recruit pool | [`query-royale-api`](../../../../Backend/supabase/functions/query-royale-api/README.md) - the on-demand leaderboard harvest triggered from this feature
- [`@core/services`](../../core/services/README.md) - `useConsoleController`, `useBlitzMode`, and `useBroadcastChannel` come from here
- [`@core/api`](../../core/api/README.md) - `RecruitClient` handles dismiss/undismiss RPCs and the realtime blacklist subscription
- [APK](../../../../APK/README.md) - Blitz Mode's automatic invite tapping is an Android-only capability implemented in the native layer
