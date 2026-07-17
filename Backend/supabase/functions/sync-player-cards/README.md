// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# User Proxy : Player Profile Sync (`sync-player-cards`)

The **User Proxy**. A specialized Deno Edge Function responsible for the high-fidelity synchronization of individual player profiles and card snapshots. It acts as an L5 Control Layer proxy to ensure data consistency between the Clash Royale API and the PWA client.

---

## Purpose
The `sync-player-cards` function provides an authenticated, safe boundary for refreshing player-specific data. It handles the complexity of rarity-relative card level normalization and implements a multi-tier caching strategy to protect the Clash Royale API from redundant requests.

## Architectural Context
- **Layer**: L5 Control Layer (Supabase Edge Function)
- **Role**: Domain-specific proxy and normalization engine.
- **Protocol**: Clinical Serve Protocol (Standardized CORS, Auth, and Telemetry).

## Core Logic & Features

### Clinical Synchronization Protocol
The function implements a strictly ordered, four-stage lifecycle:
1.  **Cache Discovery (S1)**: Checks the `features.player_card_snapshots` substrate for a valid, fresh snapshot (<12h old). Returns a standardized response on hit.
2.  **API Extraction (S2)**: On cache miss, performs an authenticated fetch from the Clash Royale API via the **Native Muscle** key rotation engine (`fetchWithRotation`).
3.  **Clinical Normalization (S3)**: Transforms relative Royale API card levels into the authoritative 1-16 absolute scale based on distance from `maxLevel`.
4.  **Substrate Persistence (S4)**: Upserts the standardized payload into the database while maintaining the 12-hour TTL boundary via the `fetched_at` column.

### High-Fidelity Normalization
The Clash Royale API provides card levels relative to their specific rarity (e.g., Rare Level 11). This engine normalizes all cards to a unified **Absolute Scale** (1-16) based on the distance from the card's maximum level, ensuring consistent performance scoring across the Roster and Laboratory features.

### Cache Strategy & TTL
To ensure system stability and API quota health, the engine enforces a **12-hour cache TTL**. This is an internal database-freshness cutoff compared against each snapshot's `fetched_at`, not an HTTP `Cache-Control` header.
- **Cache Hit**: Returns a standardized profile immediately from the database substrate without consuming API rotation slots.
- **Cache Miss**: Triggers a fresh extraction and updates the persistence layer for subsequent requests.
- **Temporal Defensive Safety**: Standardizes the parsing of snapshot `fetched_at` timestamps using the defensive `parseFetchedAt` helper. This helper wraps the `Temporal.Instant.from` call in a robust try-catch boundary and falls back to 0 epoch milliseconds on error. This treats any malformed or corrupted timestamp as an expired cache entry rather than causing a runtime crash, protecting the engine's execution lifecycle.

### Validation Boundaries
The function enforces zero-trust boundaries using strictly inferred **Valibot** schemas to validate and parse data across all ingress, egress, and database boundaries:
- **Ingress Validation**: Incoming player tags are normalized and validated against `PlayerSyncPayloadSchema`.
- **Substrate Cache Validation**: Database cached data loaded from the snapshots table is validated against an array of `PlayerCardSnapshotSchema` to prevent corrupted database records from propagating into runtime logic.
- **Egress Validation**: External Royale API payloads are validated against `RoyaleFullPlayerSchema` before processing to prevent substrate corruption.

## Integration Standards
- **Nomenclature Compliance**: Strictly adheres to domain-descriptive naming conventions, avoiding anemic variable pathogens.
- **Telemetry Reporting**: Utilizes the standard `logAudit` and `heartbeat` primitives to provide real-time visibility into the synchronization lifecycle.
- **Zero-Trust**: Enforces internal bearer token and Supabase anon key authorization via the clinical protocol.
