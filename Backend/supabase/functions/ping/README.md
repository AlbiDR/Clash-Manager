// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# ping

> Lightweight connectivity handshake and backend-version probe for the frontend's network diagnostics panel.

**Trigger:** on demand from the [PWA](../../../../Frontend-PWA/README.md) ([Settings](../../../../Frontend-PWA/src/features/settings/README.md) Network Diagnostics panel) | **Auth:** Supabase anon key bearer | **Persists:** nothing (`supabase: null`)

## What it does

- **Lightweight Connectivity Handshake:** Proves that the Edge runtime is responsive without depending on database availability or querying upstream Clash Royale API endpoints.
- **Backend Version Reporting:** Runs through the shared `clinicalServe` handler to return the monorepo's synchronized backend `version` in its success envelope without manual version derivation.
- **Database-Less Operation:** Passes `supabase: null` to avoid database writes. Unlike earlier revisions that inserted telemetry records and heartbeats on every probe, this probe performs zero database transactions and cannot fail due to Postgres connection pool pressure or statement latency.
- **Volume Boundary:** Bounded by IP-based rate limiting (`RATE_LIMIT_IP_MAX_REQUESTS` per `RATE_LIMIT_IP_WINDOW_MS`) to mitigate abuse while maintaining a permissive CORS policy (`corsRestricted: false`) for browser health checks.
- **Authentication:** Accepts only the public anon key as bearer credential. Unlike the game data functions, there is no privileged `INTERNAL_BEARER_TOKEN` route because health metadata is public.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | Edge Function entry point: configures `clinicalServe`, rate-limiting, and empty handler. |
| `client.ts` | Environment broker: reads `SUPABASE_ANON_KEY` directly from Deno environment without Vault sync. |
| `index.spec.ts` | Unit tests for CORS headers, rate-limiting thresholds, anon-key authorization, version payload, and database independence. |
| `client.spec.ts` | Unit tests for environment configuration fallback and key exposure boundaries. |

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md)
- Frontend client: [`@core/api`](../../../../Frontend-PWA/src/core/api/README.md) - `SupabaseClient.ts` (`ping`) and `useApiState.ts` invoke this endpoint
- Frontend UI: [`@features/settings`](../../../../Frontend-PWA/src/features/settings/README.md) - `NetworkSettings.vue` renders ping latency and backend version
