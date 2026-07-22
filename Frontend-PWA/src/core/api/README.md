// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/api

> The transport layer between the app and Supabase: one client, a set of domain clients, and the schemas that validate every payload.

**Layer 1 (@core)** | imports nothing above it.

## Responsibilities

- Own the Supabase client and read clan data from the feature views.
- Wrap each domain's RPCs and Edge Function calls behind a small client.
- Validate all inbound data and map raw rows into clean domain models.

## Contents

| File | Role |
| :--- | :--- |
| `SupabaseClient.ts` | The singleton client and `fetchRemote`, which reads the feature views in parallel and validates them. |
| `useApiState.ts` | Reactive backend availability and handshake state. |
| `VoyageClient.ts` | Clan Voyage activation, scheduling, and completion RPCs, plus summary and contribution reads. |
| `RecruitClient.ts` | Recruit dismiss/undismiss RPCs and the realtime blacklist subscription. |
| `ProfileClient.ts` | Calls the `sync-player-cards` Edge Function for the Laboratory. |
| `MaintenanceClient.ts` | Manual backend maintenance triggers and web-push subscription registration. |
| `DataMappers.ts` | Raw Supabase rows to domain models (Voyage history, heritage tenure, score fallbacks). |
| `*Schemas.ts` | Valibot schemas per domain (`Base`, `Member`, `Recruit`, `Profile`, `Voyage`, `App`, `Offline`, `Maintenance`), aggregated by `DataSchemas.ts`. |

## Gotchas

- Prefer reading the feature views (`roster_view`, `headhunter_view`) over building client-side joins.
- `MaintenanceClient` can register a browser `PushSubscription`, but server-side push dispatch is not implemented yet (see [settings](../../features/settings/README.md)). Local notifications and app badges do work.

## See also

- [`@core`](../README.md) | [Backend Edge Functions](../../../../Backend/supabase/functions)
