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
| `SupabaseTransport.ts` | Fresh REST reads with an 8-second deadline including the body, per-view transient retries, and caller cancellation. Writes are sent once. |
| `useApiState.ts` | Reactive backend availability and handshake state. |
| `VoyageClient.ts` | Clan Voyage activation, scheduling, and completion RPCs, plus summary and contribution reads. |
| `RecruitClient.ts` | Recruit dismiss/undismiss RPCs, realtime blacklist subscriptions, and direct leaderboard scouting. |
| `ProfileClient.ts` | Calls the [`sync-player-cards`](../../../../Backend/supabase/functions/sync-player-cards/README.md) Edge Function for the [Laboratory](../../features/laboratory/README.md). |
| `MaintenanceClient.ts` | Manual backend maintenance triggers and web-push subscription registration. |
| `DataMappers.ts` | Raw Supabase rows to domain models (Voyage history, heritage tenure, score fallbacks). |
| `*Schemas.ts` | Valibot schemas per domain (`Base`, `Member`, `Recruit`, `Profile`, `Score`, `Voyage`, `App`, `Offline`, `Maintenance`), aggregated by `DataSchemas.ts`. |

## Realtime Subscription & WebAppData Validation Boundaries

Inbound data processing (REST responses, Realtime subscriptions, and IndexedDB cache hydration) represents a critical trust boundary where malformed or drifted payloads could degrade client stability:
- **Authoritative WebAppData Boundary:** `WebAppDataSchema` (`AppSchemas.ts`) serves as the authoritative Valibot validation boundary for the full application state singleton (`WebAppData`). It validates incoming remote snapshots and cached IndexedDB payloads prior to state hydration.
- **Deep Structural Parsing:** Validates `lb` against `MemberSchema` and `hh` against `RecruitSchema` to enforce item-level integrity across roster and recruit datasets, safeguarding UI components from null/undefined property deadlocks.
- **Per-View Publication Freshness:** Validates individual view publication markers (`rosterSnapshotRefreshedAt` and `headhunterSnapshotRefreshedAt`) alongside the conservative aggregate dataset `timestamp`, while preserving backward compatibility for legacy metadata (`remoteTimestamp`, `lastCompiled`, `lastFetched`).
- **Identity & Blacklist Boundaries:** Enforces string pipe formatting on optional player identity (`playerTag`) and validates recruit dismissal filter arrays (`blacklist`).
- **Strict Realtime Validation:** The `subscribeToBlacklist` method on `RecruitClient.ts` intercepts all insertion/deletion events and subjects them to strict schema parsing using `BlacklistEventSchema`.
- **Descriptive Error Naming:** All realtime callback execution errors must conform to CleanStack naming rules and are explicitly bound to the `realtimeSubscriptionError` parameter to avoid ambiguous or anemic names (such as `err`).
- **Resource Lifecycle Management:** Realtime subscriptions must return a clean, synchronous unsubscribe handler function that should be invoked on caller unmount to prevent lingering connection memory leaks.
- **Missed-Event Recovery:** Any interrupted blacklist subscription is reconciled once it rejoins, including timeout/close statuses without an error payload. Connected refusals still produce a typed error; transient socket drops do not produce a failure toast.

## Independent Source-Freshness & Diagnostic Isolation Boundaries

`SupabaseClient.ts` keeps published data, pipeline health, and client delivery as separate signals:
- **Per-View Publication Freshness:** `fetchRemote` reads the roster and headhunter snapshot markers independently. A valid `refreshed_at` dates only its matching view; the aggregate `timestamp` is the older known publication time only when both markers are valid. A missing, malformed, or seeded-null marker leaves that view unverified. Neither the pipeline heartbeat nor row ingestion timestamps substitute for publication evidence.
- **Marker/Row Association:** When a marker-backed snapshot is actually read from the server, `fetchRemote` performs one bounded marker recheck after the row reads. It caches the fetched rows only if the before and after markers match. If a refresh overlaps the read, the rows remain usable with unknown publication freshness and are not cached under the earlier generation. An unchanged in-memory snapshot cache avoids the extra recheck.
- **Client Fetch Clock Distinction:** `lastFetched` records the client's local fetch time. It proves that a fetch completed, not that a snapshot was freshly published. Cached rows remain renderable without publication proof, and `remoteTimestamp` reflects the conservative snapshot aggregate for compatibility. `lastCompiled` is not set from heartbeat data.
- **Optional Query Decoupling:** Marker reads and optional recruit blacklist reads use `resolveOptionalQuery` with an independent `OPTIONAL_METADATA_TIMEOUT_MS` (3000ms) cancellation scope. An unavailable marker degrades freshness to unknown without discarding valid rows. The blacklist can degrade only when a last-known copy is available; otherwise the sync fails rather than risk showing dismissed recruits.
- **Diagnostic Isolation Boundaries:** `fetchPipelineHealth` reads `pipeline_heartbeat_view` as pipeline health only. `fetchResourcePressure` queries `resource_health_view`. Both use independent timeout budgets to power Settings diagnostics without dating the app snapshots or blocking data hydration.
- **Independent Read Recovery:** `SupabaseTransport.ts` owns the sole retry budget: at most three retries with jittered exponential backoff. SDK-level retries are disabled so they cannot multiply that budget or replay server statement timeouts (`57014`). Each attempt has an 8-second deadline, including body consumption. The caller's signal limits the whole sync to 25 seconds. A failing roster request does not replay successful recruit reads; mutations and authorization failures are never retried.
- **Singleton Client Instantiation:** `createSupabaseClient()` memoizes one public-key client. Its `accessToken` callback returns null because this app has no Supabase user sessions, bypassing unused GoTrue initialization and browser session locks. REST requests continue using the configured publishable key.

## Gotchas

- Prefer reading the feature views (`roster_view`, `headhunter_view`) over building client-side joins.
- `MaintenanceClient` can register a browser `PushSubscription`, but server-side push dispatch is not implemented yet (see [settings](../../features/settings/README.md)). Local notifications and app badges do work.

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md)
- Backend: [Backend README](../../../../Backend/README.md) | [`sync-player-cards`](../../../../Backend/supabase/functions/sync-player-cards/README.md) - the Edge Function `ProfileClient.ts` calls directly
- Downstream: [`@core/services`](../services/README.md) - services consume what this layer fetches | [`@core/types`](../types/README.md) - domain models (`LeaderboardMember`, `Recruit`, `WebAppData`) used by the mappers and schemas here
