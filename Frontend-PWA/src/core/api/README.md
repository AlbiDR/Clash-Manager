// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/api

> The transport layer between the app and Supabase: one client, a set of domain clients, and the schemas that validate every payload.

**Layer 1 (@core)** | imports nothing above it.

## Responsibilities

- Own the Supabase client and read clan data from the feature views.
- Wrap each domain's RPCs and Edge Function calls behind a small client.
- Validate all inbound data (both REST responses and Realtime subscription payloads) and map raw rows into clean domain models.

## Contents

| File | Role |
| :--- | :--- |
| `SupabaseClient.ts` | The singleton client and `fetchRemote`, which reads the feature views in parallel and validates them. |
| `useApiState.ts` | Reactive backend availability and handshake state. |
| `VoyageClient.ts` | Clan Voyage activation, scheduling, and completion RPCs, plus summary and contribution reads. |
| `RecruitClient.ts` | Recruit dismiss/undismiss RPCs, realtime blacklist subscriptions, and direct leaderboard scouting. |
| `ProfileClient.ts` | Calls the `sync-player-cards` Edge Function for the Laboratory. |
| `MaintenanceClient.ts` | Manual backend maintenance triggers and web-push subscription registration. |
| `DataMappers.ts` | Raw Supabase rows to domain models (Voyage history, heritage tenure, score fallbacks). |
| `*Schemas.ts` | Valibot schemas per domain (`Base`, `Member`, `Recruit`, `Profile`, `Voyage`, `App`, `Offline`, `Maintenance`), aggregated by `DataSchemas.ts`. |

## Realtime Subscription & Validation Boundaries

Realtime event consumption is a critical boundary where malformed payloads could degrade system stability. To mitigate this threat:
- **Strict Realtime Validation:** The `subscribeToBlacklist` method on `RecruitClient.ts` intercepts all insertion/deletion events and subjects them to strict schema parsing using the `BlacklistEventSchema`.
- **Descriptive Error Naming:** All realtime callback execution errors must conform to CleanStack naming rules and are explicitly bound to the `realtimeSubscriptionError` parameter to avoid ambiguous or anemic names (such as `err`).
- **Resource Lifecycle Management:** Realtime subscriptions must return a clean, synchronous unsubscribe handler function that should be invoked on caller unmount to prevent lingering connection memory leaks.

## Gotchas

- Prefer reading the feature views (`roster_view`, `headhunter_view`) over building client-side joins.
- `MaintenanceClient` can register a browser `PushSubscription`, but server-side push dispatch is not implemented yet (see [settings](../../features/settings/README.md)). Local notifications and app badges do work.

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md)
- Backend: [Backend README](../../../../Backend/README.md) | [`sync-player-cards`](../../../../Backend/supabase/functions/sync-player-cards/README.md) - the Edge Function `ProfileClient.ts` calls directly
- Downstream: [`@core/services`](../services/README.md) - services consume what this layer fetches | [`@core/types`](../types/README.md) - domain models (`LeaderboardMember`, `Recruit`, `WebAppData`) used by the mappers and schemas here
